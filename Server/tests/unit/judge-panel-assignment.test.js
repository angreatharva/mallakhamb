/**
 * JudgePanelService — assigning registered judges to panel slots.
 *
 * Admins no longer mint judge credentials; they choose a person who has
 * registered. What has to hold: an empty slot is skipped rather than erroring,
 * an unknown or deactivated account is refused, one person cannot occupy two
 * slots on the same panel, and a slot edit cannot smuggle in a name or a
 * password.
 *
 * These methods lived on AdminService until 2026-09-22 and this suite pointed
 * there. It now tests their owner directly — AdminService still exposes each
 * one as a delegate, which `admin-delegates-to-judge-panel` below pins.
 */

const AdminService = require('../../src/services/user/admin.service');
const JudgePanelService = require('../../src/services/user/judge-panel.service');
const { BusinessRuleError, NotFoundError } = require('../../src/errors');

const noopLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const COMPETITION = 'comp-1';
const ACCOUNT = 'account-1';
const CATEGORY = {
  gender: 'Male',
  ageGroup: 'Under14',
  competitionTypes: ['competition_1'],
  apparatus: null,
};

function buildService({ accounts = [{ _id: ACCOUNT, name: 'Pat', isActive: true }], existingRows = [] } = {}) {
  const rows = [...existingRows];

  const judgeRepository = {
    findOne: jest.fn(async (query) =>
      rows.find(
        (r) =>
          String(r.competition) === String(query.competition) &&
          r.gender === query.gender &&
          r.ageGroup === query.ageGroup &&
          Number(r.judgeNo) === Number(query.judgeNo)
      ) || null
    ),
    find: jest.fn(async (query) =>
      rows.filter((r) => {
        if (query.judgeAccount && String(r.judgeAccount) !== String(query.judgeAccount)) return false;
        if (query.competition && String(r.competition) !== String(query.competition)) return false;
        if (query.gender && r.gender !== query.gender) return false;
        if (query.ageGroup && r.ageGroup !== query.ageGroup) return false;
        if (query.competitionTypes?.$in) {
          const types = r.competitionTypes || [];
          if (!query.competitionTypes.$in.some((t) => types.includes(t))) return false;
        }
        return true;
      })
    ),
    findById: jest.fn(async (id) => rows.find((r) => String(r._id) === String(id)) || null),
    create: jest.fn(async (data) => {
      const created = { _id: `judge-${rows.length + 1}`, ...data };
      rows.push(created);
      return created;
    }),
    updateById: jest.fn(async (id, updates) => {
      const index = rows.findIndex((r) => String(r._id) === String(id));
      rows[index] = { ...rows[index], ...updates };
      return rows[index];
    }),
  };

  const judgeAccountRepository = {
    findById: jest.fn(async (id) => accounts.find((a) => String(a._id) === String(id)) || null),
  };

  const service = new JudgePanelService({
    judgeRepository,
    judgeAccountRepository,
    logger: noopLogger,
  });

  return { service, judgeRepository, judgeAccountRepository, rows };
}

describe('admin-delegates-to-judge-panel', () => {
  /*
   * The delegation is the compatibility promise: admin.controller,
   * super-admin.controller and the seeding scripts all still call these on
   * AdminService. If one is dropped, this fails here rather than at a venue.
   */
  const DELEGATED = [
    'saveJudges', 'getJudges', 'createSingleJudge', 'updateJudge',
    'deleteJudge', 'getAllJudgesSummary', 'assignJudgeToCompetition',
  ];

  it('forwards every seating method to JudgePanelService', async () => {
    const calls = [];
    const judgePanelService = Object.fromEntries(
      DELEGATED.map((m) => [m, jest.fn(async (...args) => { calls.push([m, args]); return m; })])
    );
    const admin = new AdminService({
      adminRepository: {},
      logger: noopLogger,
      judgePanelService,
    });

    for (const method of DELEGATED) {
      await expect(admin[method]('a', 'b', 'c')).resolves.toBe(method);
    }

    expect(calls.map(([m]) => m)).toEqual(DELEGATED);
  });

  it('says what is missing when the panel service was not injected', async () => {
    const admin = new AdminService({ adminRepository: {}, logger: noopLogger });

    await expect(admin.getJudges('comp-1')).rejects.toThrow(/judgePanelService is not set/);
  });
});

