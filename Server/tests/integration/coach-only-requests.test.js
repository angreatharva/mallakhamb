/**
 * Requests from players a coach registered go to that coach only: the super
 * admin neither sees nor decides them. Other no-email players' requests are
 * unchanged (coach and super admin). Coaches cannot be deactivated.
 */

const AccountRequestService = require('../../src/services/auth/account-request.service');
const PlayerRepository = require('../../src/repositories/player.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const AuditLogRepository = require('../../src/repositories/audit-log.repository');
const AccountRequestRepository = require('../../src/repositories/account-request.repository');
const SuperAdminService = require('../../src/services/user/super-admin.service');
const CoachRepository = require('../../src/repositories/coach.repository');
const Player = require('../../src/models/Player');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const AccountRequest = require('../../src/models/AccountRequest');
const { AuthorizationError, ValidationError } = require('../../src/errors');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const PASSWORD = 'CorrectHorse1';

function build() {
  return new AccountRequestService({
    accountRequestRepository: new AccountRequestRepository(noopLogger),
    playerRepository: new PlayerRepository(noopLogger),
    teamRepository: new TeamRepository(noopLogger),
    auditLogRepository: new AuditLogRepository(noopLogger),
    accountService: {},
    tokenService: {},
    logger: noopLogger,
  });
}

async function setup() {
  const coach = await Coach.create({ firstName: 'Ravi', lastName: 'Kale', email: 'ravi@example.com', phone: '9123456780', password: PASSWORD });
  const team = await Team.create({ name: 'Shivaji Club', coach: coach._id });
  const base = { dateOfBirth: new Date('2016-06-15'), gender: 'Male', password: PASSWORD, emailType: 'none', team: team._id };
  const selfRegistered = await Player.create({
    ...base, firstName: 'Aarav', lastName: 'Patil', guardian: { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' },
  });
  const coachRegistered = await Player.create({
    ...base, firstName: 'Diya', lastName: 'Rao', registeredByCoach: coach._id,
    guardian: { name: 'Ravi Kale', relation: 'Coach', phone: '9123456780' },
  });
  // Registered by a coach before `registeredByCoach` existed: the relation tells.
  const legacyCoachRegistered = await Player.create({
    ...base, firstName: 'Kabir', lastName: 'Shah', guardian: { name: 'Ravi Kale', relation: 'Coach', phone: '9123456780' },
  });
  const open = (player) => AccountRequest.create({
    kind: 'password-reset', userType: 'player', user: player._id, status: 'awaiting-coach',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return {
    coach,
    requests: {
      selfRegistered: await open(selfRegistered),
      coachRegistered: await open(coachRegistered),
      legacyCoachRegistered: await open(legacyCoachRegistered),
    },
  };
}

const superAdmin = { userId: new Player()._id, userType: 'superadmin' };
const names = (list) => list.map((r) => r.player.firstName).sort();

beforeAll(async () => {
  await Player.init();
});

test('the super admin sees only requests from players no coach registered', async () => {
  const service = build();
  const { coach } = await setup();

  expect(names(await service.listForSuperAdmin())).toEqual(['Aarav']);
  expect(names(await service.listForCoach(coach._id))).toEqual(['Aarav', 'Diya', 'Kabir']);
});

test('the super admin cannot decide a coach-registered player’s request; the coach can', async () => {
  const service = build();
  const { coach, requests } = await setup();

  await expect(service.approve(requests.coachRegistered._id, superAdmin)).rejects.toBeInstanceOf(AuthorizationError);
  await expect(service.reject(requests.legacyCoachRegistered._id, superAdmin)).rejects.toBeInstanceOf(AuthorizationError);

  const decided = await service.reject(requests.coachRegistered._id, { userId: coach._id, userType: 'coach' });
  expect(decided.status).toBe('rejected');
  expect((await service.reject(requests.selfRegistered._id, superAdmin)).status).toBe('rejected');
});

test('a coach cannot be deactivated, only activated', async () => {
  const service = new SuperAdminService({ coachRepository: new CoachRepository(noopLogger), logger: noopLogger });
  const coach = await Coach.create({ firstName: 'Old', lastName: 'Coach', email: 'old@example.com', password: PASSWORD, isActive: false });

  await expect(service.updateCoachStatus(coach._id, false)).rejects.toBeInstanceOf(ValidationError);
  await service.updateCoachStatus(coach._id, true);
  expect((await Coach.findById(coach._id).lean()).isActive).toBe(true);
});
