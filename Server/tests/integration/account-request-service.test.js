/**
 * Coach / super-admin approval for players who registered without an email
 * (plan Part C), on real models: the reset request, who may decide it, the
 * one-time code, and the email addition that waits for the coach.
 */

const AccountRequestService = require('../../src/services/auth/account-request.service');
const AccountService = require('../../src/services/auth/account.service');
const PlayerRepository = require('../../src/repositories/player.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const JudgeAccountRepository = require('../../src/repositories/judge-account.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const AuditLogRepository = require('../../src/repositories/audit-log.repository');
const AccountRequestRepository = require('../../src/repositories/account-request.repository');
const Player = require('../../src/models/Player');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const AccountRequest = require('../../src/models/AccountRequest');
const AuditLog = require('../../src/models/AuditLog');
const { AuthorizationError, ValidationError } = require('../../src/errors');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const PASSWORD = 'CorrectHorse1';
const GUARDIAN = { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' };

function build() {
  const playerRepository = new PlayerRepository(noopLogger);
  const accountRequestRepository = new AccountRequestRepository(noopLogger);
  const otpService = { sendEmailChangeCode: jest.fn(), notifyEmailChanged: jest.fn(), notifyPasswordChanged: jest.fn() };
  const tokenService = { generateToken: jest.fn(() => 't'), revokeAllRefreshTokens: jest.fn() };
  const accountService = new AccountService({
    playerRepository,
    coachRepository: new CoachRepository(noopLogger),
    adminRepository: new AdminRepository(noopLogger),
    judgeAccountRepository: new JudgeAccountRepository(noopLogger),
    accountRequestRepository,
    tokenService,
    otpService,
    config: { get: () => 10 },
    logger: noopLogger,
  });
  const service = new AccountRequestService({
    accountRequestRepository,
    playerRepository,
    teamRepository: new TeamRepository(noopLogger),
    auditLogRepository: new AuditLogRepository(noopLogger),
    accountService,
    tokenService,
    logger: noopLogger,
  });
  return { service, accountService, otpService, tokenService };
}

async function squad() {
  const coach = await Coach.create({ firstName: 'Ravi', lastName: 'Kale', email: 'ravi@example.com', password: PASSWORD });
  const otherCoach = await Coach.create({ firstName: 'Other', lastName: 'Coach', email: 'other@example.com', password: PASSWORD });
  const team = await Team.create({ name: 'Shivaji Club', coach: coach._id });
  const player = await Player.create({
    firstName: 'Aarav', lastName: 'Patil', dateOfBirth: new Date('2016-06-15'), gender: 'Male',
    password: PASSWORD, emailType: 'none', guardian: GUARDIAN, team: team._id,
  });
  return { coach, otherCoach, team, player };
}

const asCoach = (coach) => ({ userId: coach._id, userType: 'coach' });
const superAdmin = { userId: new Player()._id, userType: 'superadmin' };

beforeAll(async () => {
  await Player.init();
});

describe('opening a reset request', () => {
  test("forgot-password with a no-email player's ID opens one for the coach", async () => {
    const { service } = build();
    const { coach } = await squad();
    await service.openPasswordResetIfNoEmail('Aarav.Patil.150616');

    const waiting = await service.listForCoach(coach._id);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ kind: 'password-reset', status: 'awaiting-coach', player: { loginId: 'aarav.patil.150616', team: 'Shivaji Club' } });
  });

  test('asking twice keeps the one request', async () => {
    const { service } = build();
    await squad();
    await service.openPasswordResetIfNoEmail('aarav.patil.150616');
    await service.openPasswordResetIfNoEmail('aarav.patil.150616');
    expect(await AccountRequest.countDocuments({ kind: 'password-reset' })).toBe(1);
  });

  test('a player with an email, an email address, or an unknown ID opens nothing', async () => {
    const { service } = build();
    await Player.create({ firstName: 'Diya', lastName: 'Rao', dateOfBirth: new Date('2015-01-01'), gender: 'Female', password: PASSWORD, email: 'diya@example.com' });
    await service.openPasswordResetIfNoEmail('diya.rao.010115');
    await service.openPasswordResetIfNoEmail('diya@example.com');
    await service.openPasswordResetIfNoEmail('nobody.here.010101');
    expect(await AccountRequest.countDocuments()).toBe(0);
  });
});