describe('saveJudges', () => {
  it('assigns a registered judge to the slot and marks it active', async () => {
    const { service, judgeRepository } = buildService();

    const result = await service.saveJudges(
      COMPETITION,
      [{ ...CATEGORY, judgeNo: 1, judgeType: 'Senior Judge', judgeAccount: ACCOUNT }],
      'admin-1'
    );

    expect(result.errors).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(judgeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ judgeAccount: ACCOUNT, isActive: true })
    );
  });

  it('skips a slot the admin left empty instead of reporting an error', async () => {
    const { service, judgeRepository } = buildService();

    const result = await service.saveJudges(
      COMPETITION,
      [
        { ...CATEGORY, judgeNo: 1, judgeType: 'Senior Judge', judgeAccount: ACCOUNT },
        { ...CATEGORY, judgeNo: 5, judgeType: 'Judge 4' },
      ],
      'admin-1'
    );

    expect(result.created).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(judgeRepository.create).toHaveBeenCalledTimes(1);
  });

  it('refuses an account that does not exist', async () => {
    const { service } = buildService({ accounts: [] });

    const result = await service.saveJudges(
      COMPETITION,
      [{ ...CATEGORY, judgeNo: 1, judgeType: 'Senior Judge', judgeAccount: 'ghost' }],
      'admin-1'
    );

    expect(result.created).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('refuses to seat one judge twice on the same panel', async () => {
    const { service } = buildService({
      existingRows: [{
        _id: 'judge-existing',
        judgeAccount: ACCOUNT,
        competition: COMPETITION,
        judgeNo: 1,
        judgeType: 'Senior Judge',
        ...CATEGORY,
      }],
    });

    // Same person, different slot, same category — their single opinion would
    // otherwise be averaged in twice.
    const result = await service.saveJudges(
      COMPETITION,
      [{ ...CATEGORY, judgeNo: 3, judgeType: 'Judge 2', judgeAccount: ACCOUNT }],
      'admin-1'
    );

    expect(result.created).toHaveLength(0);
    expect(result.errors[0].error).toMatch(/already on this panel as Senior Judge/);
  });

  it('lets the same judge sit on a different age group', async () => {
    const { service } = buildService({
      existingRows: [{
        _id: 'judge-existing',
        judgeAccount: ACCOUNT,
        competition: COMPETITION,
        judgeNo: 1,
        judgeType: 'Senior Judge',
        ...CATEGORY,
      }],
    });

    const result = await service.saveJudges(
      COMPETITION,
      [{ ...CATEGORY, ageGroup: 'Under16', judgeNo: 3, judgeType: 'Judge 2', judgeAccount: ACCOUNT }],
      'admin-1'
    );

    expect(result.errors).toEqual([]);
    expect(result.created).toHaveLength(1);
  });
});

describe('createSingleJudge', () => {
  it('requires a registered judge', async () => {
    const { service } = buildService();

    await expect(
      service.createSingleJudge({ ...CATEGORY, competition: COMPETITION, judgeNo: 2, judgeType: 'Judge 1' }, 'admin-1')
    ).rejects.toThrow(/registered judge must be selected/i);
  });

  it('refuses a deactivated account', async () => {
    const { service } = buildService({ accounts: [{ _id: ACCOUNT, name: 'Pat', isActive: false }] });

    await expect(
      service.createSingleJudge(
        { ...CATEGORY, competition: COMPETITION, judgeNo: 2, judgeType: 'Judge 1', judgeAccount: ACCOUNT },
        'admin-1'
      )
    ).rejects.toThrow(BusinessRuleError);
  });

  it('reports an unknown account rather than creating an orphan slot', async () => {
    const { service } = buildService({ accounts: [] });

    await expect(
      service.createSingleJudge(
        { ...CATEGORY, competition: COMPETITION, judgeNo: 2, judgeType: 'Judge 1', judgeAccount: 'ghost' },
        'admin-1'
      )
    ).rejects.toThrow(NotFoundError);
  });
});

describe('updateJudge', () => {
  const existing = {
    _id: 'judge-1',
    judgeAccount: 'account-old',
    competition: COMPETITION,
    judgeNo: 2,
    judgeType: 'Judge 1',
    ...CATEGORY,
  };

  it('swaps the person in the slot', async () => {
    const { service, judgeRepository } = buildService({ existingRows: [existing] });

    await service.updateJudge('judge-1', { judgeAccount: ACCOUNT }, 'admin-1');

    const [, payload] = judgeRepository.updateById.mock.calls[0];
    expect(payload.judgeAccount).toBe(ACCOUNT);
    expect(payload.isActive).toBe(true);
  });

  it('ignores name, username and password sent by an admin', async () => {
    const { service, judgeRepository } = buildService({ existingRows: [existing] });

    await service.updateJudge(
      'judge-1',
      { name: 'Someone Else', username: 'sneaky', password: 'Password1' },
      'admin-1'
    );

    const [, payload] = judgeRepository.updateById.mock.calls[0];
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('username');
    expect(payload).not.toHaveProperty('password');
  });
});

describe('deleteJudge', () => {
  const seated = {
    _id: 'judge-4',
    judgeAccount: ACCOUNT,
    isActive: true,
    competition: COMPETITION,
    judgeNo: 5,
    judgeType: 'Judge 4',
    ...CATEGORY,
  };

  /*
   * Shrinking a panel is not a cosmetic act: the judge screens count the seats
   * a category reports to decide which averaging method it scores by (3 = flat
   * mean, 4 = the chief copied into the vacant slot, 5 = drop high/low of the
   * evaluators). A removal that leaves the seat countable turns a 4-judge panel
   * into a 5-judge one and produces a believable number by the wrong method.
   */
  it('empties the seat rather than only flagging it', async () => {
    const { service, judgeRepository } = buildService({ existingRows: [seated] });

    await service.deleteJudge('judge-4', 'admin-1');

    const [, payload] = judgeRepository.updateById.mock.calls[0];
    expect(payload.judgeAccount).toBeNull();
    expect(payload.isActive).toBe(false);
  });

  it('frees the person to be seated elsewhere on the same panel', async () => {
    const { service } = buildService({ existingRows: [seated] });

    await service.deleteJudge('judge-4', 'admin-1');

    // Before the seat was actually emptied, this threw "That judge is already
    // on this panel as Judge 4" — the removed person went on holding it.
    await expect(
      service.assertNotAlreadyOnPanel({
        judgeAccountId: ACCOUNT,
        competitionId: COMPETITION,
        gender: CATEGORY.gender,
        ageGroup: CATEGORY.ageGroup,
        competitionTypes: CATEGORY.competitionTypes,
        apparatus: CATEGORY.apparatus,
      })
    ).resolves.toBeUndefined();
  });

  it('refuses a slot that does not exist', async () => {
    const { service } = buildService();

    await expect(service.deleteJudge('judge-nope', 'admin-1')).rejects.toThrow(NotFoundError);
  });
});
