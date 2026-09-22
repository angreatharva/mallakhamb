/**
 * A panel is seated PER APPARATUS.
 *
 * A meet holds one panel per (gender, age group, apparatus) — `Judge`'s two
 * unique keys carry `apparatus` (migration 010) and Manage Judges asks which.
 * This pins the three things that follow from that and are easy to regress:
 *
 *   1. the apparatus is written onto the seat, not dropped;
 *   2. one person may hold the SAME seat on two apparatus (different panels)
 *      but not two seats on one (the same slip averaged twice);
 *   3. "can this category start" is decided per apparatus — a category whose
 *      Pole panel is complete and whose Rope panel is not is NOT ready.
 *
 * The fake repository below models the one query shape all of this rests on:
 * `apparatus: { $in: [wanted, null, ''] }`. A seat naming an apparatus answers
 * only for that one; a LEGACY seat naming none answers for all of them.
 */

const JudgePanelService = require('../../src/services/user/judge-panel.service');

const noopLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const COMPETITION = 'comp-1';
const POLE = 'Pole Mallakhamb';
const ROPE = 'Rope Mallakhamb';

const PANEL = {
  gender: 'Male',
  ageGroup: 'Under14',
  competitionTypes: ['competition_1'],
};

/**
 * The four seats a category needs before it may be scored, one person each.
 *
 * Distinct people because one of them holding two seats on a panel is refused —
 * their single slip would be averaged in twice. The SAME four are then seated on
 * every apparatus, which is legal and is the point of the second test below.
 */
const MINIMUM = [
  { judgeNo: 1, judgeType: 'Senior Judge', judgeAccount: 'account-1' },
  { judgeNo: 2, judgeType: 'Judge 1', judgeAccount: 'account-2' },
  { judgeNo: 3, judgeType: 'Judge 2', judgeAccount: 'account-3' },
  { judgeNo: 6, judgeType: 'Scorer', judgeAccount: 'account-4' },
];

/** Does a stored row answer a query's apparatus clause? */
function matchesApparatus(row, clause) {
  if (clause === undefined) return true;
  const wanted = clause?.$in ?? [clause];
  // A stored `null` is only reachable when the query itself allows null, which
  // is exactly what `{ $in: [wanted, null, ''] }` does.
  return wanted.some((value) => (value ?? null) === (row.apparatus ?? null));
}

function buildService({ accounts, rows = [], competition } = {}) {
  const people = accounts || [
    { _id: 'account-1', name: 'Pat', isActive: true },
    { _id: 'account-2', name: 'Sam', isActive: true },
    { _id: 'account-3', name: 'Ravi', isActive: true },
    { _id: 'account-4', name: 'Mira', isActive: true },
  ];
  const stored = [...rows];

  const judgeRepository = {
    findOne: jest.fn(async (query) =>
      stored.find(
        (r) =>
          String(r.competition) === String(query.competition) &&
          r.gender === query.gender &&
          r.ageGroup === query.ageGroup &&
          Number(r.judgeNo) === Number(query.judgeNo) &&
          matchesApparatus(r, query.apparatus)
      ) || null
    ),
    find: jest.fn(async (query) =>
      stored.filter((r) => {
        if (query.judgeAccount && String(r.judgeAccount) !== String(query.judgeAccount)) return false;
        if (query.competition && String(r.competition) !== String(query.competition)) return false;
        if (query.gender && r.gender !== query.gender) return false;
        if (query.ageGroup && r.ageGroup !== query.ageGroup) return false;
        if (query.competitionTypes?.$in) {
          const types = r.competitionTypes || [];
          if (!query.competitionTypes.$in.some((t) => types.includes(t))) return false;
        }
        return matchesApparatus(r, query.apparatus);
      })
    ),
    count: jest.fn(async () => stored.length),
    findById: jest.fn(async (id) => stored.find((r) => String(r._id) === String(id)) || null),
    create: jest.fn(async (data) => {
      const created = { _id: `judge-${stored.length + 1}`, ...data };
      stored.push(created);
      return created;
    }),
    updateById: jest.fn(async (id, updates) => {
      const index = stored.findIndex((r) => String(r._id) === String(id));
      stored[index] = { ...stored[index], ...updates };
      return stored[index];
    }),
  };

  const service = new JudgePanelService({
    judgeRepository,
    judgeAccountRepository: {
      findById: jest.fn(async (id) => people.find((a) => String(a._id) === String(id)) || null),
    },
    competitionRepository: {
      findById: jest.fn(async () => competition || null),
    },
    logger: noopLogger,
  });

  return { service, judgeRepository, stored };
}

/** One full minimum panel's worth of seat payloads. */
const minimumPanel = (apparatus) => MINIMUM.map((seat) => ({ ...PANEL, ...seat, apparatus }));

