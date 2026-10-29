/**
 * Competition I → II / III, automatically (docs/qualification-plan.md).
 *
 * Called whenever a Competition I score is saved, locked or unlocked, or a
 * Competition I lucky draw is recorded or cleared. It recomputes the finals
 * that category feeds:
 *
 *  - every Competition III final of that gender + age group (one per apparatus
 *    the meet runs in Competition III for the gender);
 *  - the gender's Competition II final (that age group's slice).
 *
 * A final takes players only from Competition I scores that are PUBLISHED —
 * saved and locked by the Senior Judge and the Scorer, the same moment the
 * public board shows them — and only once every team entered on that apparatus
 * in that category has locked. Until then it is `waiting`.
 *
 * The result is stored in Qualification documents (the source of truth) and
 * written into each qualifier's squad entry as their Competition II / III
 * apparatus — the engine owns those two keys of the entry since coaches no
 * longer choose them — so panels, the lot draw, the judges' and Scorer's sheets
 * and the public board pick the finalists up through their existing paths.
 *
 * Once a final's first score exists it is frozen: a later Competition I
 * correction marks it stale (the admin is warned) but changes nobody.
 *
 * Meets marked `legacyFinals` (scored before this existed) are left alone.
 *
 * @module services/scoring/qualification.service
 */

const { NotFoundError, BusinessRuleError, ValidationError } = require('../../errors');
const { ALL_AGES, apparatusKey, toCompetitionTypeDisplay } = require('../../config/cop-rules');
const { offeredApparatus } = require('../../utils/data/competition-apparatus.util');
const { apparatusList, toCanonicalApparatus } = require('../../utils/data/apparatus.util');
const { isSubmittedRegistration } = require('../../utils/data/team-visibility.util');
const { publishedPlayerScores } = require('../../utils/scoring/published-score.util');
const { calculateIndividualRankings } = require('../../utils/scoring/ranking.util');
const { apparatusFinal, allRoundAgeGroup, sameQualifiers } = require('../../utils/scoring/qualification.util');

const idOf = (value) => (value?._id ?? value)?.toString?.() ?? null;
const sameId = (a, b) => Boolean(a) && Boolean(b) && idOf(a) === idOf(b);
const groupLabel = (g) => (g === ALL_AGES ? 'All ages' : String(g || '').replace(/^(Under|Above)(\d+)$/, '$1 $2'));
const genderWord = (g) => (g === 'Male' ? 'Boys' : 'Girls');
const shortApparatus = (a) => String(a || '').replace(' Mallakhamb', '');

/** "Competition III — Boys Under 14 · Pole", "Competition II — Girls All ages". */
function finalLabel(doc) {
  const type = doc.competitionType === 'competition_2' ? 'Competition II (All Round)' : 'Competition III (Apparatus)';
  return `${type} — ${genderWord(doc.gender)} ${groupLabel(doc.ageGroup)}${doc.apparatus ? ` · ${shortApparatus(doc.apparatus)}` : ''}`;
}

class QualificationService {
  constructor({ qualificationRepository, competitionRepository, scoreRepository, tieBreakDrawRepository, teamRepository, otpService = null, logger }) {
    this.qualifications = qualificationRepository;
    this.competitions = competitionRepository;
    this.scores = scoreRepository;
    this.draws = tieBreakDrawRepository;
    this.teams = teamRepository;
    this.otpService = otpService;
    this.logger = logger;
  }

  /** Does this meet run automatic finals at all? */
  _runsFinals(competition) {
    if (!competition || competition.legacyFinals) return false;
    const types = competition.competitionTypes || [];
    return types.includes('competition_2') || types.includes('competition_3');
  }

  /** The meet's age groups for a gender, in COP order. */
  _ageGroups(competition, gender) {
    return (competition.ageGroups || []).filter((g) => g.gender === gender).map((g) => g.ageGroup);
  }

