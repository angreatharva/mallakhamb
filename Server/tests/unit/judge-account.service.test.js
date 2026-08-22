/**
 * JudgeAccountService — judge self-registration, profile and password change.
 *
 * The parts worth pinning: a duplicate address is refused rather than creating
 * a second login for one person, the profile response never carries the hash,
 * a profile update cannot escalate anything through extra body fields, and a
 * password change is refused without the current password.
 */

const JudgeAccountService = require('../../src/services/user/judge-account.service');
const { ConflictError, NotFoundError, AuthenticationError } = require('../../src/errors');

const noopLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const ACCOUNT_ID = 'account-1';

function buildService({ accounts = [], assignments = [], competitions = [] } = {}) {
  const store = new Map(accounts.map((a) => [String(a._id), { ...a }]));

  const judgeAccountRepository = {
    create: jest.fn(async (data) => {
      const created = { _id: ACCOUNT_ID, ...data, password: `hashed:${data.password}` };
      store.set(ACCOUNT_ID, created);
      return created;
    }),
    findById: jest.fn(async (id, options = {}) => {
      const found = store.get(String(id));
      if (!found) return null;
      const copy = { ...found };
      if (!options.select?.includes('+password')) delete copy.password;
      return copy;
    }),
    isEmailTaken: jest.fn(async (email, excludeId = null) =>
      [...store.values()].some(
        (a) => a.email === String(email).toLowerCase() && String(a._id) !== String(excludeId)
      )
    ),
    updateById: jest.fn(async (id, updates) => {
      const current = store.get(String(id));
      const next = { ...current, ...updates };
      store.set(String(id), next);
      return next;
    }),
    searchAssignable: jest.fn(async () => []),
  };

  const judgeRepository = { find: jest.fn(async () => assignments) };
  const competitionRepository = { find: jest.fn(async () => competitions) };
  const tokenService = { generateToken: jest.fn(() => 'signed-token') };

  const service = new JudgeAccountService({
    judgeAccountRepository,
    judgeRepository,
    competitionRepository,
    tokenService,
    logger: noopLogger,
  });

  return { service, judgeAccountRepository, judgeRepository, competitionRepository, tokenService, store };
}

const REGISTRATION = {
  name: 'Pat Mhatre',
  email: 'Pat@Club.IN',
  phone: '9876543210',
  password: 'Judge1234',
};

describe('register', () => {
  it('creates an account, normalizes the email and issues a token with no competition context', async () => {
    const { service, judgeAccountRepository, tokenService } = buildService();

    const result = await service.register(REGISTRATION);

    expect(judgeAccountRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'pat@club.in', name: 'Pat Mhatre' })
    );
    // A brand new judge sits on no panel, so the token must not claim a
    // competition — that claim is what gates every scoring route.
    expect(tokenService.generateToken).toHaveBeenCalledWith(ACCOUNT_ID, 'judge');
    expect(result.token).toBe('signed-token');
  });

  it('never returns the password hash', async () => {
    const { service } = buildService();

    const result = await service.register(REGISTRATION);

    expect(result.user).not.toHaveProperty('password');
  });

  it('refuses an address that is already registered', async () => {
    const { service } = buildService({
      accounts: [{ _id: 'existing', email: 'pat@club.in' }],
    });

    await expect(service.register(REGISTRATION)).rejects.toThrow(ConflictError);
  });
});

describe('getProfile', () => {
  it('returns the account with its assignments resolved to competitions', async () => {
    const { service } = buildService({
      accounts: [{ _id: ACCOUNT_ID, name: 'Pat', email: 'pat@club.in', password: 'hash' }],
      assignments: [
        { _id: 'a1', competition: 'comp-1', gender: 'Male', ageGroup: 'Under14', judgeType: 'Senior Judge' },
      ],
      competitions: [{ _id: 'comp-1', name: 'Nationals', year: 2026 }],
    });

    const profile = await service.getProfile(ACCOUNT_ID);

    expect(profile).not.toHaveProperty('password');
    expect(profile.assignments).toHaveLength(1);
    expect(profile.assignments[0].competition).toEqual(
      expect.objectContaining({ name: 'Nationals' })
    );
  });

  it('reports an unknown account rather than returning an empty profile', async () => {
    const { service } = buildService();

    await expect(service.getProfile('nope')).rejects.toThrow(NotFoundError);
  });

  it('returns an empty assignment list for a judge nobody has put on a panel', async () => {
    const { service } = buildService({
      accounts: [{ _id: ACCOUNT_ID, name: 'Pat', email: 'pat@club.in' }],
      assignments: [],
    });

    const profile = await service.getProfile(ACCOUNT_ID);

    expect(profile.assignments).toEqual([]);
  });
});

describe('updateProfile', () => {
  it('applies only the editable fields and ignores everything else', async () => {
    const { service, judgeAccountRepository } = buildService({
      accounts: [{ _id: ACCOUNT_ID, name: 'Pat', email: 'pat@club.in' }],
    });

    await service.updateProfile(ACCOUNT_ID, {
      name: 'Pat M',
      stateUnit: 'Maharashtra',
      // None of these may be honoured from a profile body.
      password: 'Hacked123',
      isActive: false,
      isPlaceholderEmail: true,
    });

    const [, applied] = judgeAccountRepository.updateById.mock.calls[0];
    expect(applied).toEqual({ name: 'Pat M', stateUnit: 'Maharashtra' });
  });

  it('clears the placeholder flag when a migrated judge sets a real address', async () => {
    const { service, judgeAccountRepository } = buildService({
      accounts: [{
        _id: ACCOUNT_ID,
        name: 'Pat',
        email: 'j1-m-u14-1.abc123@judges.invalid',
        isPlaceholderEmail: true,
      }],
    });

    await service.updateProfile(ACCOUNT_ID, { email: 'pat@club.in' });

    const [, applied] = judgeAccountRepository.updateById.mock.calls[0];
    expect(applied).toEqual({ email: 'pat@club.in', isPlaceholderEmail: false });
  });

  it('refuses to move to an address another judge already holds', async () => {
    const { service } = buildService({
      accounts: [
        { _id: ACCOUNT_ID, name: 'Pat', email: 'pat@club.in' },
        { _id: 'other', name: 'Sam', email: 'sam@club.in' },
      ],
    });

    await expect(
      service.updateProfile(ACCOUNT_ID, { email: 'sam@club.in' })
    ).rejects.toThrow(ConflictError);
  });
});

describe('changePassword', () => {
  const bcrypt = require('bcryptjs');

  it('rejects a change when the current password is wrong', async () => {
    const hash = await bcrypt.hash('Judge1234', 4);
    const { service } = buildService({
      accounts: [{ _id: ACCOUNT_ID, email: 'pat@club.in', password: hash }],
    });

    await expect(
      service.changePassword(ACCOUNT_ID, 'WrongPass1', 'NewPass123')
    ).rejects.toThrow(AuthenticationError);
  });

  it('stores the new password through the repository so the model hashes it', async () => {
    const hash = await bcrypt.hash('Judge1234', 4);
    const { service, judgeAccountRepository } = buildService({
      accounts: [{ _id: ACCOUNT_ID, email: 'pat@club.in', password: hash }],
    });

    await service.changePassword(ACCOUNT_ID, 'Judge1234', 'NewPass123');

    expect(judgeAccountRepository.updateById).toHaveBeenCalledWith(ACCOUNT_ID, {
      password: 'NewPass123',
      mustResetPassword: false,
    });
  });
});