describe('seating a panel for one apparatus', () => {
  it('writes the apparatus onto every seat', async () => {
    const { service, stored } = buildService();

    const result = await service.saveJudges(COMPETITION, minimumPanel(POLE), 'admin-1');

    expect(result.errors).toEqual([]);
    expect(stored).toHaveLength(4);
    expect(stored.every((row) => row.apparatus === POLE)).toBe(true);
  });

  it('lets one person hold the same seat on two apparatus — they are two panels', async () => {
    const { service, stored } = buildService();

    await service.saveJudges(COMPETITION, minimumPanel(POLE), 'admin-1');
    const second = await service.saveJudges(COMPETITION, minimumPanel(ROPE), 'admin-1');

    expect(second.errors).toEqual([]);
    expect(second.created).toHaveLength(4);
    // Eight rows, not four updated in place: Pole and Rope are separate slots.
    expect(stored).toHaveLength(8);
  });

  it('still refuses one person in two seats of the SAME apparatus panel', async () => {
    const { service } = buildService();

    await service.saveJudges(
      COMPETITION,
      [{ ...PANEL, judgeNo: 1, judgeType: 'Senior Judge', apparatus: POLE, judgeAccount: 'account-1' }],
      'admin-1'
    );
    const clash = await service.saveJudges(
      COMPETITION,
      [{ ...PANEL, judgeNo: 2, judgeType: 'Judge 1', apparatus: POLE, judgeAccount: 'account-1' }],
      'admin-1'
    );

    expect(clash.created).toHaveLength(0);
    expect(clash.errors[0].error).toMatch(/already on this panel as Senior Judge/);
  });

  it('treats a legacy category-wide seat as occupying every apparatus', async () => {
    // The upgrade path, and why `seatPanels.js` vacates these before it seats a
    // named panel: the old seat judges Pole too, so the same person cannot also
    // take the named Pole seat beside it.
    const { service } = buildService({
      rows: [{
        _id: 'judge-legacy',
        judgeAccount: 'account-1',
        competition: COMPETITION,
        ...PANEL,
        apparatus: null,
        judgeNo: 1,
        judgeType: 'Senior Judge',
      }],
    });

    const result = await service.saveJudges(
      COMPETITION,
      [{ ...PANEL, judgeNo: 2, judgeType: 'Judge 1', apparatus: POLE, judgeAccount: 'account-1' }],
      'admin-1'
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/already on this panel/);
  });
});

describe('getAllJudgesSummary — readiness per apparatus', () => {
  const competition = {
    _id: COMPETITION,
    competitionTypes: ['competition_1'],
    ageGroups: [{ gender: 'Male', ageGroup: 'Under14' }],
    apparatusConfig: { competition_1: [POLE, ROPE] },
  };

  const readiness = async (service) => {
    const { summary } = await service.getAllJudgesSummary(COMPETITION);
    return summary[0].competitionTypes.competition_1;
  };

  it('is not ready when only one of the two apparatus is staffed', async () => {
    const { service } = buildService({ competition });
    await service.saveJudges(COMPETITION, minimumPanel(POLE), 'admin-1');

    const entry = await readiness(service);

    expect(entry.hasMinimumJudges).toBe(false);
    expect(entry.byApparatus[POLE].hasMinimumJudges).toBe(true);
    expect(entry.byApparatus[ROPE].hasMinimumJudges).toBe(false);
  });

  it('is ready once every apparatus the meet runs has a minimum panel', async () => {
    const { service } = buildService({ competition });
    await service.saveJudges(COMPETITION, minimumPanel(POLE), 'admin-1');
    await service.saveJudges(COMPETITION, minimumPanel(ROPE), 'admin-1');

    const entry = await readiness(service);

    expect(entry.hasMinimumJudges).toBe(true);
  });

  it('counts a legacy category-wide panel for every apparatus', async () => {
    // A meet seated before the apparatus rung existed must not be reported as
    // unready — its seats really do judge all three.
    const { service } = buildService({ competition });
    await service.saveJudges(COMPETITION, minimumPanel(null), 'admin-1');

    const entry = await readiness(service);

    expect(entry.hasMinimumJudges).toBe(true);
    expect(entry.byApparatus[POLE].hasMinimumJudges).toBe(true);
    expect(entry.byApparatus[ROPE].hasMinimumJudges).toBe(true);
  });

  it('falls back to the flat seat list when the meet declares no apparatus', async () => {
    const { service } = buildService({
      competition: { ...competition, apparatusConfig: {} },
    });
    await service.saveJudges(COMPETITION, minimumPanel(null), 'admin-1');

    const entry = await readiness(service);

    expect(entry.byApparatus).toEqual({});
    expect(entry.hasMinimumJudges).toBe(true);
  });
});