  /**
   * After any Competition I change in one category. Never throws: a failure is
   * logged and the next change tries again (scores must save regardless).
   */
  async onCompetitionOneChange(competitionId, gender, ageGroup) {
    try {
      const competition = await this.competitions.findById(competitionId);
      if (!this._runsFinals(competition)) return;
      const genders = gender ? [gender] : ['Male', 'Female'];
      for (const g of genders) {
        const groups = ageGroup ? [ageGroup] : this._ageGroups(competition, g);
        for (const group of groups) await this._recomputeCategory(competition, g, group);
        if ((competition.competitionTypes || []).includes('competition_2')) await this._recomputeAllRound(competition, g);
        await this._syncEntries(competitionId, g);
      }
    } catch (error) {
      this.logger?.error?.('Qualification recompute failed', { competitionId, gender, ageGroup, error: error.message });
    }
  }

  /**
   * A Competition II / III score was saved: the final has started, so its list
   * is frozen from now on. Cheap and idempotent.
   */
  async markStarted(competitionId, competitionType, gender, ageGroup, apparatus = []) {
    if (!['competition_2', 'competition_3'].includes(competitionType)) return;
    try {
      // A Competition III final is one apparatus: only the ones scored start.
      const which = competitionType === 'competition_3' && apparatus.length ? { apparatus: { $in: apparatus } } : {};
      await this.qualifications.model.updateMany(
        { competition: competitionId, competitionType, gender, ageGroup, frozenAt: null, ...which },
        { $set: { frozenAt: new Date() } }
      );
    } catch (error) {
      this.logger?.error?.('Could not mark a final started', { competitionId, error: error.message });
    }
  }

  /** Every final of a meet, from scratch (admin "recompute", migration, tests). */
  async recomputeAll(competitionId) {
    await this.onCompetitionOneChange(competitionId, null, null);
    return this.list(competitionId);
  }

  // ── Inputs ──────────────────────────────────────────────────────────────

  /**
   * Published Competition I rows of one category, by apparatus, and which
   * apparatus are completely locked (every team entered on it has locked).
   * @private
   */
  async _categoryInputs(competition, gender, ageGroup) {
    const docs = await this.scores.find({
      competition: competition._id, gender, ageGroup, competitionType: toCompetitionTypeDisplay('competition_1'),
    }) || [];
    const rowsByApparatus = {};
    const lockedTeams = new Map(); // apparatus → Set(team)
    for (const doc of docs) {
      const team = idOf(doc.teamId);
      const locked = doc.isLocked ? null : new Set((doc.lockedApparatus || []).map(apparatusKey));
      for (const row of publishedPlayerScores(doc)) {
        const key = apparatusKey(row.apparatus);
        (rowsByApparatus[key] ||= []).push({ ...(row.toObject?.() || row), teamId: team });
      }
      for (const key of offeredApparatus(competition, 'competition_1', gender).map(apparatusKey)) {
        if (doc.isLocked || locked.has(key)) {
          if (!lockedTeams.has(key)) lockedTeams.set(key, new Set());
          lockedTeams.get(key).add(team);
        }
      }
    }

    // Who has to lock: every submitted team with an entry on that apparatus here.
    const expected = new Map(); // apparatus → Map(team → name)
    for (const rt of (competition.registeredTeams || []).filter(isSubmittedRegistration)) {
      for (const entry of rt.players || []) {
        if (entry.gender !== gender || entry.ageGroup !== ageGroup) continue;
        for (const name of apparatusList(entry.apparatus, 'competition_1')) {
          const key = apparatusKey(name);
          if (!expected.has(key)) expected.set(key, new Set());
          expected.get(key).add(idOf(rt.team));
        }
      }
    }

    const missing = {};
    for (const [key, teams] of expected) {
      const done = lockedTeams.get(key) || new Set();
      missing[key] = [...teams].filter((t) => !done.has(t));
    }
    return { rowsByApparatus, expected, missing };
  }

  /** @private */
  async _teamNames(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const teams = await this.teams.find({ _id: { $in: unique } }, { select: 'name coach' });
    return new Map((teams || []).map((t) => [String(t._id), t]));
  }

