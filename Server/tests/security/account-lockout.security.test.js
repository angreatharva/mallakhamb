/**
 * End-to-end verification for MED-1 (account lockout) and LOW-4 (login timing),
 * against real repositories and real Mongoose models on an in-memory MongoDB.
 *
 * The unit tests next to the util cover the policy arithmetic. This file covers
 * the part most likely to break silently: `loginAttempts` and `lockUntil` are
 * `select: false`, exactly like `password`. If a login lookup forgets to opt
 * into them, `getLockoutState` sees `undefined`, every account looks unlocked,
 * and the feature does nothing at all while appearing to be wired up.
 */

const AuthenticationService = require('../../src/services/auth/authentication.service');
const JudgeService = require('../../src/services/user/judge.service');
const CoachRepository = require('../../src/repositories/coach.repository');
const PlayerRepository = require('../../src/repositories/player.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const JudgeRepository = require('../../src/repositories/judge.repository');
const JudgeAccountRepository = require('../../src/repositories/judge-account.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');

const Coach = require('../../src/models/Coach');
const Judge = require('../../src/models/Judge');
const JudgeAccount = require('../../src/models/JudgeAccount');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

const PASSWORD = 'CorrectHorse1';
const WRONG = 'WrongPassword9';
const EMAIL = 'lockout-coach@example.com';

function buildAuthService() {
  return new AuthenticationService(
    new PlayerRepository(noopLogger),
    new CoachRepository(noopLogger),
    new AdminRepository(noopLogger),
    new JudgeRepository(noopLogger),
    new CompetitionRepository(noopLogger),
    { generateToken: () => 'stub-token' },
    {},
    noopLogger
  );
}

/** Read the counters back, opting into the `select: false` fields. */
function readCounters(email) {
  return Coach.findOne({ email }).select('+loginAttempts +lockUntil');
}

describe('MED-1 — account lockout is enforced (FIXED)', () => {
  let auth;

  beforeEach(async () => {
    auth = buildAuthService();
    // Saved through the model so the real pre-save hook hashes the password.
    await Coach.create({ firstName: 'Lockout', lastName: 'Coach', email: EMAIL, password: PASSWORD });
  });

  test('a wrong password increments the stored counter', async () => {
    await expect(auth.login(EMAIL, WRONG, 'coach')).rejects.toThrow(/Invalid credentials/);

    const coach = await readCounters(EMAIL);
    // Proves the lookup really opted into the select:false counter — if it did
    // not, this stays 0 and the whole feature is inert.
    expect(coach.loginAttempts).toBe(1);
    expect(coach.lockUntil).toBeNull();
  });

  test('the 5th failure locks the account and says so', async () => {
    for (let i = 0; i < 4; i += 1) {
      await expect(auth.login(EMAIL, WRONG, 'coach')).rejects.toThrow(/Invalid credentials/);
    }

    // The 5th attempt trips the lock, and the message must say "locked" —
    // the login page keys its countdown UI off that word.
    await expect(auth.login(EMAIL, WRONG, 'coach')).rejects.toThrow(/locked/i);

    const coach = await readCounters(EMAIL);
    expect(coach.loginAttempts).toBe(5);
    expect(coach.lockUntil).toBeInstanceOf(Date);
    expect(coach.lockUntil.getTime()).toBeGreaterThan(Date.now());
  });

  test('a locked account rejects even the CORRECT password', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(auth.login(EMAIL, WRONG, 'coach')).rejects.toThrow();
    }

    await expect(auth.login(EMAIL, PASSWORD, 'coach')).rejects.toThrow(/locked/i);
  });

  test('an expired lock lets the user back in', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(auth.login(EMAIL, WRONG, 'coach')).rejects.toThrow();
    }

    // Wind the lock into the past — a lockout that never expires would be the
    // worst failure mode of this feature.
    await Coach.updateOne({ email: EMAIL }, { $set: { lockUntil: new Date(Date.now() - 1000) } });

    await expect(auth.login(EMAIL, PASSWORD, 'coach')).resolves.toBeTruthy();
  });

  test('a successful login clears the counter', async () => {
    await expect(auth.login(EMAIL, WRONG, 'coach')).rejects.toThrow();
    await expect(auth.login(EMAIL, WRONG, 'coach')).rejects.toThrow();

    await expect(auth.login(EMAIL, PASSWORD, 'coach')).resolves.toBeTruthy();

    const coach = await readCounters(EMAIL);
    expect(coach.loginAttempts).toBe(0);
    expect(coach.lockUntil).toBeNull();
  });

  test('the counters never appear in the login response', async () => {
    const result = await auth.login(EMAIL, PASSWORD, 'coach');
    const body = JSON.stringify(result);

    expect(body).not.toMatch(/\$2[aby]\$/);
    expect(body).not.toContain('lockUntil');
    expect(body).not.toContain('loginAttempts');
  });
});

