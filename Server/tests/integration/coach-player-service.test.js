/**
 * A coach registering a player with no email, on real models: the coach's
 * viewable default password, the account it creates, the duplicate guard, and
 * that changing the default later leaves existing players alone.
 */

const bcrypt = require('bcryptjs');
const CoachPlayerService = require('../../src/services/user/coach-player.service');
const PlayerRepository = require('../../src/repositories/player.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const AuditLogRepository = require('../../src/repositories/audit-log.repository');
const Player = require('../../src/models/Player');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const AuditLog = require('../../src/models/AuditLog');
const { AuthenticationError, ConflictError, ValidationError } = require('../../src/errors');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const COACH_PASSWORD = 'CoachPass1';
const DEFAULT = 'Shivaji2026';
const COACH_PHONE = '9123456780';
const keyed = (secret) => ({ get: (key) => (key === 'jwt.secret' ? secret : undefined) });

function build(config = keyed('j'.repeat(40))) {
  const otpService = { notifyCoachOfPlayerId: jest.fn() };
  const service = new CoachPlayerService({
    coachRepository: new CoachRepository(noopLogger),
    playerRepository: new PlayerRepository(noopLogger),
    teamRepository: new TeamRepository(noopLogger),
    auditLogRepository: new AuditLogRepository(noopLogger),
    otpService,
    config,
    logger: noopLogger,
  });
  return { service, otpService };
}

async function coachWithTeam() {
  const coach = await Coach.create({ firstName: 'Ravi', lastName: 'Kale', email: 'ravi@example.com', phone: COACH_PHONE, password: COACH_PASSWORD });
  const team = await Team.create({ name: 'Shivaji Club', coach: coach._id });
  return { coach, team };
}

const AARAV = {
  firstName: 'Aarav', lastName: 'Patil', dateOfBirth: new Date('2016-06-15'), gender: 'Male',
  guardianConsent: true,
};

beforeAll(async () => {
  await Player.init();
});

describe('default player password', () => {
  test('is unset until the coach saves one, then readable', async () => {
    const { service } = build();
    const { coach } = await coachWithTeam();

    expect(await service.getDefaultPassword(coach._id)).toMatchObject({ isSet: false, password: null });

    await service.setDefaultPassword(coach._id, { password: DEFAULT, currentPassword: COACH_PASSWORD });
    const read = await service.getDefaultPassword(coach._id);
    expect(read).toMatchObject({ isSet: true, readable: true, password: DEFAULT });
    expect(read.setAt).toBeInstanceOf(Date);
  });

  test('is stored encrypted, and never serialised with the profile', async () => {
    const { service } = build();
    const { coach } = await coachWithTeam();
    await service.setDefaultPassword(coach._id, { password: DEFAULT, currentPassword: COACH_PASSWORD });

    const raw = await Coach.findById(coach._id).select('+playerDefaultPassword').lean();
    expect(raw.playerDefaultPassword).toBeTruthy();
    expect(raw.playerDefaultPassword).not.toContain(DEFAULT);
    const doc = await Coach.findById(coach._id).select('+playerDefaultPassword');
    expect(JSON.parse(JSON.stringify(doc))).not.toHaveProperty('playerDefaultPassword');
  });

  test('needs the coach own current password', async () => {
    const { service } = build();
    const { coach } = await coachWithTeam();
    await expect(service.setDefaultPassword(coach._id, { password: DEFAULT, currentPassword: 'wrong' }))
      .rejects.toBeInstanceOf(AuthenticationError);
    expect((await service.getDefaultPassword(coach._id)).isSet).toBe(false);
  });

  test('reads as set-but-unreadable after a key change', async () => {
    const { service } = build();
    const { coach } = await coachWithTeam();
    await service.setDefaultPassword(coach._id, { password: DEFAULT, currentPassword: COACH_PASSWORD });

    const rotated = build(keyed('k'.repeat(40))).service;
    expect(await rotated.getDefaultPassword(coach._id)).toMatchObject({ isSet: true, readable: false, password: null });
  });
});

describe('registering a player with no email', () => {
  test('creates a Player ID account on the coach team with the default password', async () => {
    const { service, otpService } = build();
    const { coach, team } = await coachWithTeam();
    await service.setDefaultPassword(coach._id, { password: DEFAULT, currentPassword: COACH_PASSWORD });

    const { player, team: onTeam } = await service.registerPlayer(coach._id, AARAV);

    expect(player.loginId).toBe('aarav.patil.150616');
    expect(String(onTeam._id)).toBe(String(team._id));

    const stored = await Player.findById(player._id).select('+password').lean();
    expect(stored.emailType).toBe('none');
    expect(stored.email).toBeUndefined();
    expect(String(stored.team)).toBe(String(team._id));
    // The coach is the contact of record.
    expect(stored.guardian).toMatchObject({ name: 'Ravi Kale', relation: 'Coach', phone: COACH_PHONE });
    expect(stored.consentAt).toBeInstanceOf(Date);
    expect(String(stored.registeredByCoach)).toBe(String(coach._id));
    expect(await bcrypt.compare(DEFAULT, stored.password)).toBe(true);

    expect(otpService.notifyCoachOfPlayerId).toHaveBeenCalledWith(
      coach._id,
      expect.objectContaining({ loginId: 'aarav.patil.150616' }),
      'registered-by-coach',
      'Shivaji Club'
    );
    expect(await AuditLog.countDocuments({ action: 'COACH_REGISTERED_PLAYER', adminType: 'coach' })).toBe(1);
  });

  test('refuses until the coach has a team and a default password', async () => {
    const { service } = build();
    const lone = await Coach.create({ firstName: 'No', lastName: 'Team', email: 'noteam@example.com', password: COACH_PASSWORD });
    await expect(service.registerPlayer(lone._id, AARAV)).rejects.toThrow('Create your team');

    const { coach } = await coachWithTeam();
    await expect(service.registerPlayer(coach._id, AARAV)).rejects.toBeInstanceOf(ValidationError);
    expect(await Player.countDocuments()).toBe(0);
  });

  test('ignores a guardian sent by the client, and needs the coach phone', async () => {
    const { service } = build();
    const { coach } = await coachWithTeam();
    await service.setDefaultPassword(coach._id, { password: DEFAULT, currentPassword: COACH_PASSWORD });

    const { player } = await service.registerPlayer(coach._id, { ...AARAV, guardian: { name: 'Someone Else', relation: 'Mother', phone: '9000000000' } });
    expect((await Player.findById(player._id).lean()).guardian).toMatchObject({ name: 'Ravi Kale', relation: 'Coach' });

    await Coach.updateOne({ _id: coach._id }, { $set: { phone: null } });
    await expect(service.registerPlayer(coach._id, { ...AARAV, firstName: 'Diya', gender: 'Female' }))
      .rejects.toThrow('Add your phone number');
  });

  test('stops at a same-name, same-birthday player until the coach confirms', async () => {
    const { service } = build();
    const { coach } = await coachWithTeam();
    await service.setDefaultPassword(coach._id, { password: DEFAULT, currentPassword: COACH_PASSWORD });
    await service.registerPlayer(coach._id, AARAV);

    const error = await service.registerPlayer(coach._id, { ...AARAV, firstName: 'aarav' }).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.details.matches).toEqual([{ loginId: 'aarav.patil.150616', name: 'Aarav Patil', team: 'Shivaji Club' }]);

    const { player } = await service.registerPlayer(coach._id, { ...AARAV, confirmDuplicate: true });
    expect(player.loginId).toBe('aarav.patil.150616.2');
  });

  test('changing the default later leaves existing players alone', async () => {
    const { service } = build();
    const { coach } = await coachWithTeam();
    await service.setDefaultPassword(coach._id, { password: DEFAULT, currentPassword: COACH_PASSWORD });
    const { player } = await service.registerPlayer(coach._id, AARAV);

    await service.setDefaultPassword(coach._id, { password: 'NewDefault9', currentPassword: COACH_PASSWORD });
    const { player: next } = await service.registerPlayer(coach._id, { ...AARAV, firstName: 'Diya', gender: 'Female' });

    const first = await Player.findById(player._id).select('+password').lean();
    const second = await Player.findById(next._id).select('+password').lean();
    expect(await bcrypt.compare(DEFAULT, first.password)).toBe(true);
    expect(await bcrypt.compare('NewDefault9', second.password)).toBe(true);
  });
});