  /** Has the final started (any score saved in it)? @private */
  async _started(competitionId, competitionType, gender, ageGroup, apparatus) {
    const docs = await this.scores.find({
      competition: competitionId, gender, ageGroup, competitionType: toCompetitionTypeDisplay(competitionType),
    }, { select: 'playerScores.apparatus playerScores.isFinalized playerScores.judgeScores' }) || [];
    return docs.some((doc) => (doc.playerScores || []).some((row) => !apparatus || apparatusKey(row.apparatus) === apparatusKey(apparatus)));
  }

  // ── Competition III ─────────────────────────────────────────────────────

  /** @private */
  async _recomputeCategory(competition, gender, ageGroup) {
    if (!(competition.competitionTypes || []).includes('competition_3')) return;
    const finals = offeredApparatus(competition, 'competition_3', gender);
    if (!finals.length) return;
    const inputs = await this._categoryInputs(competition, gender, ageGroup);
    const names = await this._teamNames(Object.values(inputs.missing).flat());

    for (const apparatus of finals) {
      const key = apparatusKey(apparatus);
      const identity = { competition: competition._id, competitionType: 'competition_3', gender, ageGroup, apparatus };
      const existing = await this.qualifications.findOne(identity);
      const withdrawn = new Set((existing?.withdrawn || []).map((w) => idOf(w.player)));
      const missing = inputs.missing[key] || [];
      let next;
      if (!inputs.expected.has(key)) {
        next = { status: 'waiting', qualifiers: [], tied: [], skipped: [], waitingFor: ['Nobody is entered on this apparatus in Competition I'] };
      } else if (missing.length) {
        next = {
          status: 'waiting', qualifiers: [], tied: [], skipped: [],
          waitingFor: missing.map((t) => `${names.get(t)?.name || 'A team'}: Competition I ${shortApparatus(apparatus)} not locked yet`),
        };
      } else {
        const draws = await this.draws.find({
          competition: competition._id, gender, ageGroup, competitionType: 'competition_1', apparatus,
        }) || [];
        const ranked = calculateIndividualRankings(inputs.rowsByApparatus[key] || [], 'Competition I', { draws });
        const result = apparatusFinal(ranked, { withdrawn });
        next = {
          status: result.status === 'waiting_draw' ? 'waiting_draw' : 'set',
          qualifiers: result.qualifiers.map((q) => this._person(q, ageGroup, existing)),
          tied: result.tied.map((q) => this._person(q, ageGroup)),
          skipped: result.skipped.map((q) => ({ ...this._person(q, ageGroup), reason: q.reason })),
          waitingFor: result.status === 'waiting_draw'
            ? [`A tie at the last place in Competition I ${shortApparatus(apparatus)}: record the lucky draw (Scores tab)`]
            : [],
        };
      }
      await this._store(identity, existing, next);
    }
  }

  /** @private */
  _person(q, ageGroup, existing = null) {
    const before = (existing?.qualifiers || []).find((p) => sameId(p.player, q.playerId));
    const wasReplacement = Boolean(existing?.withdrawn?.length) && !before && Boolean(existing?.computedAt);
    return {
      player: q.playerId, team: q.teamId, playerName: q.playerName, rank: q.rank, score: q.score, sourceAgeGroup: ageGroup,
      ...(existing ? { replacement: before ? Boolean(before.replacement) : wasReplacement } : {}),
    };
  }

  // ── Competition II ──────────────────────────────────────────────────────

