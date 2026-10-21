/**
 * Walk-in desk — an Admin or Super Admin registers a coach, their team and
 * their no-email players from a paper form on competition day.
 *
 * The desk is a set of steps, each of which reuses the path a coach would
 * have used themself, so the desk cannot let anything in that the coach's own
 * screens would refuse:
 *
 *   1. coach    — find by email, or create (the coach types their password
 *                 and the default player password at the desk);
 *   2. team     — the coach's team, created if they have none;
 *   3. meet     — a meet whose fee window is open now; the team is registered
 *                 for it and a DRAFT is opened;
 *   4. scan     — each page photo goes to the OCR sidecar, its rows land in
 *                 the draft (or the admin types rows in by hand);
 *   5. review   — the admin corrects every row; `check` recomputes ages,
 *                 eligible groups, squad room and duplicates on every change;
 *   6. submit   — resumable: each player is created and entered one by one,
 *                 progress written as it goes (see models/WalkInRegistration);
 *   7. pay      — the coach's own Razorpay checkout or discount code, with the
 *                 admin recorded as `recordedBy` on the transaction;
 *   8. slip     — Player IDs to hand to the coach.
 *
 * Admins act only on meets they are assigned to; a Super Admin on any.
 *
 * @module services/walk-in/walk-in.service
 */

const { NotFoundError, ValidationError, AuthorizationError, ConflictError, BusinessRuleError } = require('../../errors');
const {
  AGE_GROUPS_BY_GENDER,
  APPARATUS,
  ageCutoffYear,
  ageOnCutoff,
  lowestAgeGroup,
  eligibleAgeGroups,
} = require('../../config/cop-rules');
const { resolveFeeWindow, calculateTeamPaymentAmount } = require('../../config/payment.config');
const { mayActOnCompetition, isSuperAdmin } = require('../../utils/security/competition-access.util');
const { isCompetitionLocked, mayBypassCompetitionLock } = require('../../utils/security/competition-lock.util');
const { offeredApparatus } = require('../../utils/data/competition-apparatus.util');
const { effectiveTeamSize, isValidTeamSize } = require('../../utils/scoring/team-championship.util');
const { encrypt } = require('../../utils/security/data-encryption.util');
const { buildFormLayout, parseQrPayload } = require('../../utils/walk-in/form-layout.util');
const { renderFormPdf } = require('./form-pdf.service');

