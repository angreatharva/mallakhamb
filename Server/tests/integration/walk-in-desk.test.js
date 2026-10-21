/**
 * The walk-in desk on real models: a coach, team and paper form become
 * players entered in a meet, with the age rule, the admin's meet scope, a
 * resumable submit and the admin recorded on the payment.
 */

const mongoose = require('mongoose');
const WalkInService = require('../../src/services/walk-in/walk-in.service');
const CoachService = require('../../src/services/user/coach.service');
const CoachPlayerService = require('../../src/services/user/coach-player.service');
const WalkInRegistrationRepository = require('../../src/repositories/walk-in-registration.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const PlayerRepository = require('../../src/repositories/player.repository');
const TransactionRepository = require('../../src/repositories/transaction.repository');
const AuditLogRepository = require('../../src/repositories/audit-log.repository');
const Competition = require('../../src/models/Competition');
const Coach = require('../../src/models/Coach');
const Player = require('../../src/models/Player');
const Transaction = require('../../src/models/Transaction');
const WalkInRegistration = require('../../src/models/WalkInRegistration');
const { AuthorizationError, BusinessRuleError } = require('../../src/errors');
const { buildFormLayout, qrPayload } = require('../../src/utils/walk-in/form-layout.util');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const DISCOUNT = 'FREE-ENTRY-2026';
const config = {
  get: (key) => ({
    'jwt.secret': 'j'.repeat(40),
    'payments.discount': { enabled: true, code: DISCOUNT },
  }[key]),
};

const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const thisYear = new Date().getUTCFullYear();

async function meet(overrides = {}) {
  return Competition.create({
    name: `Walk-in Open ${Math.random()}`,
    level: 'state',
    place: 'Pune',
    year: thisYear,
    startDate: day(`${thisYear + 1}-01-20`),
    endDate: day(`${thisYear + 1}-01-22`),
    ageCutoffYear: thisYear,
    playerFee: 300,
    maxTeamSize: 6,
    competitionTypes: ['competition_1'],
    apparatusConfig: { competition_1: ['Pole Mallakhamb', 'Rope Mallakhamb'] },
    ageGroups: [
      { gender: 'Male', ageGroup: 'Under10' },
      { gender: 'Male', ageGroup: 'Under12' },
      { gender: 'Male', ageGroup: 'Under14' },
      { gender: 'Female', ageGroup: 'Under12' },
    ],
    ...overrides,
  });
}

function build({ ocrClient = null } = {}) {
  const coachRepository = new CoachRepository(noopLogger);
  const teamRepository = new TeamRepository(noopLogger);
  const playerRepository = new PlayerRepository(noopLogger);
  const competitionRepository = new CompetitionRepository(noopLogger);
  const coachService = new CoachService(
    coachRepository, teamRepository, noopLogger, null, null,
    competitionRepository, playerRepository, config, new TransactionRepository(noopLogger)
  );
  const coachPlayerService = new CoachPlayerService({
    coachRepository, playerRepository, teamRepository,
    otpService: { notifyCoachOfPlayerId: jest.fn() }, config, logger: noopLogger,
  });
  // Registration proper (hashing, duplicate email) is AuthenticationService's
  // own test; the desk only needs an account to come back.
  const authenticationService = {
    register: async (payload) => ({ user: (await Coach.create(payload)).toObject() }),
  };
  const service = new WalkInService({
    walkInRegistrationRepository: new WalkInRegistrationRepository(noopLogger),
    competitionRepository, coachRepository, teamRepository, playerRepository,
    authenticationService, coachService, coachPlayerService,
    auditLogRepository: new AuditLogRepository(noopLogger),
    ocrClient, config, logger: noopLogger,
  });
  return { service, coachService };
}

const superAdmin = () => ({ id: new mongoose.Types.ObjectId(), userType: 'superadmin', user: { role: 'superadmin' } });
const adminOf = (...meets) => ({ id: new mongoose.Types.ObjectId(), userType: 'admin', user: { role: 'admin', competitions: meets.map((m) => m._id) } });

async function deskUpTo(service, actor, competition) {
  const coach = await service.createCoach(actor, {
    firstName: 'Ravi', lastName: 'Kale', email: `ravi${Math.random()}@example.com`, phone: '9123456780',
    password: 'CoachPass1', playerDefaultPassword: 'Shivaji2026',
  });
  await service.ensureTeam(actor, coach._id, { name: 'Shivaji Club' });
  return service.openDraft(actor, { competitionId: competition._id, coachId: coach._id });
}

const dob = (age, mmdd = '06-15') => `${thisYear - age}-${mmdd}`;

beforeAll(async () => {
  await Player.init();
});

describe('walk-in desk', () => {
  test('lists only meets taking payment, and only the admin\'s own', async () => {
    const { service } = build();
    const open = await meet();
    const notYet = await meet({ registrationOpenDate: day(`${thisYear + 1}-01-01`), feeDueDate: day(`${thisYear + 1}-01-05`) });
    const other = await meet();

    const listed = (await service.listOpenMeets(adminOf(open, notYet))).map((m) => String(m._id));
    expect(listed).toEqual([String(open._id)]);
    expect((await service.listOpenMeets(superAdmin())).map((m) => String(m._id))).toEqual(
      expect.arrayContaining([String(open._id), String(other._id)])
    );
  });

  test('an admin cannot open a form at a meet they are not assigned to', async () => {
    const { service } = build();
    const mine = await meet();
    const theirs = await meet();
    const admin = adminOf(mine);
    await expect(deskUpTo(service, admin, theirs)).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('reports the age rule on each row and never moves a player silently', async () => {
    const { service } = build();
    const competition = await meet();
    const actor = superAdmin();
    const draft = await deskUpTo(service, actor, competition);

    const view = await service.saveRows(actor, draft._id, {
      rows: [
        // 11 on 31 Dec, written under Under 10: too old for it
        { firstName: 'aarav', lastName: 'PATIL', dateOfBirth: dob(11), gender: 'Male', ageGroup: 'Under10', apparatus: ['Pole Mallakhamb'] },
        // playing up
        { firstName: 'VED', lastName: 'JOSHI', dateOfBirth: dob(9), gender: 'Male', ageGroup: 'Under12', apparatus: ['Rope Mallakhamb'] },
        // not English capitals
        { firstName: 'R4HUL', lastName: 'MORE', dateOfBirth: dob(10), gender: 'Male', ageGroup: 'Under10', apparatus: [] },
      ],
    });

    const [aarav, ved, rahul] = view.rows;
    expect(aarav).toMatchObject({ firstName: 'AARAV', age: 11, lowestAgeGroup: 'Under12', ageGroup: 'Under10' });
    expect(aarav.eligibleAgeGroups).toEqual(['Under12', 'Under14']);
    expect(aarav.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'ageGroup', level: 'error' })]));

    expect(ved.issues).toEqual([expect.objectContaining({ field: 'ageGroup', level: 'info', message: expect.stringMatching(/Playing up/) })]);

    expect(rahul.issues.map((i) => i.field)).toEqual(expect.arrayContaining(['firstName', 'apparatus']));
    expect(view.blocking).toBeGreaterThan(0);
    await expect(service.submit(actor, draft._id)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  test('submits, resumes after a failure without creating anyone twice, and records the admin on payment', async () => {
    const { service, coachService } = build();
    const competition = await meet();
    const actor = superAdmin();
    const draft = await deskUpTo(service, actor, competition);

    await service.saveRows(actor, draft._id, {
      guardianConsent: true,
      rows: [
        { firstName: 'AARAV', lastName: 'PATIL', dateOfBirth: dob(11), gender: 'Male', ageGroup: 'Under12', apparatus: ['Pole Mallakhamb'] },
        { firstName: 'ANAYA', lastName: "D'SOUZA", dateOfBirth: dob(12), gender: 'Female', ageGroup: 'Under12', apparatus: ['Rope Mallakhamb'] },
      ],
    });

    // The second entry fails once, as a failover mid-submit would.
    const real = coachService.addPlayerToAgeGroup.bind(coachService);
    let calls = 0;
    coachService.addPlayerToAgeGroup = jest.fn(async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('connection lost');
      return real(...args);
    });
    await expect(service.submit(actor, draft._id)).rejects.toThrow('connection lost');

    const afterFailure = await WalkInRegistration.findById(draft._id).lean();
    expect(afterFailure.status).toBe('draft');
    expect(afterFailure.rows.every((r) => r.player)).toBe(true);
    expect(afterFailure.submitLockedAt).toBeNull();

    const done = await service.submit(actor, draft._id);
    expect(done.status).toBe('submitted');
    expect(await Player.countDocuments({})).toBe(2);

    const stored = await Competition.findById(competition._id).lean();
    const entry = stored.registeredTeams[0];
    expect(entry.players).toHaveLength(2);
    expect(entry.players.map((p) => p.ageGroup).sort()).toEqual(['Under12', 'Under12']);

    const anaya = await Player.findOne({ gender: 'Female' }).lean();
    expect(anaya.lastName).toBe('D&#x27;Souza');
    expect(anaya.loginId).toMatch(/^anaya\.dsouza\./);
    expect(anaya.emailType).toBe('none');

    const paid = await service.redeemDiscount(actor, draft._id, DISCOUNT);
    expect(paid.draft.status).toBe('paid');
    const txn = await Transaction.findOne({ competition: competition._id }).lean();
    expect(txn).toMatchObject({ source: 'coach', amount: 0 });
    expect(String(txn.recordedBy)).toBe(String(actor.id));

    const slip = await service.slip(actor, draft._id);
    expect(slip.players.map((p) => p.loginId)).toHaveLength(2);
    expect(slip.players.find((p) => p.gender === 'Female').name).toBe("Anaya D'Souza");
  });

  test('a scanned page lands in the draft as rows from its sections', async () => {
    const competition = await meet();
    const layout = buildFormLayout();
    const page = layout.pages[0];
    const section = page.sections.find((s) => s.key === 'Male:Under12');
    const ocrClient = {
      readPage: jest.fn(async () => ({
        page: 1,
        qr: { text: qrPayload(1, layout.pages.length) },
        rows: [
          {
            section: section.key, rowNo: 1, empty: false, crop: 'data:image/jpeg;base64,AAAA',
            fields: {
              firstName: { text: 'AARAV', confidence: 0.97 },
              lastName: { text: 'PATIL', confidence: 0.91 },
              dobDay: { text: '14', confidence: 0.99 },
              dobMonth: { text: '3', confidence: 0.99 },
              dobYear: { text: String(thisYear - 11), confidence: 0.95 },
            },
            ticks: [{ apparatus: 'Pole Mallakhamb', checked: true }, { apparatus: 'Rope Mallakhamb', checked: false }],
          },
          { section: section.key, rowNo: 2, empty: true },
        ],
      })),
    };
    const { service } = build({ ocrClient });
    const actor = superAdmin();
    const draft = await deskUpTo(service, actor, competition);

    const result = await service.scanPage(actor, draft._id, Buffer.from('jpeg'));
    expect(ocrClient.readPage).toHaveBeenCalledWith(expect.any(Buffer), layout.pages, { pageHint: undefined });
    expect(result.draft.rows).toHaveLength(1);
    expect(result.draft.rows[0]).toMatchObject({
      source: 'ocr', page: 1, rowNo: 1, firstName: 'AARAV', lastName: 'PATIL',
      dateOfBirth: `${thisYear - 11}-03-14`, gender: 'Male', writtenAgeGroup: 'Under12', ageGroup: 'Under12',
      apparatus: ['Pole Mallakhamb'], age: 11,
    });
    expect(result.crops[String(result.draft.rows[0]._id)]).toBe('data:image/jpeg;base64,AAAA');

    // A re-take of the same page replaces its rows rather than adding to them.
    const again = await service.scanPage(actor, draft._id, Buffer.from('jpeg'));
    expect(again.draft.rows).toHaveLength(1);
  });

  test('finds a returning coach by name, phone, email or team name', async () => {
    const { service } = build();
    const actor = superAdmin();
    const coach = await service.createCoach(actor, {
      firstName: 'Ravi', lastName: 'Kale', email: 'ravi.kale@example.com', phone: '+91 91234 56780',
      password: 'CoachPass1', playerDefaultPassword: 'Shivaji2026',
    });
    await service.ensureTeam(actor, coach._id, { name: 'Shivaji Vyayamshala' });
    const ids = async (q) => (await service.searchCoaches(q)).map((c) => String(c._id));

    for (const q of ['ravi', 'Ravi Kale', 'kale@exa', '56780', '9123456780', 'vyayam']) {
      expect(await ids(q)).toEqual([String(coach._id)]);
    }
    expect(await ids('nobody here')).toEqual([]);
    expect(await ids('r')).toEqual([]);
    expect((await service.searchCoaches('vyayam'))[0].team.name).toBe('Shivaji Vyayamshala');
  });

  test('the one form serves every meet: a section this meet does not run is flagged, not dropped', async () => {
    const competition = await meet(); // runs Male U10/U12/U14 and Female U12 only
    const layout = buildFormLayout();
    const page = layout.pages.find((p) => p.sections.some((s) => s.key === 'Male:Above18'));
    const ocrClient = {
      readPage: jest.fn(async () => ({
        page: page.page,
        qr: { text: qrPayload(page.page, layout.pages.length) },
        rows: [{
          section: 'Male:Above18', rowNo: 1, empty: false,
          fields: {
            firstName: { text: 'ROHAN', confidence: 0.99 }, lastName: { text: 'SHINDE', confidence: 0.99 },
            dobDay: { text: '05' }, dobMonth: { text: '06' }, dobYear: { text: String(thisYear - 25) },
          },
          ticks: [{ apparatus: 'Hanging Mallakhamb', checked: true }],
        }],
      })),
    };
    const { service } = build({ ocrClient });
    const actor = superAdmin();
    const draft = await deskUpTo(service, actor, competition);

    const { draft: view } = await service.scanPage(actor, draft._id, Buffer.from('jpeg'));
    expect(view.rows).toHaveLength(1);
    const messages = view.rows[0].issues.filter((i) => i.level === 'error').map((i) => i.message).join(' | ');
    expect(messages).toMatch(/does not run that age group|runs no age group/);
    expect(messages).toMatch(/Not offered for boys: Hanging Mallakhamb/);
  });

  test('a form of an older version is refused, not misread', async () => {
    const competition = await meet();
    // MKWI1 forms were printed per meet, with different boxes.
    const ocrClient = { readPage: jest.fn(async () => ({ page: null, qr: { text: `MKWI1|${new mongoose.Types.ObjectId()}|1|2` }, rows: [] })) };
    const { service } = build({ ocrClient });
    const actor = superAdmin();
    const draft = await deskUpTo(service, actor, competition);
    await expect(service.scanPage(actor, draft._id, Buffer.from('jpeg'))).rejects.toThrow(/older version of the walk-in form/);
  });
});

describe('walk-in desk: a child who already has a Player ID', () => {
  const Team = require('../../src/models/Team');
  const y = (age) => thisYear - age;

  /** A meet, an open draft, and the coach/team behind it. */
  async function setup() {
    const { service } = build();
    const competition = await meet();
    const actor = superAdmin();
    const draft = await deskUpTo(service, actor, competition);
    return { service, competition, actor, draft };
  }

  async function existingPlayer({ firstName = 'Aarav', lastName = 'Patil', age = 11, team = null, gender = 'Male' } = {}) {
    return Player.create({
      firstName, lastName, gender, team,
      dateOfBirth: new Date(`${y(age)}-03-14T00:00:00Z`),
      emailType: 'self', email: `${firstName}.${lastName}.${Math.random()}@example.com`.toLowerCase(),
      phone: '9000000001', password: 'PlayerPass1',
    });
  }

  const aaravRow = (overrides = {}) => ({
    firstName: 'AARAV', lastName: 'PATIL', dateOfBirth: `${y(11)}-03-14`, gender: 'Male', ageGroup: 'Under12',
    apparatus: ['Pole Mallakhamb'], ...overrides,
  });

  test('a self-registered child on no team is linked automatically, not registered again', async () => {
    const { service, actor, draft } = await setup();
    const child = await existingPlayer();

    const view = await service.saveRows(actor, draft._id, { guardianConsent: true, rows: [aaravRow()] });
    expect(view.rows[0].linkedPlayer).toMatchObject({ loginId: child.loginId, auto: true });
    expect(view.blocking).toBe(0);

    await service.submit(actor, draft._id);
    expect(await Player.countDocuments({})).toBe(1);
    const moved = await Player.findById(child._id).lean();
    expect(String(moved.team)).toBe(String(draft.team._id));
    const slip = await service.slip(actor, draft._id);
    expect(slip.players.map((p) => p.loginId)).toEqual([child.loginId]);
  });

  test('a misread name is offered as a match, and the admin links it', async () => {
    const { service, actor, draft } = await setup();
    const child = await existingPlayer();

    let view = await service.saveRows(actor, draft._id, { guardianConsent: true, rows: [aaravRow({ firstName: 'AARAU' })] });
    const row = view.rows[0];
    expect(row.matches).toEqual([expect.objectContaining({ loginId: child.loginId, kind: 'close' })]);
    expect(row.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'match', level: 'error' })]));

    view = await service.saveRows(actor, draft._id, {
      guardianConsent: true,
      rows: [{ ...aaravRow({ firstName: 'AARAU' }), _id: row._id, matchChoice: 'existing', matchPlayer: String(child._id) }],
    });
    expect(view.blocking).toBe(0);
    await service.submit(actor, draft._id);
    expect(await Player.countDocuments({})).toBe(1);
    // The slip carries the account's spelling, not the misread one.
    expect((await service.slip(actor, draft._id)).players[0].name).toBe('Aarav Patil');
  });

  test('a child on another coach\'s team is never moved without the admin choosing', async () => {
    const { service, actor, draft } = await setup();
    const otherCoach = await Coach.create({ firstName: 'Other', lastName: 'Coach', email: 'other.coach@example.com', phone: '9000000002', password: 'CoachPass1' });
    const otherTeam = await Team.create({ name: 'Other Club', coach: otherCoach._id });
    const child = await existingPlayer({ team: otherTeam._id });

    const view = await service.saveRows(actor, draft._id, { guardianConsent: true, rows: [aaravRow()] });
    expect(view.rows[0].linkedPlayer).toBeNull();
    expect(view.rows[0].matches[0]).toMatchObject({ kind: 'exact', team: 'Other Club', sameTeam: false });
    expect(view.blocking).toBeGreaterThan(0);

    // "A different child" registers a new one, with a warning on record.
    const asNew = await service.saveRows(actor, draft._id, {
      guardianConsent: true, rows: [{ ...aaravRow(), _id: view.rows[0]._id, matchChoice: 'new' }],
    });
    expect(asNew.blocking).toBe(0);
    expect(asNew.rows[0].issues).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'warning' })]));

    // Linking moves them, with the move spelled out.
    const linked = await service.saveRows(actor, draft._id, {
      guardianConsent: true, rows: [{ ...aaravRow(), _id: view.rows[0]._id, matchChoice: 'existing', matchPlayer: String(child._id) }],
    });
    expect(linked.rows[0].issues.map((i) => i.message).join(' ')).toMatch(/moves from Other Club/);
    await service.submit(actor, draft._id);
    expect(await Player.countDocuments({})).toBe(1);
    expect(String((await Player.findById(child._id).lean()).team)).toBe(String(draft.team._id));
  });

  test('a child already entered in this meet by another team cannot be linked', async () => {
    const { service, actor, draft, competition } = await setup();
    const otherCoach = await Coach.create({ firstName: 'Other', lastName: 'Coach', email: 'other2.coach@example.com', phone: '9000000003', password: 'CoachPass1' });
    const otherTeam = await Team.create({ name: 'Rival Club', coach: otherCoach._id });
    const child = await existingPlayer({ team: otherTeam._id });
    await Competition.updateOne({ _id: competition._id }, { $push: { registeredTeams: {
      team: otherTeam._id, coach: otherCoach._id, players: [{ player: child._id, gender: 'Male', ageGroup: 'Under12' }],
    } } });

    const view = await service.saveRows(actor, draft._id, {
      guardianConsent: true, rows: [{ ...aaravRow(), matchChoice: 'existing', matchPlayer: String(child._id) }],
    });
    expect(view.rows[0].issues.map((i) => i.message).join(' ')).toMatch(/already entered in this competition for Rival Club/);
    expect(view.blocking).toBeGreaterThan(0);
  });
});
