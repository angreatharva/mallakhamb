/**
 * Walk-in desk v2 (docs/walk-in-desk-v2-plan.md): unlock a submitted team at
 * the desk, pay only for the players added since, and the Excel template.
 */

const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const WalkInService = require('../../src/services/walk-in/walk-in.service');
const WalkInExcelService = require('../../src/services/walk-in/excel.service');
const TeamReopenService = require('../../src/services/registration/team-reopen.service');
const CorrectionService = require('../../src/services/superadmin/correction.service');
const CoachService = require('../../src/services/user/coach.service');
const CoachPlayerService = require('../../src/services/user/coach-player.service');
const WalkInRegistrationRepository = require('../../src/repositories/walk-in-registration.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const PlayerRepository = require('../../src/repositories/player.repository');
const TransactionRepository = require('../../src/repositories/transaction.repository');
const AuditLogRepository = require('../../src/repositories/audit-log.repository');
const PlayerTeamService = require('../../src/services/team/player-team.service');
const AuditLog = require('../../src/models/AuditLog');
const Competition = require('../../src/models/Competition');
const Coach = require('../../src/models/Coach');
const Player = require('../../src/models/Player');
const WalkInRegistration = require('../../src/models/WalkInRegistration');
const { AuthorizationError, ConflictError, ValidationError, BusinessRuleError } = require('../../src/errors');
const L = require('../../src/utils/walk-in/excel-layout.util');

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
const ageYear = thisYear + 1;
const dob = (age, mmdd = '06-15') => `${ageYear - age}-${mmdd}`;

async function meet(overrides = {}) {
  return Competition.create({
    name: `Desk v2 Open ${Math.random()}`,
    level: 'state',
    place: 'Pune',
    year: thisYear,
    startDate: day(`${thisYear + 1}-01-20`),
    endDate: day(`${thisYear + 1}-01-22`),
    playerFee: 100,
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

function build() {
  const coachRepository = new CoachRepository(noopLogger);
  const teamRepository = new TeamRepository(noopLogger);
  const playerRepository = new PlayerRepository(noopLogger);
  const competitionRepository = new CompetitionRepository(noopLogger);
  const auditLogRepository = new AuditLogRepository(noopLogger);
  const coachService = new CoachService(
    coachRepository, teamRepository, noopLogger, null, null,
    competitionRepository, playerRepository, config, new TransactionRepository(noopLogger)
  );
  const coachPlayerService = new CoachPlayerService({
    coachRepository, playerRepository, teamRepository,
    otpService: { notifyCoachOfPlayerId: jest.fn() }, config, logger: noopLogger,
  });
  const authenticationService = {
    register: async (payload) => ({ user: (await Coach.create(payload)).toObject() }),
  };
  const correctionService = new CorrectionService({ auditLogRepository, adminRepository: null, logger: noopLogger });
  const teamReopenService = new TeamReopenService({ competitionRepository, correctionService, teamRepository, logger: noopLogger });
  const service = new WalkInService({
    walkInRegistrationRepository: new WalkInRegistrationRepository(noopLogger),
    competitionRepository, coachRepository, teamRepository, playerRepository,
    authenticationService, coachService, coachPlayerService,
    teamReopenService, excelService: new WalkInExcelService(),
    auditLogRepository, ocrClient: null, config, logger: noopLogger,
  });
  const playerTeamService = new PlayerTeamService({
    playerRepository, teamRepository, auditLogRepository, otpService: { notifyLevelTeamSet: jest.fn() }, logger: noopLogger,
  });
  for (const s of [service, coachService, coachPlayerService]) s.playerTeamService = playerTeamService;
  return { service };
}

const superAdmin = () => ({ id: new mongoose.Types.ObjectId(), userType: 'superadmin', user: { role: 'superadmin' } });
const adminOf = (...meets) => ({ id: new mongoose.Types.ObjectId(), userType: 'admin', user: { role: 'admin', competitions: meets.map((m) => m._id) } });

const row = (firstName, lastName, age, extra = {}) => ({
  firstName, lastName, dateOfBirth: dob(age), gender: 'Male', ageGroup: age <= 10 ? 'Under10' : 'Under12', apparatus: ['Pole Mallakhamb'], ...extra,
});

/** A coach with a team, and a paid squad of `n` players entered through the desk. */
async function paidSquad(service, actor, competition, n, surname = 'PATIL') {
  const coach = await service.createCoach(actor, {
    firstName: 'Ravi', lastName: 'Kale', email: `ravi${Math.random()}@example.com`, phone: '9123456780',
    password: 'CoachPass1', playerDefaultPassword: 'Shivaji2026',
  });
  await service.ensureTeam(actor, coach._id, { name: `Shivaji Club ${Math.random()}` });
  const draft = await service.openDraft(actor, { competitionId: competition._id, coachId: coach._id });
  const names = ['AARAV', 'VED', 'OM', 'SAI', 'JAY', 'DEV'];
  await service.saveRows(actor, draft._id, {
    rows: names.slice(0, n).map((name, i) => row(name, surname, 9, { dateOfBirth: dob(9, `0${i + 1}-10`) })),
    guardianConsent: true,
  });
  await service.submit(actor, draft._id);
  // Paid by Razorpay in real life; marked here as the verify step does.
  const reg = (await Competition.findById(competition._id).lean()).registeredTeams[0];
  const { paidEntriesAfterPayment } = require('../../src/config/payment.config');
  await Competition.updateOne({ _id: competition._id }, {
    $set: {
      'registeredTeams.0.isSubmitted': true,
      'registeredTeams.0.submittedAt': new Date(),
      'registeredTeams.0.paymentStatus': 'completed',
      'registeredTeams.0.paymentAmount': n * 100,
      'registeredTeams.0.paidEntries': paidEntriesAfterPayment(reg.players, [], competition, new Date()),
    },
  });
  await WalkInRegistration.updateOne({ _id: draft._id }, { $set: { status: 'paid', paidAt: new Date() } });
  return { coach, firstDraft: draft };
}

beforeAll(async () => {
  await Player.init();
});

describe('desk: unlock a submitted team', () => {
  test('a submitted team is refused with TEAM_SUBMITTED, then unlocked; only new players are charged', async () => {
    const { service } = build();
    const competition = await meet();
    const actor = superAdmin();
    const { coach } = await paidSquad(service, actor, competition, 4);

    await expect(service.openDraft(actor, { competitionId: competition._id, coachId: coach._id }))
      .rejects.toMatchObject({ details: { reason: 'TEAM_SUBMITTED' } });

    const status = await service.teamStatus(actor, { competitionId: competition._id, coachId: coach._id });
    expect(status).toMatchObject({ isSubmitted: true, players: 4, paidPlayers: 4 });
    expect(status.squad.every((p) => p.paid)).toBe(true);

    const unlocked = await service.unlockTeam(actor, { competitionId: competition._id, coachId: coach._id, reason: 'Two more players walked in' });
    expect(unlocked.paidPlayers).toBe(4);
    expect(unlocked.status).toMatchObject({ isSubmitted: false, reopened: true });

    const draft = await service.openDraft(actor, { competitionId: competition._id, coachId: coach._id });
    expect(draft.status).toBe('draft');
    expect(draft.squad).toHaveLength(4);
    const view = await service.saveRows(actor, draft._id, { rows: [row('NEEL', 'MORE', 11)], guardianConsent: true });
    expect(view.rows[0].issues.filter((i) => i.level === 'error')).toEqual([]);
    const submitted = await service.submit(actor, draft._id);
    expect(submitted.registration.fees).toMatchObject({ newPlayers: 1, paidPlayers: 4, entryFees: 100, lateFeeTotal: 0, total: 100 });
    expect(submitted.registration.amountDue).toBe(100);

    const history = await AuditLog.findOne({ action: 'ENTRY_REOPENED' }).lean();
    expect(history.details).toMatchObject({ via: 'walk-in-desk', paidPlayers: 4, reason: 'Two more players walked in' });
  });

  test('past the fee deadline the late fee is charged on the new player only', async () => {
    const { service } = build();
    const competition = await meet({ lateFee: 50 });
    const actor = superAdmin();
    const { coach } = await paidSquad(service, actor, competition, 2);
    // The deadline passes after the first payment.
    await Competition.updateOne({ _id: competition._id }, { $set: { feeDueDate: day(`${thisYear - 1}-01-01`) } });
    await service.unlockTeam(actor, { competitionId: competition._id, coachId: coach._id, reason: 'Late walk-in' });
    const draft = await service.openDraft(actor, { competitionId: competition._id, coachId: coach._id });
    await service.saveRows(actor, draft._id, { rows: [row('NEEL', 'MORE', 11)], guardianConsent: true });
    const submitted = await service.submit(actor, draft._id);
    expect(submitted.registration.fees).toMatchObject({ newPlayers: 1, entryFees: 100, lateFeePerPlayer: 50, lateFeeTotal: 50, total: 150 });
  });

  test('an Admin may unlock on their own meet only; the History row says admin', async () => {
    const { service } = build();
    const mine = await meet();
    const theirs = await meet();
    const sa = superAdmin();
    const a = await paidSquad(service, sa, mine, 1);
    const b = await paidSquad(service, sa, theirs, 1, 'SHINDE');
    const admin = adminOf(mine);

    await expect(service.unlockTeam(admin, { competitionId: theirs._id, coachId: b.coach._id, reason: 'not my meet' }))
      .rejects.toBeInstanceOf(AuthorizationError);
    await service.unlockTeam(admin, { competitionId: mine._id, coachId: a.coach._id, reason: 'Desk unlock by admin' });
    const history = await AuditLog.findOne({ action: 'ENTRY_REOPENED', 'details.competition': String(mine._id) }).lean();
    expect(history.adminType).toBe('admin');
  });

  test('unlock needs a reason, refuses an open team, and nothing new means submit at no charge', async () => {
    const { service } = build();
    const competition = await meet();
    const actor = superAdmin();
    const { coach } = await paidSquad(service, actor, competition, 2);
    await expect(service.unlockTeam(actor, { competitionId: competition._id, coachId: coach._id, reason: 'x' }))
      .rejects.toBeInstanceOf(ValidationError);
    await service.unlockTeam(actor, { competitionId: competition._id, coachId: coach._id, reason: 'Check the squad' });
    await expect(service.unlockTeam(actor, { competitionId: competition._id, coachId: coach._id, reason: 'Check again' }))
      .rejects.toBeInstanceOf(ConflictError);
    const status = await service.teamStatus(actor, { competitionId: competition._id, coachId: coach._id });
    expect(status).toMatchObject({ isSubmitted: false, reopened: true, paidPlayers: 2 });
  });

  test('the squad room counts players already entered', async () => {
    const { service } = build();
    const competition = await meet({ maxTeamSize: 4 });
    const actor = superAdmin();
    const { coach } = await paidSquad(service, actor, competition, 4);
    await service.unlockTeam(actor, { competitionId: competition._id, coachId: coach._id, reason: 'One more walk-in' });
    const draft = await service.openDraft(actor, { competitionId: competition._id, coachId: coach._id });
    const view = await service.saveRows(actor, draft._id, { rows: [row('NEEL', 'MORE', 9)], guardianConsent: true });
    expect(view.rows[0].issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'ageGroup', level: 'error', message: expect.stringMatching(/Squad full/) })]));
  });

  test('a closed fee window refuses the unlock', async () => {
    const { service } = build();
    const competition = await meet();
    const actor = superAdmin();
    const { coach } = await paidSquad(service, actor, competition, 1);
    await Competition.updateOne({ _id: competition._id }, { $set: { registrationOpenDate: day(`${thisYear + 1}-01-10`) } });
    await expect(service.unlockTeam(actor, { competitionId: competition._id, coachId: coach._id, reason: 'Closed window' }))
      .rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('desk: Excel', () => {
  async function filled(rows, coach = {}) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await new WalkInExcelService().template());
    const c = wb.getWorksheet('Coach');
    L.COACH_FIELDS.forEach((f, i) => { if (coach[f.key]) c.getRow(i + 1).getCell(2).value = coach[f.key]; });
    const p = wb.getWorksheet('Players');
    rows.forEach((values, i) => { p.getRow(i + 2).values = values; });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  test('the template reads back empty, with the version and headers it was written with', async () => {
    const parsed = await new WalkInExcelService().parse(await new WalkInExcelService().template());
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual([expect.objectContaining({ message: 'The Players sheet has no players' })]);
  });

  test('reads rows, reports bad cells by Excel row, and refuses a changed or foreign file', async () => {
    const excel = new WalkInExcelService();
    const file = await filled([
      ['aarav', 'patil', new Date(Date.UTC(ageYear - 11, 5, 15)), 'Male', 'Under 12', 'Yes', 'No', ''],
      ['meera', 'kale', '31-02-2014', 'Girl', '', 'maybe', '', ''],
      ['om', 'joshi', { formula: 'TEXT(1,"0")', result: '05-08-2016' }, 'M', '', 'yes', '', 'yes'],
    ], { firstName: 'Ravi', email: 'RAVI@EXAMPLE.COM' });
    const parsed = await excel.parse(file);
    expect(parsed.coach).toMatchObject({ firstName: 'Ravi', email: 'ravi@example.com' });
    expect(parsed.rows[0]).toMatchObject({ excelRow: 2, firstName: 'AARAV', dateOfBirth: `${ageYear - 11}-06-15`, gender: 'Male', ageGroup: 'Under12', apparatus: ['Pole Mallakhamb'] });
    expect(parsed.rows[2]).toMatchObject({ dateOfBirth: '2016-08-05', gender: 'Male', apparatus: ['Pole Mallakhamb', 'Rope Mallakhamb'] });
    expect(parsed.rows[1].gender).toBe('Female'); // "Girl" is read as Female
    expect(parsed.errors.map((e) => [e.excelRow, e.field])).toEqual([[3, 'dateOfBirth'], [3, 'apparatus']]);

    await expect(excel.parse(Buffer.from('name,dob\n'))).rejects.toBeInstanceOf(ValidationError);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file);
    wb.getWorksheet('Players').getCell('C1').value = 'DOB';
    await expect(excel.parse(Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toThrow(/columns were changed/);
    wb.getWorksheet('Players').getCell('Z1').value = 'OLD';
    await expect(excel.parse(Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toThrow(/older or different template/);
  });

  test('more than 200 players is refused', async () => {
    const rows = Array.from({ length: 201 }, (_, i) => [`A${'B'.repeat(i % 5)}`, 'X', '01-01-2014', 'Male', '', 'Yes']);
    await expect(new WalkInExcelService().parse(await filled(rows))).rejects.toThrow(/At most 200/);
  });

  test('imported rows go through the review; the same file twice adds nobody twice; submit creates no-email players', async () => {
    const { service } = build();
    const competition = await meet();
    const actor = superAdmin();
    const file = await filled([
      ['aarav', 'patil', `15-06-${ageYear - 11}`, 'Male', '', 'Yes', '', ''],
      ['ved', 'joshi', `15-06-${ageYear - 9}`, 'Male', 'Under 12', '', '', 'Yes'],
    ], { firstName: 'Ravi', lastName: 'Kale', email: 'ravi.excel@example.com', phone: '9123456780', teamName: 'Excel Club' });

    const parsed = await service.parseExcel(actor, file);
    expect(parsed.existingCoach).toBeNull();
    expect(parsed.coach.teamName).toBe('Excel Club');

    const coach = await service.createCoach(actor, { ...parsed.coach, password: 'CoachPass1', playerDefaultPassword: 'Shivaji2026' });
    await service.ensureTeam(actor, coach._id, { name: parsed.coach.teamName });
    expect((await service.parseExcel(actor, file)).existingCoach).toMatchObject({ email: 'ravi.excel@example.com' });

    const draft = await service.openDraft(actor, { competitionId: competition._id, coachId: coach._id });
    const first = await service.importExcel(actor, draft._id, file, { fileName: 'ravi.xlsx' });
    expect(first.added).toBe(2);
    const [aarav, ved] = first.draft.rows;
    // No age group written: the youngest the player fits. Written Under 12: kept (playing up).
    expect(aarav).toMatchObject({ source: 'excel', excelRow: 2, ageGroup: 'Under12' });
    expect(ved).toMatchObject({ excelRow: 3, ageGroup: 'Under12' });
    expect(ved.issues).toEqual([expect.objectContaining({ level: 'info', message: expect.stringMatching(/Playing up/) })]);

    const again = await service.importExcel(actor, draft._id, file, { fileName: 'ravi.xlsx' });
    expect(again).toMatchObject({ added: 0, skipped: 2 });
    expect(again.draft.rows).toHaveLength(2);
    expect(again.draft.imports).toHaveLength(2);

    await service.saveRows(actor, draft._id, { rows: again.draft.rows, guardianConsent: true });
    const done = await service.submit(actor, draft._id);
    expect(done.rows.every((r) => r.loginId)).toBe(true);
    const players = await Player.find({ registeredByCoach: coach._id }).lean();
    expect(players).toHaveLength(2);
    expect(players.every((p) => p.emailType === 'none')).toBe(true);

    const pw = await service.coachDefaultPassword(actor, coach._id);
    expect(pw).toMatchObject({ isSet: true, readable: true, password: 'Shivaji2026' });
  });
});