  /** @private */
  async _recomputeAllRound(competition, gender) {
    const identity = { competition: competition._id, competitionType: 'competition_2', gender, ageGroup: ALL_AGES, apparatus: null };
    const existing = await this.qualifications.findOne(identity);
    const withdrawn = new Set((existing?.withdrawn || []).map((w) => idOf(w.player)));
    const apparatusOfGender = offeredApparatus(competition, 'competition_1', gender);
    const slices = [];
    const qualifiers = [];
    const tied = [];
    const skipped = [];
    const waitingFor = [];

    for (const ageGroup of this._ageGroups(competition, gender)) {
      const inputs = await this._categoryInputs(competition, gender, ageGroup);
      const blocking = Object.entries(inputs.missing).filter(([, teams]) => teams.length);
      if (!inputs.expected.size) continue; // nobody entered in this age group
      if (blocking.length) {
        const names = await this._teamNames(blocking.flatMap(([, t]) => t));
        const reasons = blocking.flatMap(([key, teams]) => teams.map((t) => `${groupLabel(ageGroup)}: ${names.get(t)?.name || 'a team'} has not locked Competition I ${shortApparatus(key)}`));
        slices.push({ ageGroup, status: 'waiting', waitingFor: reasons });
        waitingFor.push(...reasons);
        continue;
      }
      const rows = {};
      for (const name of apparatusOfGender) rows[apparatusKey(name)] = inputs.rowsByApparatus[apparatusKey(name)] || [];
      const drawOrder = ((existing?.drawOrders || []).find((d) => d.ageGroup === ageGroup)?.order || []).map(idOf);
      const result = allRoundAgeGroup(rows, { withdrawn, drawOrder });
      slices.push({
        ageGroup,
        status: result.status === 'waiting_draw' ? 'waiting_draw' : 'set',
        waitingFor: result.status === 'waiting_draw' ? [`${groupLabel(ageGroup)}: a tie for the last place — record the draw on this final`] : [],
      });
      if (result.status === 'waiting_draw') waitingFor.push(`${groupLabel(ageGroup)}: a tie for the last place — record the draw on this final`);
      qualifiers.push(...result.qualifiers.map((q) => this._person(q, ageGroup, existing)));
      tied.push(...result.tied.map((q) => this._person(q, ageGroup)));
      skipped.push(...result.skipped.map((q) => ({ ...this._person(q, ageGroup), reason: q.reason })));
    }

    const status = slices.length && slices.every((s) => s.status === 'set') ? 'set'
      : slices.some((s) => s.status === 'waiting_draw') ? 'waiting_draw' : 'waiting';
    await this._store(identity, existing, { status, qualifiers, tied, skipped, slices, waitingFor });
  }

  // ── Storing, freezing, telling the coach ───────────────────────────────

  /** @private */
  async _store(identity, existing, next) {
    const started = await this._started(identity.competition, identity.competitionType, identity.gender, identity.ageGroup, identity.apparatus);
    if (started) {
      // Frozen: the list stays; a different result only warns the admin.
      const changed = !sameQualifiers(
        (existing?.qualifiers || []).map((q) => ({ playerId: idOf(q.player) })),
        next.qualifiers.map((q) => ({ playerId: idOf(q.player) }))
      );
      await this.qualifications.upsertFinal(identity, {
        frozenAt: existing?.frozenAt || new Date(),
        staleSince: changed ? (existing?.staleSince || new Date()) : null,
        staleNote: changed ? 'A Competition I correction would change who qualified, but this final has already started.' : '',
      });
      return;
    }
    const saved = await this.qualifications.upsertFinal(identity, { ...next, computedAt: new Date(), frozenAt: null, staleSince: null, staleNote: '' });
    await this._tellCoaches(saved, existing);
  }

  /** Email each coach whose player newly qualified (once per change). @private */
  async _tellCoaches(saved, existing) {
    if (!this.otpService?.notifyCoachOfQualifiers || saved.status === 'waiting') return;
    const before = new Set((existing?.qualifiers || []).map((q) => idOf(q.player)));
    const added = (saved.qualifiers || []).filter((q) => !before.has(idOf(q.player)));
    if (!added.length) return;
    const teams = await this._teamNames(added.map((q) => idOf(q.team)));
    const byCoach = new Map();
    for (const q of added) {
      const team = teams.get(idOf(q.team));
      if (!team?.coach) continue;
      const key = idOf(team.coach);
      if (!byCoach.has(key)) byCoach.set(key, { teamName: team.name, players: [] });
      byCoach.get(key).players.push({ name: q.playerName, replacement: Boolean(q.replacement) });
    }
    const competition = await this.competitions.findById(saved.competition, { select: 'name' });
    for (const [coachId, info] of byCoach) {
      this.otpService.notifyCoachOfQualifiers({
        coachId, competitionName: competition?.name || 'the competition', finalLabel: finalLabel(saved), ...info,
      });
    }
  }