/** Names on the form are English capitals: the Player ID is built from a–z only. */
const NAME_PATTERN = /^[A-Z][A-Z' -]*[A-Z]$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CONSENT_AGE = 18;
const MAX_ROWS = 120;

const idOf = (value) => (value?._id ?? value)?.toString?.() ?? null;
const sameId = (a, b) => Boolean(a) && Boolean(b) && idOf(a) === idOf(b);

/** "AARAV  patil" → "AARAV PATIL" — what the name rule is checked against. */
const tidyName = (value) => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

/** "AARAV" → "Aarav", "D'SOUZA" → "D'Souza", "PATIL-RANE" → "Patil-Rane". */
const titleCase = (value) => tidyName(value).toLowerCase().replace(/(^|[ '-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());

/**
 * Stored names are HTML-escaped by the registration validators; a desk name
 * has to look the same or the duplicate check would not find it.
 */
const escapeName = (value) => String(value).replace(/'/g, '&#x27;');

/** "YYYY-MM-DD" → Date at UTC midnight, or null when not a real calendar date. */
function parseDate(value) {
  const match = DATE_PATTERN.exec(String(value || ''));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** DD, MM, YYYY digit strings off the paper → "YYYY-MM-DD" or ''. */
function dateFromParts(day, month, year) {
  const d = String(day || '').replace(/\D/g, '');
  const m = String(month || '').replace(/\D/g, '');
  const y = String(year || '').replace(/\D/g, '');
  if (!d || !m || y.length !== 4) return '';
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return parseDate(iso) ? iso : '';
}

class WalkInService {
  constructor({
    walkInRegistrationRepository,
    competitionRepository,
    coachRepository,
    teamRepository,
    playerRepository,
    adminRepository = null,
    authenticationService,
    coachService,
    coachPlayerService,
    auditLogRepository = null,
    ocrClient,
    config,
    logger,
  }) {
    this.drafts = walkInRegistrationRepository;
    this.competitionRepository = competitionRepository;
    this.coachRepository = coachRepository;
    this.teamRepository = teamRepository;
    this.playerRepository = playerRepository;
    this.adminRepository = adminRepository;
    this.authenticationService = authenticationService;
    this.coachService = coachService;
    this.coachPlayerService = coachPlayerService;
    this.auditLogRepository = auditLogRepository;
    this.ocr = ocrClient;
    this.config = config;
    this.logger = logger;
  }

  // ── Access ────────────────────────────────────────────────────────────────

  /**
   * The meet, after checking this admin may act on it and it is not frozen.
   * @private
   */
  async _meetFor(actor, competitionId, { write = true } = {}) {
    if (!mayActOnCompetition(actor.user, actor.userType, competitionId)) {
      throw new AuthorizationError('You are not assigned to this competition.');
    }
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) throw new NotFoundError('Competition');
    if (write && !mayBypassCompetitionLock(actor.user, actor.userType) && isCompetitionLocked(competition)) {
      throw new BusinessRuleError('This competition has ended and can no longer be changed.');
    }
    return competition;
  }

  /** @private */
  async _draftFor(actor, draftId, { write = true } = {}) {
    const draft = await this.drafts.findById(draftId);
    if (!draft) throw new NotFoundError('Walk-in registration');
    const competition = await this._meetFor(actor, draft.competition, { write });
    if (write && ['paid', 'cancelled'].includes(draft.status)) {
      throw new BusinessRuleError(`This registration is already ${draft.status}.`);
    }
    return { draft, competition };
  }

  // ── Step 3 list: meets taking entries now ────────────────────────────────

  /**
   * Meets whose fee window is open right now — the same window the coach's
   * own checkout enforces, so the desk never offers a meet it could not take
   * money for. Admins see only their own meets.
   */
  async listOpenMeets(actor, at = new Date()) {
    const all = await this.competitionRepository.find({ isDeleted: false }, { sort: { startDate: 1 } });
    return (all || [])
      .filter((meet) => mayActOnCompetition(actor.user, actor.userType, meet._id))
      .map((meet) => ({ meet, window: resolveFeeWindow(meet, at) }))
      .filter(({ window }) => window.canPay)
      .map(({ meet, window }) => ({
        _id: meet._id,
        name: meet.name,
        level: meet.level,
        place: meet.place,
        startDate: meet.startDate,
        endDate: meet.endDate,
        playerFee: meet.playerFee,
        lateFee: meet.lateFee || 0,
        feePhase: window.phase,
        isLate: window.isLate,
        lateFeePerPlayer: window.lateFeePerPlayer,
        maxTeamSize: meet.maxTeamSize || null,
        ageCutoffYear: ageCutoffYear(meet),
      }));
  }

  // ── Step 1: coach ─────────────────────────────────────────────────────────

  /** @private */
  _coachCard(coach, team) {
    return {
      _id: coach._id,
      firstName: coach.firstName,
      lastName: coach.lastName,
      email: coach.email,
      phone: coach.phone || null,
      isActive: coach.isActive !== false,
      hasDefaultPlayerPassword: Boolean(coach.playerDefaultPassword),
      team: team ? { _id: team._id, name: team.name } : null,
    };
  }

  /** @private */
  async _teamOf(coachId) {
    const [team] = await this.teamRepository.find({ coach: coachId, isActive: true }, { sort: { createdAt: -1 }, limit: 1 });
    return team || null;
  }

  /** Look a returning coach up by email. Null when there is none. */
  async findCoach(email) {
    const coach = await this.coachRepository.findByEmail(String(email || '').trim().toLowerCase(), {
      select: '+playerDefaultPassword',
    });
    if (!coach) return null;
    return this._coachCard(coach, await this._teamOf(coach._id));
  }

  /**
   * Create a coach account at the desk. The coach types both passwords
   * themself; neither is kept anywhere but on their account.
   */
  async createCoach(actor, { firstName, lastName, email, phone, password, playerDefaultPassword }) {
    const { user } = await this.authenticationService.register(
      { firstName, lastName, email, phone, password },
      'coach'
    );
    await this.coachRepository.updateById(user._id, {
      playerDefaultPassword: encrypt(playerDefaultPassword, this.config),
      playerDefaultPasswordSetAt: new Date(),
    });
    await this._audit(actor, 'WALK_IN_COACH_CREATED', 'coach', user._id, { email: user.email });
    const coach = await this.coachRepository.findById(user._id, { select: '+playerDefaultPassword' });
    return this._coachCard(coach, null);
  }

  /**
   * Set a returning coach's default player password at the desk. On their own
   * profile this needs their current password; here the coach is standing at
   * the desk and types the new one, and the admin is the second factor.
   */
  async setCoachDefaultPassword(actor, coachId, { playerDefaultPassword, phone }) {
    const coach = await this.coachRepository.findById(coachId);
    if (!coach) throw new NotFoundError('Coach');
    const updates = {
      playerDefaultPassword: encrypt(playerDefaultPassword, this.config),
      playerDefaultPasswordSetAt: new Date(),
    };
    if (phone && !coach.phone) updates.phone = phone;
    await this.coachRepository.updateById(coachId, updates);
    await this._audit(actor, 'WALK_IN_COACH_DEFAULT_PASSWORD_SET', 'coach', coachId);
    const fresh = await this.coachRepository.findById(coachId, { select: '+playerDefaultPassword' });
    return this._coachCard(fresh, await this._teamOf(coachId));
  }

  // ── Step 2: team ──────────────────────────────────────────────────────────

  async ensureTeam(actor, coachId, { name, description }) {
    const coach = await this.coachRepository.findById(coachId);
    if (!coach) throw new NotFoundError('Coach');
    const existing = await this._teamOf(coachId);
    if (existing) return { _id: existing._id, name: existing.name, created: false };
    const team = await this.coachService.createTeam(coachId, { name, ...(description ? { description } : {}) });
    await this._audit(actor, 'WALK_IN_TEAM_CREATED', 'team', team._id, { coach: String(coachId) });
    return { _id: team._id, name: team.name, created: true };
  }

  // ── Step 3: open a draft ──────────────────────────────────────────────────

  /**
   * Register the coach's team for the meet (if it is not already) and open a
   * draft — or return the coach's open draft for that meet, so a second visit
   * to the desk resumes instead of starting over.
   */
  async openDraft(actor, { competitionId, coachId }) {
    const competition = await this._meetFor(actor, competitionId);
    if (!resolveFeeWindow(competition).canPay) {
      throw new BusinessRuleError('This competition is not taking entries right now.');
    }
    const coach = await this.coachRepository.findById(coachId);
    if (!coach) throw new NotFoundError('Coach');
    const team = await this._teamOf(coachId);
    if (!team) throw new ValidationError('Create the coach\'s team first');

    const registration = (competition.registeredTeams || []).find((rt) => sameId(rt.coach, coachId));
    if (registration?.isSubmitted) {
      throw new ConflictError('This coach\'s team is already submitted and paid for this competition. Add further players from Super Admin → Add Player.');
    }
    if (!registration) {
      await this.coachService.registerTeamForCompetition(team._id, competitionId, coachId);
    }

    const [open] = await this.drafts.find(
      { competition: competitionId, coach: coachId, status: { $in: ['draft', 'submitted'] } },
      { sort: { updatedAt: -1 }, limit: 1 }
    );
    if (open) return this.view(actor, open._id);

    const draft = await this.drafts.create({
      competition: competitionId,
      coach: coachId,
      team: team._id,
      createdBy: actor.id,
    });
    await this._audit(actor, 'WALK_IN_DRAFT_OPENED', 'competition', competitionId, { coach: String(coachId), draft: String(draft._id) });
    return this.view(actor, draft._id);
  }

  /** Every unfinished draft at a meet, newest first — the desk's resume list. */
  async listDrafts(actor, competitionId) {
    await this._meetFor(actor, competitionId, { write: false });
    const drafts = await this.drafts.find(
      { competition: competitionId, status: { $in: ['draft', 'submitted'] } },
      { sort: { updatedAt: -1 }, populate: [{ path: 'coach', select: 'firstName lastName email' }, { path: 'team', select: 'name' }] }
    );
    return (drafts || []).map((d) => ({
      _id: d._id,
      status: d.status,
      coach: d.coach ? { _id: d.coach._id, name: [d.coach.firstName, d.coach.lastName].filter(Boolean).join(' '), email: d.coach.email } : null,
      team: d.team ? { _id: d.team._id, name: d.team.name } : null,
      rows: d.rows?.length || 0,
      updatedAt: d.updatedAt,
    }));
  }

  async cancelDraft(actor, draftId) {
    const { draft } = await this._draftFor(actor, draftId);
    if (draft.rows.some((row) => row.player)) {
      throw new BusinessRuleError('Players from this form are already registered; it cannot be cancelled. Finish it, or remove the players from the coach\'s entry.');
    }
    await this.drafts.updateById(draftId, { status: 'cancelled' });
    await this._audit(actor, 'WALK_IN_DRAFT_CANCELLED', 'competition', draft.competition, { draft: String(draftId) });
    return { cancelled: true };
  }

  // ── The form ──────────────────────────────────────────────────────────────

  async formPdf(actor, competitionId) {
    const competition = await this._meetFor(actor, competitionId, { write: false });
    return { pdf: await renderFormPdf(competition), name: competition.name };
  }

  // ── Step 4: OCR ───────────────────────────────────────────────────────────

  async ocrStatus() {
    return this.ocr ? this.ocr.health() : { enabled: false, healthy: false };
  }

  /**
   * Read one page photo into the draft. Rows from an earlier scan of the same
   * page are replaced (a re-take), unless their player already exists.
   *
   * @returns {Promise<{draft: Object, page: number, crops: Object}>} crops are
   *   row images keyed by draft row id, for the review screen only — never stored
   */
  async scanPage(actor, draftId, image, { pageHint } = {}) {
    const { draft, competition } = await this._draftFor(actor, draftId);
    if (draft.status !== 'draft') throw new BusinessRuleError('This form is already submitted.');
    if (!Buffer.isBuffer(image) || image.length === 0) throw new ValidationError('Attach a photo of the form page');

    const layout = buildFormLayout(competition);
    const reading = await this.ocr.readPage(image, layout.pages, { pageHint });

    const qr = parseQrPayload(reading?.qr?.text);
    if (qr && qr.competitionId !== String(competition._id)) {
      throw new BusinessRuleError('This form was printed for a different competition. Print this competition\'s form.');
    }
    const pageNo = Number(reading?.page) || qr?.page || Number(pageHint) || null;
    const page = layout.pages.find((p) => p.page === pageNo);
    if (!page) {
      throw new BusinessRuleError('Could not tell which page this is. Choose the page number and photograph it again.');
    }
    const sections = new Map(page.sections.map((s) => [s.key, s]));

    const read = (reading.rows || [])
      .filter((row) => sections.has(row.section) && !row.empty)
      .slice(0, MAX_ROWS);

    const kept = draft.rows.filter((row) => row.page !== pageNo || row.player);
    const keptKeys = new Set(kept.filter((r) => r.page === pageNo).map((r) => `${r.writtenAgeGroup}:${r.gender}:${r.rowNo}`));
    const fresh = read
      .map((row) => {
        const section = sections.get(row.section);
        const fields = row.fields || {};
        const dob = dateFromParts(fields.dobDay?.text, fields.dobMonth?.text, fields.dobYear?.text);
        const raw = [fields.dobDay?.text, fields.dobMonth?.text, fields.dobYear?.text].map((v) => v || '').join('/');
        const conf = (f) => (typeof f?.confidence === 'number' ? Math.round(f.confidence * 1000) / 1000 : undefined);
        return {
          source: 'ocr',
          page: pageNo,
          rowNo: row.rowNo,
          firstName: tidyName(fields.firstName?.text),
          lastName: tidyName(fields.lastName?.text),
          dateOfBirth: dob,
          dobRaw: dob ? '' : raw,
          gender: section.gender,
          writtenAgeGroup: section.ageGroup,
          ageGroup: section.ageGroup,
          apparatus: (row.ticks || []).filter((t) => t.checked && APPARATUS.includes(t.apparatus)).map((t) => t.apparatus),
          confidence: {
            firstName: conf(fields.firstName),
            lastName: conf(fields.lastName),
            dateOfBirth: Math.min(...['dobDay', 'dobMonth', 'dobYear'].map((k) => conf(fields[k]) ?? 1)),
          },
          _crop: row.crop || null,
        };
      })
      .filter((row) => !keptKeys.has(`${row.writtenAgeGroup}:${row.gender}:${row.rowNo}`));

    const rows = [...kept, ...fresh.map(({ _crop, ...row }) => row)];
    const scans = [...(draft.scans || []).filter((s) => s.page !== pageNo), {
      page: pageNo, pages: page.pages, at: new Date(), seconds: Number(reading.seconds) || undefined,
    }];
    const saved = await this.drafts.updateById(draftId, { rows, scans });

    // Pair each new row with its crop by position on the page.
    const crops = {};
    for (const row of saved.rows) {
      if (row.page !== pageNo) continue;
      const match = fresh.find((f) => f.rowNo === row.rowNo && f.writtenAgeGroup === row.writtenAgeGroup && f.gender === row.gender);
      if (match?._crop) crops[String(row._id)] = match._crop;
    }

    await this._audit(actor, 'WALK_IN_PAGE_SCANNED', 'competition', draft.competition, {
      draft: String(draftId), page: pageNo, rows: fresh.length,
    });
    return { draft: await this.view(actor, draftId), page: pageNo, qrRead: Boolean(qr), crops };
  }

  // ── Step 5: review ────────────────────────────────────────────────────────

  /**
   * Replace the draft's rows with the review grid's. Rows whose player already
   * exists are kept exactly as they are — the grid shows them read-only.
   */
  async saveRows(actor, draftId, { rows, guardianConsent }) {
    const { draft } = await this._draftFor(actor, draftId);
    if (draft.status !== 'draft') throw new BusinessRuleError('This form is already submitted.');
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new ValidationError(`Send between 0 and ${MAX_ROWS} rows`);

    const locked = new Map(draft.rows.filter((r) => r.player).map((r) => [String(r._id), r]));
    const next = rows.map((row) => {
      const id = row._id ? String(row._id) : null;
      if (id && locked.has(id)) return locked.get(id);
      const known = id ? draft.rows.find((r) => String(r._id) === id) : null;
      return {
        ...(known ? { _id: known._id } : {}),
        source: known?.source || 'manual',
        page: known?.page ?? null,
        rowNo: known?.rowNo ?? null,
        confidence: known?.confidence,
        writtenAgeGroup: known?.writtenAgeGroup ?? (row.ageGroup || null),
        firstName: tidyName(row.firstName),
        lastName: tidyName(row.lastName),
        dateOfBirth: String(row.dateOfBirth || '').trim(),
        dobRaw: known?.dobRaw || '',
        gender: AGE_GROUPS_BY_GENDER[row.gender] ? row.gender : null,
        ageGroup: row.ageGroup || null,
        apparatus: (Array.isArray(row.apparatus) ? row.apparatus : []).filter((a) => APPARATUS.includes(a)),
        confirmDuplicate: row.confirmDuplicate === true,
      };
    });
    // A locked row the client dropped is put back: it cannot be un-registered from here.
    for (const [id, row] of locked) if (!next.some((r) => String(r._id) === id)) next.push(row);

    await this.drafts.updateById(draftId, {
      rows: next,
      ...(typeof guardianConsent === 'boolean' ? { guardianConsent } : {}),
    });
    return this.view(actor, draftId);
  }

  /**
   * The draft as the desk shows it: every row with its age, the groups it may
   * enter, and what is wrong with it.
   */
  async view(actor, draftId) {
    const draft = await this.drafts.findById(draftId, {
      populate: [
        { path: 'coach', select: 'firstName lastName email phone' },
        { path: 'team', select: 'name' },
      ],
    });
    if (!draft) throw new NotFoundError('Walk-in registration');
    const competition = await this._meetFor(actor, draft.competition, { write: false });
    const checked = await this._check(draft, competition);
    const registration = (competition.registeredTeams || []).find((rt) => sameId(rt.coach, draft.coach));
    const window = resolveFeeWindow(competition);

    return {
      _id: draft._id,
      status: draft.status,
      guardianConsent: draft.guardianConsent,
      coach: draft.coach ? {
        _id: draft.coach._id,
        name: [draft.coach.firstName, draft.coach.lastName].filter(Boolean).join(' '),
        email: draft.coach.email,
        phone: draft.coach.phone || null,
      } : null,
      team: draft.team ? { _id: draft.team._id, name: draft.team.name } : null,
      competition: {
        _id: competition._id,
        name: competition.name,
        place: competition.place,
        startDate: competition.startDate,
        endDate: competition.endDate,
        ageCutoffYear: checked.cutoffYear,
        maxTeamSize: competition.maxTeamSize || null,
        playerFee: competition.playerFee,
        feePhase: window.phase,
        lateFeePerPlayer: window.lateFeePerPlayer,
        sections: checked.sections,
        formPages: buildFormLayout(competition).pages.map((p) => ({
          page: p.page,
          sections: p.sections.map((s) => s.key),
        })),
      },
      scans: draft.scans || [],
      rows: checked.rows,
      blocking: checked.blocking,
      registration: registration ? {
        players: registration.players?.length || 0,
        isSubmitted: Boolean(registration.isSubmitted),
        paymentStatus: registration.paymentStatus,
        paymentAmount: registration.paymentAmount ?? null,
        paymentId: registration.paymentId || null,
        amountDue: registration.isSubmitted ? 0 : calculateTeamPaymentAmount(registration.players || [], competition),
      } : null,
      submittedAt: draft.submittedAt || null,
      paidAt: draft.paidAt || null,
    };
  }

  /**
   * Every rule a row must pass, in one place, used by `view` and `submit`.
   * @private
   */
  async _check(draft, competition) {
    const cutoffYear = ageCutoffYear(competition);
    const types = competition.competitionTypes?.length ? competition.competitionTypes : ['competition_1'];
    const configured = (competition.ageGroups || []).map((g) => `${g.gender}:${g.ageGroup}`);
    const offeredGroups = (gender) => (AGE_GROUPS_BY_GENDER[gender] || [])
      .filter((group) => configured.length === 0 || configured.includes(`${gender}:${group}`));
    const offeredApp = (gender) => [...new Set(types.flatMap((t) => offeredApparatus(competition, t, gender)))];

    const sections = ['Male', 'Female'].map((gender) => ({
      gender, ageGroups: offeredGroups(gender), apparatus: offeredApp(gender),
    }));

    const registration = (competition.registeredTeams || []).find((rt) => sameId(rt.coach, draft.coach));
    const entries = registration?.players || [];
    const cap = isValidTeamSize(competition.maxTeamSize) ? Number(competition.maxTeamSize) : null;

    // Same name + DOB already on the books?
    const teamPlayers = await this.playerRepository.find({ team: idOf(draft.team) }, { select: 'firstName lastName dateOfBirth loginId' });
    const duplicateKeys = new Map();
    const rows = [];
    let blocking = 0;
    const squadCount = new Map();
    for (const entry of entries) {
      const key = `${entry.gender}:${entry.ageGroup}`;
      squadCount.set(key, (squadCount.get(key) || 0) + 1);
    }

    for (const row of draft.rows || []) {
      const issues = [];
      const add = (field, level, message) => issues.push({ field, level, message });
      const firstName = tidyName(row.firstName);
      const lastName = tidyName(row.lastName);
      const dob = parseDate(row.dateOfBirth);
      const age = dob ? ageOnCutoff(dob, cutoffYear) : null;
      const gender = AGE_GROUPS_BY_GENDER[row.gender] ? row.gender : null;
      const lowest = gender && age !== null ? lowestAgeGroup(age, gender) : null;
      const eligible = gender && age !== null ? eligibleAgeGroups(age, gender, offeredGroups(gender)) : [];

      if (!row.player) {
        for (const [field, value] of [['firstName', firstName], ['lastName', lastName]]) {
          if (!value) add(field, 'error', 'Required');
          else if (value.length < 2 || value.length > 50) add(field, 'error', 'Must be 2 to 50 letters');
          else if (!NAME_PATTERN.test(value)) add(field, 'error', 'English letters A–Z only (space, hyphen and apostrophe allowed)');
        }
        if (!row.dateOfBirth) add('dateOfBirth', 'error', row.dobRaw ? `Could not read "${row.dobRaw}" as a date` : 'Required');
        else if (!dob) add('dateOfBirth', 'error', 'Not a real date');
        else if (dob > new Date()) add('dateOfBirth', 'error', 'Date of birth is in the future');
        else if (age !== null && age < 3) add('dateOfBirth', 'error', `Player would be ${age} — check the year`);

        if (!gender) add('gender', 'error', 'Required');

        if (gender && age !== null && age >= 0) {
          if (!lowest) add('ageGroup', 'error', 'No age group fits this player');
          else if (eligible.length === 0) add('ageGroup', 'error', 'This competition runs no age group this player may enter');
          else if (!row.ageGroup) add('ageGroup', 'error', 'Choose an age group');
          else if (!offeredGroups(gender).includes(row.ageGroup)) add('ageGroup', 'error', 'This competition does not run that age group');
          else if (!eligible.includes(row.ageGroup)) add('ageGroup', 'error', `Too old for ${row.ageGroup} — choose ${eligible[0]} or higher`);
          else if (row.ageGroup !== lowest) add('ageGroup', 'info', 'Playing up — COP: cannot return to a lower age group later.');
          if (row.writtenAgeGroup && row.ageGroup === row.writtenAgeGroup && !eligible.includes(row.writtenAgeGroup)) {
            // already reported above; nothing moves silently
          }
        }

        const offered = gender ? offeredApp(gender) : [];
        const chosen = row.apparatus || [];
        if (offered.length > 0 && chosen.length === 0) add('apparatus', 'error', 'Tick at least one apparatus');
        const notOffered = chosen.filter((a) => !offered.includes(a));
        if (gender && notOffered.length) add('apparatus', 'error', `Not offered for ${gender === 'Male' ? 'boys' : 'girls'}: ${notOffered.join(', ')}`);

        if (gender && row.ageGroup && cap) {
          const key = `${gender}:${row.ageGroup}`;
          const count = (squadCount.get(key) || 0) + 1;
          squadCount.set(key, count);
          if (count > cap) add('ageGroup', 'error', `Squad full: at most ${cap} per age group`);
        }

        if (firstName && lastName && dob) {
          const key = `${firstName}|${lastName}|${row.dateOfBirth}`;
          if (duplicateKeys.has(key)) add('firstName', 'error', `Same player as row ${duplicateKeys.get(key)} on this form`);
          else duplicateKeys.set(key, rows.length + 1);

          const onTeam = (teamPlayers || []).find((p) => tidyName(p.firstName).replace(/&#X27;/g, "'") === firstName
            && tidyName(p.lastName).replace(/&#X27;/g, "'") === lastName
            && p.dateOfBirth && new Date(p.dateOfBirth).toISOString().slice(0, 10) === row.dateOfBirth);
          if (onTeam) {
            const alreadyEntered = entries.some((e) => sameId(e.player, onTeam._id));
            if (alreadyEntered) add('firstName', 'error', `Already entered in this competition (${onTeam.loginId})`);
            else add('firstName', 'info', `Already on this team — will use Player ID ${onTeam.loginId}`);
          } else {
            const elsewhere = await this.coachPlayerService._findSamePerson(escapeName(titleCase(firstName)), escapeName(titleCase(lastName)), dob);
            if (elsewhere.length > 0 && !row.confirmDuplicate) {
              add('firstName', 'error', `A player with this name and date of birth exists (${elsewhere.map((m) => `${m.loginId}${m.team ? `, ${m.team}` : ''}`).join('; ')}). Confirm it is a different child to continue.`);
            } else if (elsewhere.length > 0) {
              add('firstName', 'warning', 'Confirmed as a different child from the existing player with this name and date of birth');
            }
          }
        }
      }

      const errors = issues.filter((i) => i.level === 'error').length;
      blocking += errors;
      rows.push({
        _id: row._id,
        source: row.source,
        page: row.page ?? null,
        rowNo: row.rowNo ?? null,
        firstName,
        lastName,
        dateOfBirth: row.dateOfBirth || '',
        dobRaw: row.dobRaw || '',
        gender,
        writtenAgeGroup: row.writtenAgeGroup || null,
        ageGroup: row.ageGroup || null,
        apparatus: row.apparatus || [],
        confidence: row.confidence || {},
        confirmDuplicate: Boolean(row.confirmDuplicate),
        age,
        lowestAgeGroup: lowest,
        eligibleAgeGroups: eligible,
        player: row.player || null,
        loginId: row.loginId || null,
        entered: Boolean(row.entered),
        issues,
      });
    }

    const needsConsent = rows.some((r) => !r.player && r.dateOfBirth && parseDate(r.dateOfBirth)
      && (Date.now() - parseDate(r.dateOfBirth).getTime()) < CONSENT_AGE * 365.25 * 24 * 3600 * 1000);
    if (needsConsent && !draft.guardianConsent) blocking += 1;

    return { cutoffYear, sections, rows, blocking, needsConsent };
  }

  // ── Step 6: submit ────────────────────────────────────────────────────────

  /**
   * Create and enter every player, one at a time, writing progress as it goes.
   * Safe to call again after any failure: rows that already have a player or
   * an entry are skipped.
   */
  async submit(actor, draftId) {
    const { draft, competition } = await this._draftFor(actor, draftId);
    if (draft.status === 'submitted') return this.view(actor, draftId);
    if (!draft.rows.length) throw new ValidationError('There are no players on this form');

    const checked = await this._check(draft, competition);
    if (checked.needsConsent && !draft.guardianConsent) {
      throw new BusinessRuleError('Confirm that a parent or guardian agreed for every player under 18', { reason: 'GUARDIAN_CONSENT' });
    }
    if (checked.blocking > 0) {
      throw new BusinessRuleError('Fix the rows marked in red first', { reason: 'ROWS_INVALID', rows: checked.rows.filter((r) => r.issues.some((i) => i.level === 'error')).map((r) => String(r._id)) });
    }
    const registration = (competition.registeredTeams || []).find((rt) => sameId(rt.coach, draft.coach));
    if (registration?.isSubmitted) throw new ConflictError('This coach\'s team is already submitted for this competition.');

    const locked = await this.drafts.acquireSubmitLock(draftId);
    if (!locked) throw new ConflictError('This form is being submitted from another screen. Wait a moment and refresh.');

    const coachId = idOf(draft.coach);
    try {
      const teamPlayers = await this.playerRepository.find({ team: idOf(draft.team) }, { select: 'firstName lastName dateOfBirth loginId' });
      for (const row of locked.rows) {
        let playerId = row.player;
        let loginId = row.loginId;

        if (!playerId) {
          const first = titleCase(row.firstName);
          const last = titleCase(row.lastName);
          const reuse = (teamPlayers || []).find((p) => tidyName(p.firstName).replace(/&#X27;/g, "'") === tidyName(row.firstName)
            && tidyName(p.lastName).replace(/&#X27;/g, "'") === tidyName(row.lastName)
            && p.dateOfBirth && new Date(p.dateOfBirth).toISOString().slice(0, 10) === row.dateOfBirth);
          if (reuse) {
            playerId = reuse._id;
            loginId = reuse.loginId;
          } else {
            const { player } = await this.coachPlayerService.registerPlayer(coachId, {
              firstName: escapeName(first),
              lastName: escapeName(last),
              dateOfBirth: parseDate(row.dateOfBirth),
              gender: row.gender,
              guardianConsent: draft.guardianConsent,
              // The desk ran its own duplicate check, with the admin's answer.
              confirmDuplicate: true,
            });
            playerId = player._id;
            loginId = player.loginId;
          }
          await this.drafts.updateRow(draftId, row._id, { player: playerId, loginId });
        }

        if (!row.entered) {
          await this.coachService.addPlayerToAgeGroup(coachId, idOf(draft.competition), {
            playerId: String(playerId),
            ageGroup: row.ageGroup,
            gender: row.gender,
            apparatus: row.apparatus,
          });
          await this.drafts.updateRow(draftId, row._id, { entered: true });
        }
      }

      await this.drafts.updateById(draftId, { status: 'submitted', submittedAt: new Date() });
      await this._audit(actor, 'WALK_IN_SUBMITTED', 'competition', draft.competition, {
        draft: String(draftId), coach: coachId, players: locked.rows.length,
      });
    } finally {
      await this.drafts.releaseSubmitLock(draftId);
    }
    return this.view(actor, draftId);
  }

  // ── Step 7: payment (the coach's own checkout, taken by the admin) ───────

  /** @private */
  async _payable(actor, draftId) {
    const { draft } = await this._draftFor(actor, draftId);
    if (draft.status !== 'submitted') throw new BusinessRuleError('Submit the form before taking payment.');
    return { draft, coachId: idOf(draft.coach), competitionId: idOf(draft.competition) };
  }

  async createPaymentOrder(actor, draftId) {
    const { coachId, competitionId } = await this._payable(actor, draftId);
    return this.coachService.createTeamPaymentOrder(coachId, competitionId, { recordedBy: actor.id });
  }

  async verifyPayment(actor, draftId, payload) {
    const { coachId, competitionId } = await this._payable(actor, draftId);
    const result = await this.coachService.verifyTeamPaymentAndSubmit(coachId, competitionId, payload, { recordedBy: actor.id });
    await this._markPaid(actor, draftId, 'razorpay');
    return { ...result, draft: await this.view(actor, draftId) };
  }

  async quoteDiscount(actor, draftId, discountCode) {
    const { coachId, competitionId } = await this._payable(actor, draftId);
    return this.coachService.quoteTeamPaymentWithDiscount(coachId, competitionId, discountCode);
  }

  async redeemDiscount(actor, draftId, discountCode) {
    const { coachId, competitionId } = await this._payable(actor, draftId);
    const result = await this.coachService.redeemDiscountAndSubmit(coachId, competitionId, discountCode, { recordedBy: actor.id });
    await this._markPaid(actor, draftId, 'discount');
    return { ...result, draft: await this.view(actor, draftId) };
  }

  /** @private */
  async _markPaid(actor, draftId, method) {
    await this.drafts.updateById(draftId, { status: 'paid', paidAt: new Date() });
    const draft = await this.drafts.findById(draftId);
    await this._audit(actor, 'WALK_IN_PAID', 'competition', draft.competition, { draft: String(draftId), method });
  }

  // ── Step 8: slip ──────────────────────────────────────────────────────────

  async slip(actor, draftId) {
    const view = await this.view(actor, draftId);
    return {
      competition: { name: view.competition.name, place: view.competition.place, startDate: view.competition.startDate },
      coach: view.coach,
      team: view.team,
      status: view.status,
      payment: view.registration ? {
        status: view.registration.paymentStatus,
        amount: view.registration.paymentAmount,
        paymentId: view.registration.paymentId,
      } : null,
      paidAt: view.paidAt,
      players: view.rows.filter((r) => r.player).map((r) => ({
        name: `${titleCase(r.firstName)} ${titleCase(r.lastName)}`,
        loginId: r.loginId,
        gender: r.gender,
        ageGroup: r.ageGroup,
        apparatus: r.apparatus,
        dateOfBirth: r.dateOfBirth,
      })),
    };
  }

  /** @private */
  async _audit(actor, action, resource, resourceId, details = {}) {
    try {
      await this.auditLogRepository?.logAction?.({
        adminId: actor.id,
        adminType: isSuperAdmin(actor.user, actor.userType) ? 'superadmin' : 'admin',
        action,
        resource,
        resourceId: String(resourceId),
        details,
      });
    } catch (error) {
      this.logger?.error?.('Could not write the walk-in audit log', { error: error.message, action });
    }
  }
}

module.exports = WalkInService;
module.exports.dateFromParts = dateFromParts;
module.exports.titleCase = titleCase;
module.exports.parseDate = parseDate;
module.exports.NAME_PATTERN = NAME_PATTERN;
