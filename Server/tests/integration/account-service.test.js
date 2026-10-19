/**
 * The signed-in user's own account (AccountService): profile edits, password
 * change, and the two-step email change — for each role, on real models.
 */

const AccountService = require('../../src/services/auth/account.service');
const PlayerRepository = require('../../src/repositories/player.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const JudgeAccountRepository = require('../../src/repositories/judge-account.repository');
const AccountRequestRepository = require('../../src/repositories/account-request.repository');
const Player = require('../../src/models/Player');
const Coach = require('../../src/models/Coach');
const Admin = require('../../src/models/Admin');
const AccountRequest = require('../../src/models/AccountRequest');
const tokenInvalidation = require('../../src/utils/security/token-invalidation.util');
const { AuthenticationError, ConflictError, ValidationError } = require('../../src/errors');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const PASSWORD = 'CorrectHorse1';
const GUARDIAN = { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' };

function build() {
  const otpService = {
    sendEmailChangeCode: jest.fn(),
    notifyEmailChanged: jest.fn(),
    notifyPasswordChanged: jest.fn(),
  };
  const tokenService = {
    generateToken: jest.fn(() => 'fresh-token'),
    revokeAllRefreshTokens: jest.fn(),
  };
  const service = new AccountService({
    playerRepository: new PlayerRepository(noopLogger),
    coachRepository: new CoachRepository(noopLogger),
    adminRepository: new AdminRepository(noopLogger),
    judgeAccountRepository: new JudgeAccountRepository(noopLogger),
    accountRequestRepository: new AccountRequestRepository(noopLogger),
    tokenService,
    otpService,
    config: { get: (key) => (key === 'security.otpExpiry' ? 10 : undefined) },
    logger: noopLogger,
  });
  // The mailed code, as the owner would read it.
  const lastCode = () => otpService.sendEmailChangeCode.mock.calls.at(-1)[1].code;
  return { service, otpService, tokenService, lastCode };
}

const player = (overrides = {}) => Player.create({
  firstName: 'Aarav', lastName: 'Patil', dateOfBirth: new Date('2016-06-15'), gender: 'Male',
  password: PASSWORD, email: 'aarav@example.com', ...overrides,
});
const coach = (overrides = {}) => Coach.create({
  firstName: 'Ravi', lastName: 'Kale', email: 'ravi@example.com', password: PASSWORD, ...overrides,
});

beforeAll(async () => {
  await Player.init();
  await Coach.init();
});

describe('profile', () => {
  test('a role edits only its own editable fields', async () => {
    const { service } = build();
    const c = await coach();
    const { user } = await service.updateProfile(c._id, 'coach', {
      firstName: 'Ravindra', phone: '9123456789', email: 'hijack@example.com', isActive: false, team: null,
    });
    expect(user).toMatchObject({ firstName: 'Ravindra', phone: '9123456789', email: 'ravi@example.com', isActive: true });
  });

  test('an admin edits a single name', async () => {
    const { service } = build();
    const admin = await Admin.create({ name: 'Org One', email: 'org@example.com', password: PASSWORD });
    const { user } = await service.updateProfile(admin._id, 'admin', { name: 'Organiser One', role: 'superadmin' });
    expect(user.name).toBe('Organiser One');
    expect(user.role).toBe(admin.role);
  });

  test("a player's Player ID never changes here", async () => {
    const { service } = build();
    const p = await player();
    const { user } = await service.updateProfile(p._id, 'player', { loginId: 'someone.else.010101', firstName: 'Arav' });
    expect(user.loginId).toBe('aarav.patil.150616');
    expect(user.firstName).toBe('Arav');
  });

  test('date of birth and gender are the player’s to fix only before joining a team', async () => {
    const { service } = build();
    const free = await player();
    await service.updateProfile(free._id, 'player', { dateOfBirth: new Date('2016-06-16') });
    expect((await Player.findById(free._id)).dateOfBirth.toISOString().slice(0, 10)).toBe('2016-06-16');

    const onTeam = await player({ email: 'b@example.com', team: new Player()._id });
    await service.updateProfile(onTeam._id, 'player', { dateOfBirth: new Date('2010-01-01'), gender: 'Female' });
    const reloaded = await Player.findById(onTeam._id);
    expect(reloaded.dateOfBirth.toISOString().slice(0, 10)).toBe('2016-06-15');
    expect(reloaded.gender).toBe('Male');
  });

  test('a player without their own email cannot drop their guardian', async () => {
    const { service } = build();
    const p = await player({ emailType: 'none', email: undefined, guardian: GUARDIAN });
    await expect(service.updateProfile(p._id, 'player', { guardian: { name: '', phone: '' } }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe('password change', () => {
  test('needs the current password', async () => {
    const { service } = build();
    const c = await coach();
    await expect(service.changePassword(c._id, 'coach', 'WrongPass1', 'NewPassword9'))
      .rejects.toBeInstanceOf(AuthenticationError);
  });

  test('changes it, signs other sessions out, and gives this one a token that survives that', async () => {
    const { service, tokenService } = build();
    const c = await coach();
    const before = Math.floor(Date.now() / 1000);

    const { token } = await service.changePassword(c._id, 'coach', PASSWORD, 'NewPassword9', 'comp-1');

    expect(token).toBe('fresh-token');
    expect(tokenService.revokeAllRefreshTokens).toHaveBeenCalledWith(String(c._id));
    // A token from before the change is now logged out…
    expect(await tokenInvalidation.isTokenLoggedOut(String(c._id), before)).toBe(true);
    // …and the new one, issued at the next whole second, is not.
    const [, , competition, { issuedAt }] = tokenService.generateToken.mock.calls[0];
    expect(competition).toBe('comp-1');
    expect(await tokenInvalidation.isTokenLoggedOut(String(c._id), issuedAt)).toBe(false);

    const stored = await Coach.findById(c._id).select('+password');
    expect(await stored.comparePassword('NewPassword9')).toBe(true);
  });
});

describe('email change', () => {
  test('a code goes to the NEW address, and the email changes only once it comes back', async () => {
    const { service, otpService, lastCode } = build();
    const c = await coach();

    await service.requestEmailChange(c._id, 'coach', { newEmail: 'New@Example.com', currentPassword: PASSWORD });
    expect(otpService.sendEmailChangeCode).toHaveBeenCalledWith('new@example.com', expect.any(Object));
    expect((await Coach.findById(c._id)).email).toBe('ravi@example.com');

    const { status } = await service.confirmEmailChange(c._id, 'coach', lastCode());
    expect(status).toBe('done');
    expect((await Coach.findById(c._id)).email).toBe('new@example.com');
    expect(otpService.notifyEmailChanged).toHaveBeenCalledWith('ravi@example.com', expect.objectContaining({ newEmail: 'new@example.com' }));
  });

  test('the code is never stored as typed', async () => {
    const { service, lastCode } = build();
    const c = await coach();
    await service.requestEmailChange(c._id, 'coach', { newEmail: 'new@example.com', currentPassword: PASSWORD });
    const stored = await AccountRequest.findOne({ user: c._id }).select('+codeHash').lean();
    expect(stored.codeHash).not.toContain(lastCode());
  });

  test('needs the current password and a free address', async () => {
    const { service } = build();
    const c = await coach();
    await coach({ email: 'taken@example.com' });
    await expect(service.requestEmailChange(c._id, 'coach', { newEmail: 'x@example.com', currentPassword: 'nope' }))
      .rejects.toBeInstanceOf(AuthenticationError);
    await expect(service.requestEmailChange(c._id, 'coach', { newEmail: 'taken@example.com', currentPassword: PASSWORD }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  test('five wrong codes drop the request', async () => {
    const { service } = build();
    const c = await coach();
    await service.requestEmailChange(c._id, 'coach', { newEmail: 'new@example.com', currentPassword: PASSWORD });
    for (let i = 0; i < 5; i += 1) {
      await expect(service.confirmEmailChange(c._id, 'coach', '000000')).rejects.toBeInstanceOf(ValidationError);
    }
    expect((await AccountRequest.findOne({ user: c._id })).status).toBe('expired');
  });

  test("a player may switch to a guardian's address that a sibling already uses", async () => {
    const { service, lastCode } = build();
    await player({ firstName: 'Diya', emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN });
    const p = await player({ guardian: GUARDIAN });

    await service.requestEmailChange(p._id, 'player', { newEmail: 'parent@example.com', emailType: 'guardian', currentPassword: PASSWORD });
    await service.confirmEmailChange(p._id, 'player', lastCode());

    const reloaded = await Player.findById(p._id);
    expect(reloaded).toMatchObject({ email: 'parent@example.com', emailType: 'guardian' });
  });

  test('a player with no email waits for their coach after confirming the code', async () => {
    const { service, lastCode } = build();
    const p = await player({ emailType: 'none', email: undefined, guardian: GUARDIAN });

    await service.requestEmailChange(p._id, 'player', { newEmail: 'parent@example.com', emailType: 'guardian', currentPassword: PASSWORD });
    const { status } = await service.confirmEmailChange(p._id, 'player', lastCode());

    expect(status).toBe('awaiting-coach');
    expect((await Player.findById(p._id)).email).toBeUndefined();
    const { pendingEmailChange } = await service.getAccount(p._id, 'player');
    expect(pendingEmailChange).toMatchObject({ newEmail: 'parent@example.com', status: 'awaiting-coach' });
  });

  test('starting again replaces the change in progress', async () => {
    const { service } = build();
    const c = await coach();
    await service.requestEmailChange(c._id, 'coach', { newEmail: 'one@example.com', currentPassword: PASSWORD });
    await service.requestEmailChange(c._id, 'coach', { newEmail: 'two@example.com', currentPassword: PASSWORD });
    const open = await AccountRequest.find({ user: c._id, status: { $in: AccountRequest.OPEN_STATUSES } });
    expect(open.map((r) => r.newEmail)).toEqual(['two@example.com']);
  });
});