describe('MED-1 — judge login is covered too', () => {
  let judgeService;
  const EMAIL = 'lockjudge1@club.in';

  beforeEach(async () => {
    judgeService = new JudgeService({
      judgeRepository: new JudgeRepository(noopLogger),
      judgeAccountRepository: new JudgeAccountRepository(noopLogger),
      competitionRepository: new CompetitionRepository(noopLogger),
      logger: noopLogger,
    });

    const account = await JudgeAccount.create({
      firstName: 'Lock', lastName: 'Judge',
      email: EMAIL,
      password: PASSWORD,
      isActive: true,
    });

    await Judge.create({
      judgeAccount: account._id,
      competition: new (require('mongoose').Types.ObjectId)(),
      competitionTypes: ['competition_1'],
      gender: 'Male',
      ageGroup: 'Under14',
      judgeNo: 1,
      judgeType: 'Judge 1',
      isActive: true,
    });
  });

  test('judge login locks after the configured attempts', async () => {
    // Judges are the live-event critical path, and the password is the only
    // barrier on the account.
    for (let i = 0; i < 4; i += 1) {
      await expect(judgeService.loginJudge(EMAIL, WRONG)).rejects.toThrow(/Invalid credentials/);
    }

    await expect(judgeService.loginJudge(EMAIL, WRONG)).rejects.toThrow(/locked/i);

    // One budget for the person, not one per seat: the counter lives on the
    // account, so holding three seats no longer means three times the guesses.
    const account = await JudgeAccount.findOne({ email: EMAIL }).select('+loginAttempts +lockUntil');
    expect(account.loginAttempts).toBe(5);
    expect(account.lockUntil).toBeInstanceOf(Date);
  });
});

describe('LOW-4 — login does not leak account existence by timing', () => {
  let auth;

  beforeEach(async () => {
    auth = buildAuthService();
    await Coach.create({ firstName: 'Timing', lastName: 'Coach', email: EMAIL, password: PASSWORD });
  });

  /**
   * Wall-clock timing is inherently noisy, so this asserts the mechanism rather
   * than a threshold: an unknown e-mail must still perform a bcrypt comparison.
   * A strict duration assertion here would be flaky in CI, which is worse than
   * useless for a security guard.
   */
  test('an unknown e-mail still costs a bcrypt comparison', async () => {
    const bcrypt = require('bcryptjs');
    const spy = jest.spyOn(bcrypt, 'compare');

    await expect(auth.login('no-such-user@example.com', WRONG, 'coach')).rejects.toThrow(
      /Invalid credentials/
    );

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('an unknown e-mail is indistinguishable from a wrong password by message', async () => {
    /*
     * Sequential, not concurrent.
     *
     * These two used to be started together and awaited afterwards. The second
     * increments the failed-attempt counter on a real account, so two
     * overlapping logins raced it — and the test failed intermittently in full
     * runs (never in isolation) when the wrong-password branch came back
     * "Account locked" instead of "Invalid credentials". Whatever the exact
     * interleaving, a security assertion that sometimes tests a different code
     * path is not one worth having.
     */
    const unknownError = await auth.login('no-such-user@example.com', WRONG, 'coach')
      .then(() => null, (error) => error);
    const wrongPasswordError = await auth.login(EMAIL, WRONG, 'coach')
      .then(() => null, (error) => error);

    expect(unknownError).toBeTruthy();
    expect(wrongPasswordError).toBeTruthy();

    // The actual claim is INDISTINGUISHABLE, so compare the messages to each
    // other rather than matching both against a pattern — which two different
    // messages could also satisfy.
    expect(unknownError.message).toBe(wrongPasswordError.message);
    expect(unknownError.message).toMatch(/Invalid credentials/);
  });
});
