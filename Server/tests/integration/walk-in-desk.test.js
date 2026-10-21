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
    const layout = buildFormLayout(competition);
    const page = layout.pages[0];
    const section = page.sections.find((s) => s.key === 'Male:Under12');
    const ocrClient = {
      readPage: jest.fn(async () => ({
        page: 1,
        qr: { text: qrPayload(String(competition._id), 1, layout.pages.length) },
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

  test('a form printed for another meet is refused', async () => {
    const competition = await meet();
    const ocrClient = { readPage: jest.fn(async () => ({ page: 1, qr: { text: qrPayload(String(new mongoose.Types.ObjectId()), 1, 1) }, rows: [] })) };
    const { service } = build({ ocrClient });
    const actor = superAdmin();
    const draft = await deskUpTo(service, actor, competition);
    await expect(service.scanPage(actor, draft._id, Buffer.from('jpeg'))).rejects.toThrow(/different competition/);
  });
});