  /**
   * Write each player's Competition II / III apparatus from the finals of one
   * gender. Only entries whose value actually changes are written.
   * @private
   */
  async _syncEntries(competitionId, gender) {
    const competition = await this.competitions.findById(competitionId);
    const docs = await this.qualifications.find({ competition: competitionId, gender }) || [];
    const ii = docs.find((d) => d.competitionType === 'competition_2');
    const allRound = new Set((ii?.qualifiers || []).map((q) => idOf(q.player)));
    const iiApparatus = offeredApparatus(competition, 'competition_2', gender);
    const apparatusOf = new Map(); // player → [III apparatus]
    for (const doc of docs.filter((d) => d.competitionType === 'competition_3')) {
      for (const q of doc.qualifiers || []) {
        const id = idOf(q.player);
        if (!apparatusOf.has(id)) apparatusOf.set(id, []);
        apparatusOf.get(id).push(doc.apparatus);
      }
    }
    const types = competition.competitionTypes || [];
    for (const rt of (competition.registeredTeams || []).filter(isSubmittedRegistration)) {
      for (const entry of rt.players || []) {
        if (entry.gender !== gender || !entry.player) continue;
        const id = idOf(entry.player);
        const current = toCanonicalApparatus(entry.apparatus, types);
        const want = { ...current };
        delete want.competition_2;
        delete want.competition_3;
        if (types.includes('competition_2') && allRound.has(id) && iiApparatus.length) want.competition_2 = [...iiApparatus];
        if (types.includes('competition_3') && apparatusOf.has(id)) want.competition_3 = [...new Set(apparatusOf.get(id))];
        if (JSON.stringify(sortKeys(current)) !== JSON.stringify(sortKeys(want))) {
          await this.competitions.updatePlayerInRegistration(competitionId, rt.team, entry.player, { apparatus: want });
        }
      }
    }
  }

  // ── Admin actions ───────────────────────────────────────────────────────

  /** @private */
  async _final(qualificationId, competitionId = null) {
    const doc = await this.qualifications.findById(qualificationId);
    // Another meet's final is "not found" to an admin working in this one.
    if (!doc || (competitionId && !sameId(doc.competition, competitionId))) throw new NotFoundError('Final');
    return doc;
  }

  /** A qualifier withdraws: the next in rank fills the place. */
  async withdraw(actor, qualificationId, { playerId, reason = '', competitionId = null }) {
    const doc = await this._final(qualificationId, competitionId);
    if (doc.frozenAt) throw new BusinessRuleError('This final has started; a withdrawal can no longer be replaced.');
    if (!(doc.qualifiers || []).some((q) => sameId(q.player, playerId))) throw new ValidationError('That player is not a qualifier of this final');
    await this.qualifications.updateById(doc._id, { $push: { withdrawn: { player: playerId, by: actor?.id || null, reason: String(reason).slice(0, 300) } } });
    await this.onCompetitionOneChange(doc.competition, doc.gender, doc.competitionType === 'competition_3' ? doc.ageGroup : null);
    return this.qualifications.findById(doc._id);
  }

  /** Undo a withdrawal (a mistake), while the final has not started. */
  async reinstate(actor, qualificationId, { playerId, competitionId = null }) {
    const doc = await this._final(qualificationId, competitionId);
    if (doc.frozenAt) throw new BusinessRuleError('This final has started.');
    await this.qualifications.updateById(doc._id, { $pull: { withdrawn: { player: playerId } } });
    await this.onCompetitionOneChange(doc.competition, doc.gender, doc.competitionType === 'competition_3' ? doc.ageGroup : null);
    return this.qualifications.findById(doc._id);
  }