describe('who decides', () => {
  test('only the coach of the player’s team — another coach is refused and sees nothing', async () => {
    const { service } = build();
    const { otherCoach } = await squad();
    await service.openPasswordResetIfNoEmail('aarav.patil.150616');
    const request = await AccountRequest.findOne();

    expect(await service.listForCoach(otherCoach._id)).toEqual([]);
    await expect(service.approve(request._id, asCoach(otherCoach))).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('a super admin sees and decides every request, including a player on no team', async () => {
    const { service } = build();
    const { player } = await squad();
    await Player.updateOne({ _id: player._id }, { $set: { team: null } });
    await service.openPasswordResetIfNoEmail('aarav.patil.150616');

    const all = await service.listForSuperAdmin();
    expect(all).toHaveLength(1);
    await expect(service.approve(all[0].id, superAdmin)).resolves.toMatchObject({ status: 'approved' });
  });

  test('a decision is written to the audit log', async () => {
    const { service } = build();
    const { coach } = await squad();
    await service.openPasswordResetIfNoEmail('aarav.patil.150616');
    const request = await AccountRequest.findOne();
    await service.reject(request._id, asCoach(coach));

    const entry = await AuditLog.findOne({ action: 'account-request.reject' }).lean();
    expect(entry).toMatchObject({ adminType: 'coach', resource: 'player' });
    expect(String(entry.adminId)).toBe(String(coach._id));
    expect((await AccountRequest.findById(request._id)).status).toBe('rejected');
  });
});

describe('reset with the coach’s code', () => {
  async function approved() {
    const ctx = build();
    const s = await squad();
    await ctx.service.openPasswordResetIfNoEmail('aarav.patil.150616');
    const request = await AccountRequest.findOne();
    const { code, codeExpiresAt } = await ctx.service.approve(request._id, asCoach(s.coach));
    return { ...ctx, ...s, request, code, codeExpiresAt };
  }

  test('approving gives the coach a 6-digit code good for 24 hours, stored only hashed', async () => {
    const { code, codeExpiresAt, request } = await approved();
    expect(code).toMatch(/^\d{6}$/);
    expect(codeExpiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
    const stored = await AccountRequest.findById(request._id).select('+codeHash').lean();
    expect(stored.status).toBe('approved');
    expect(stored.codeHash).not.toContain(code);
  });

  test('the player resets with Player ID + code, and every session ends', async () => {
    const { service, tokenService, player, code } = await approved();
    await service.completePasswordReset('aarav.patil.150616', code, 'NewPassword9');

    const reloaded = await Player.findById(player._id).select('+password');
    expect(await reloaded.comparePassword('NewPassword9')).toBe(true);
    expect(tokenService.revokeAllRefreshTokens).toHaveBeenCalledWith(String(player._id));
    expect((await AccountRequest.findOne()).status).toBe('done');
  });

  test('the code works once', async () => {
    const { service, code } = await approved();
    await service.completePasswordReset('aarav.patil.150616', code, 'NewPassword9');
    await expect(service.completePasswordReset('aarav.patil.150616', code, 'Another1Pass')).rejects.toBeInstanceOf(ValidationError);
  });

  test('five wrong codes void the approval', async () => {
    const { service, code } = await approved();
    for (let i = 0; i < 5; i += 1) {
      await expect(service.completePasswordReset('aarav.patil.150616', '000000', 'NewPassword9')).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(service.completePasswordReset('aarav.patil.150616', code, 'NewPassword9')).rejects.toBeInstanceOf(ValidationError);
  });

  test('a code before approval does nothing', async () => {
    const { service } = build();
    await squad();
    await service.openPasswordResetIfNoEmail('aarav.patil.150616');
    await expect(service.completePasswordReset('aarav.patil.150616', '123456', 'NewPassword9')).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('adding an email', () => {
  test('confirmed by code, then approved by the coach, then added', async () => {
    const { service, accountService, otpService } = build();
    const { coach, player } = await squad();

    await accountService.requestEmailChange(player._id, 'player', { newEmail: 'parent@example.com', emailType: 'guardian', currentPassword: PASSWORD });
    const code = otpService.sendEmailChangeCode.mock.calls[0][1].code;
    await accountService.confirmEmailChange(player._id, 'player', code);

    const [waiting] = await service.listForCoach(coach._id);
    expect(waiting).toMatchObject({ kind: 'email-change', status: 'awaiting-coach', newEmail: 'parent@example.com' });

    await expect(service.approve(waiting.id, asCoach(coach))).resolves.toEqual({ status: 'done' });
    const reloaded = await Player.findById(player._id);
    expect(reloaded).toMatchObject({ email: 'parent@example.com', emailType: 'guardian' });
    expect(await service.listForCoach(coach._id)).toEqual([]);
  });

  test('an address still waiting on its code is not the coach’s to approve yet', async () => {
    const { service, accountService } = build();
    const { coach, player } = await squad();
    await accountService.requestEmailChange(player._id, 'player', { newEmail: 'parent@example.com', emailType: 'guardian', currentPassword: PASSWORD });
    expect(await service.listForCoach(coach._id)).toEqual([]);
  });
});
