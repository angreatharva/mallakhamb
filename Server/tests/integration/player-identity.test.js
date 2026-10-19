/**
 * Players without an email of their own: the Player ID, the shared guardian
 * address, and the three sign-in / reset paths — against real repositories
 * and models on an in-memory MongoDB.
 */

const AuthenticationService = require('../../src/services/auth/authentication.service');
const PlayerRepository = require('../../src/repositories/player.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const JudgeRepository = require('../../src/repositories/judge.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const Player = require('../../src/models/Player');
const { ConflictError } = require('../../src/errors');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const PASSWORD = 'CorrectHorse1';
const GUARDIAN = { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' };

const child = (overrides = {}) => ({
  firstName: 'Aarav',
  lastName: 'Patil',
  dateOfBirth: new Date('2016-06-15'),
  gender: 'Male',
  password: PASSWORD,
  guardianConsent: true,
  ...overrides,
});

function build() {
  const otpService = {
    generateAndSendOTP: jest.fn(async () => ({ delivery: Promise.resolve() })),
    verifyOTP: jest.fn(async () => true),
    notifyPlayerLoginIds: jest.fn(),
    notifyPasswordChanged: jest.fn(),
  };
  const auth = new AuthenticationService(
    new PlayerRepository(noopLogger),
    new CoachRepository(noopLogger),
    new AdminRepository(noopLogger),
    new JudgeRepository(noopLogger),
    new CompetitionRepository(noopLogger),
    { generateToken: () => 'stub-token' },
    otpService,
    noopLogger
  );
  // Revoking sessions needs the token store; not under test here.
  auth._endSessionsAfterPasswordChange = jest.fn();
  return { auth, otpService };
}

beforeAll(async () => {
  await Player.init(); // build the schema indexes the uniqueness rules rely on
});

describe('Player ID assignment', () => {
  test('a new player gets firstname.lastname.ddmmyy', async () => {
    const player = await Player.create(child({ email: 'a@example.com' }));
    expect(player.loginId).toBe('aarav.patil.150616');
  });

  test('the same name and birthday get .2, then .3', async () => {
    const ids = [];
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
      ids.push((await Player.create(child({ email }))).loginId);
    }
    expect(ids).toEqual(['aarav.patil.150616', 'aarav.patil.150616.2', 'aarav.patil.150616.3']);
  });

  test('two registrations racing for one ID both succeed, with different IDs', async () => {
    const repo = new PlayerRepository(noopLogger);
    const made = await Promise.all([
      repo.create(child({ email: 'race1@example.com' })),
      repo.create(child({ email: 'race2@example.com' })),
    ]);
    expect(new Set(made.map((p) => p.loginId)).size).toBe(2);
  });

  test('a corrected name or birthday leaves the ID alone', async () => {
    const player = await Player.create(child({ email: 'a@example.com' }));
    player.firstName = 'Arav';
    player.dateOfBirth = new Date('2016-06-16');
    await player.save();
    expect(player.loginId).toBe('aarav.patil.150616');
  });
});

describe('who an email belongs to', () => {
  test("siblings may share a guardian's address", async () => {
    await Player.create(child({ emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN }));
    await expect(Player.create(child({ firstName: 'Diya', emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN })))
      .resolves.toBeTruthy();
  });

  test('two players may not share their OWN address', async () => {
    await Player.create(child({ email: 'own@example.com' }));
    await expect(Player.create(child({ firstName: 'Diya', email: 'own@example.com' }))).rejects.toThrow(/duplicate key/);
  });

  test('a player with no email stores none', async () => {
    const player = await Player.create(child({ emailType: 'none', email: 'ignored@example.com', guardian: GUARDIAN }));
    expect(player.email).toBeUndefined();
  });
});

describe('registration', () => {
  test('the server sets the Player ID and the consent time, never the client', async () => {
    const { auth, otpService } = build();
    const { user } = await auth.register(
      child({ emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN, loginId: 'someone.else.010101' }),
      'player'
    );
    expect(user.loginId).toBe('aarav.patil.150616');
    expect(user.consentAt).toBeInstanceOf(Date);
    expect(user).not.toHaveProperty('guardianConsent');
    expect(otpService.notifyPlayerLoginIds).toHaveBeenCalledWith('parent@example.com', [expect.objectContaining({ loginId: 'aarav.patil.150616' })], 'registered');
  });

  test("a guardian's address may register a second child", async () => {
    const { auth } = build();
    await auth.register(child({ emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN }), 'player');
    await expect(auth.register(child({ firstName: 'Diya', emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN }), 'player'))
      .resolves.toHaveProperty('user.loginId', 'diya.patil.150616');
  });

  test('an own address still may not be reused', async () => {
    const { auth } = build();
    await auth.register(child({ email: 'own@example.com' }), 'player');
    await expect(auth.register(child({ firstName: 'Diya', email: 'own@example.com' }), 'player')).rejects.toBeInstanceOf(ConflictError);
  });

  test('a player with no email registers and is mailed nothing', async () => {
    const { auth, otpService } = build();
    const { user } = await auth.register(child({ emailType: 'none', guardian: GUARDIAN }), 'player');
    expect(user.email).toBeUndefined();
    expect(otpService.notifyPlayerLoginIds).not.toHaveBeenCalled();
  });
});

describe('sign-in', () => {
  test('every player can sign in with their Player ID, in any case', async () => {
    const { auth } = build();
    await auth.register(child({ emailType: 'none', guardian: GUARDIAN }), 'player');
    await expect(auth.login('Aarav.Patil.150616', PASSWORD, 'player')).resolves.toHaveProperty('token', 'stub-token');
  });

  test('a player with their own email can still sign in with it', async () => {
    const { auth } = build();
    await auth.register(child({ email: 'own@example.com' }), 'player');
    await expect(auth.login('own@example.com', PASSWORD, 'player')).resolves.toHaveProperty('token');
  });

  test("a guardian's address signs nobody in — it could be any of the children", async () => {
    const { auth } = build();
    await auth.register(child({ emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN }), 'player');
    await expect(auth.login('parent@example.com', PASSWORD, 'player')).rejects.toThrow(/Invalid credentials/);
  });
});

describe('forgot password', () => {
  test('by Player ID, the code goes to the guardian address', async () => {
    const { auth, otpService } = build();
    await auth.register(child({ emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN }), 'player');
    await auth.forgotPassword('aarav.patil.150616', 'player');
    expect(otpService.generateAndSendOTP).toHaveBeenCalledWith(expect.objectContaining({ email: 'parent@example.com' }), 'player');
  });

  test('a player with no email gets no code (the coach resets it)', async () => {
    const { auth, otpService } = build();
    await auth.register(child({ emailType: 'none', guardian: GUARDIAN }), 'player');
    await expect(auth.forgotPassword('aarav.patil.150616', 'player')).resolves.toBeUndefined();
    expect(otpService.generateAndSendOTP).not.toHaveBeenCalled();
  });

  test("a guardian's address is mailed every child's Player ID, and no code", async () => {
    const { auth, otpService } = build();
    await auth.register(child({ emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN }), 'player');
    await auth.register(child({ firstName: 'Diya', emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN }), 'player');
    otpService.notifyPlayerLoginIds.mockClear();

    await auth.forgotPassword('parent@example.com', 'player');

    expect(otpService.generateAndSendOTP).not.toHaveBeenCalled();
    const [to, players, reason] = otpService.notifyPlayerLoginIds.mock.calls[0];
    expect(to).toBe('parent@example.com');
    expect(players.map((p) => p.loginId)).toEqual(['aarav.patil.150616', 'diya.patil.150616']);
    expect(reason).toBe('reminder');
  });

  test('a Player ID never resolves to a coach, admin or judge account', async () => {
    const { auth } = build();
    await auth.register(child({ emailType: 'none', guardian: GUARDIAN }), 'player');
    await expect(auth.findUserAcrossTypes('aarav.patil.150616', 'coach')).resolves.toEqual({ user: null, userType: null });
  });

  test('the reset itself works by Player ID', async () => {
    const { auth } = build();
    await auth.register(child({ emailType: 'guardian', email: 'parent@example.com', guardian: GUARDIAN }), 'player');
    await Player.updateOne({ loginId: 'aarav.patil.150616' }, {
      resetPasswordToken: '123456', resetPasswordExpires: new Date(Date.now() + 60_000),
    });

    await auth.resetPasswordWithOTP('aarav.patil.150616', '123456', 'NewPassword9', 'player');

    await expect(auth.login('aarav.patil.150616', 'NewPassword9', 'player')).resolves.toHaveProperty('token');
  });
});