  /** Competition II: the drawn order of a tie the rules could not break. */
  async recordAllRoundDraw(actor, qualificationId, { ageGroup, order, competitionId = null }) {
    const doc = await this._final(qualificationId, competitionId);
    if (doc.competitionType !== 'competition_2') throw new ValidationError('Competition III ties are drawn on the Competition I standing (Scores tab)');
    if (!Array.isArray(order) || order.length < 2) throw new ValidationError('Give the drawn order of the tied players');
    const tiedHere = new Set((doc.tied || []).filter((t) => t.sourceAgeGroup === ageGroup).map((t) => idOf(t.player)));
    if (!order.every((id) => tiedHere.has(String(id))) || order.length !== tiedHere.size) {
      throw new ValidationError('The draw must name exactly the tied players');
    }
    const drawOrders = (doc.drawOrders || []).filter((d) => d.ageGroup !== ageGroup);
    drawOrders.push({ ageGroup, order, by: actor?.id || null, at: new Date() });
    await this.qualifications.updateById(doc._id, { drawOrders });
    await this.onCompetitionOneChange(doc.competition, doc.gender, null);
    return this.qualifications.findById(doc._id);
  }

  // ── Reading ─────────────────────────────────────────────────────────────

  /** Every final of a meet, for the admin board and the public page. */
  async list(competitionId) {
    const docs = await this.qualifications.find({ competition: competitionId }, { sort: { competitionType: 1, gender: -1, ageGroup: 1, apparatus: 1 } }) || [];
    const teams = await this._teamNames(docs.flatMap((d) => [...(d.qualifiers || []), ...(d.tied || []), ...(d.skipped || [])].map((q) => idOf(q.team))));
    const team = (id) => (id ? { _id: idOf(id), name: teams.get(idOf(id))?.name || 'Unknown team' } : null);
    const person = (q) => ({ player: idOf(q.player), playerName: q.playerName, team: team(q.team), rank: q.rank, score: q.score, ageGroup: q.sourceAgeGroup, replacement: Boolean(q.replacement), reason: q.reason });
    return docs.map((d) => ({
      _id: d._id,
      label: finalLabel(d),
      competitionType: d.competitionType,
      gender: d.gender,
      ageGroup: d.ageGroup,
      apparatus: d.apparatus,
      status: d.frozenAt ? 'started' : d.status,
      qualifiers: (d.qualifiers || []).map(person),
      tied: (d.tied || []).map(person),
      skipped: (d.skipped || []).map(person),
      withdrawn: (d.withdrawn || []).map((w) => ({ player: idOf(w.player), reason: w.reason, at: w.at })),
      slices: d.slices || [],
      waitingFor: d.waitingFor || [],
      computedAt: d.computedAt,
      frozenAt: d.frozenAt,
      staleSince: d.staleSince,
      staleNote: d.staleNote,
    }));
  }

  /** The finals one player is in, for the player dashboard. */
  async forPlayer(playerId) {
    const docs = await this.qualifications.find({ 'qualifiers.player': playerId }, { populate: { path: 'competition', select: 'name startDate level' } }) || [];
    return docs.map((d) => ({ competition: d.competition ? { _id: d.competition._id, name: d.competition.name } : null, label: finalLabel(d), competitionType: d.competitionType, apparatus: d.apparatus }));
  }

  /** A coach's qualifiers in one meet, for the coach dashboard. */
  async forCoach(coachId, competitionId) {
    const competition = await this.competitions.findById(competitionId, { select: 'registeredTeams' });
    const mine = (competition?.registeredTeams || []).find((rt) => sameId(rt.coach, coachId));
    if (!mine) return [];
    const all = await this.list(competitionId);
    return all
      .map((f) => ({ ...f, qualifiers: f.qualifiers.filter((q) => sameId(q.team?._id, mine.team)), skipped: [], tied: [] }))
      .filter((f) => f.qualifiers.length);
  }
}

function sortKeys(object) {
  return Object.fromEntries(Object.keys(object || {}).sort().map((k) => [k, [...(object[k] || [])].sort()]));
}

module.exports = QualificationService;
module.exports.finalLabel = finalLabel;
