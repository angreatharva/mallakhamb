/**
 * PerformanceOrderService — lot draw and running-order sequencing.
 *
 * Covers the parts where a mistake would silently change who performs when:
 * category-key normalization, the positional-with-fallback merge, lot numbers
 * surviving a drag, membership validation, the per-panel judge authorization,
 * and the two-room broadcast.
 */

const PerformanceOrderService = require('../../src/services/competition/performance-order.service');
const { secureShuffle } = require('../../src/services/competition/performance-order.service');
const { AuthorizationError, ValidationError, NotFoundError } = require('../../src/errors');

const noopLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const CATEGORY = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };
const COMPETITION = 'comp-1';

/** A submitted team in the shape adminService.getSubmittedTeams returns. */
const team = (id, name, players = []) => ({
  _id: id,
  name,
  coach: { name: `Coach ${name}` },
  players: players.map((p) => ({
    player: { _id: p.id, firstName: p.first, lastName: p.last },
    gender: p.gender || 'Male',
    ageGroup: p.ageGroup || 'Under14',
    apparatus: {},
  })),
});

function buildService({ orderDoc = null, submittedTeams = [], judgeAssignments = null } = {}) {
  const stored = { value: orderDoc };

  const performanceOrderRepository = {
    findByCategory: jest.fn(async () => stored.value),
    upsertByCategory: jest.fn(async (identity, updates) => {
      stored.value = { ...(stored.value || {}), ...identity, ...updates };
      return stored.value;
    }),
  };

  const adminService = { getSubmittedTeams: jest.fn(async () => submittedTeams) };
  const judgeRepository = { find: jest.fn(async () => judgeAssignments || []) };
  const socketManager = { emitToRoom: jest.fn() };

  const service = new PerformanceOrderService({
    performanceOrderRepository,
    adminService,
    judgeRepository,
    logger: noopLogger,
    socketManager,
  });

  return { service, performanceOrderRepository, adminService, judgeRepository, socketManager, stored };
}

describe('buildIdentity', () => {
  it('normalizes the display competition type to the slug form', () => {
    const { service } = buildService();
    const identity = service.buildIdentity(COMPETITION, { ...CATEGORY, competitionType: 'Competition II' });
    expect(identity.competitionType).toBe('competition_2');
  });

  it('leaves a slug untouched, so normalizing twice is safe', () => {
    const { service } = buildService();
    expect(service.buildIdentity(COMPETITION, CATEGORY).competitionType).toBe('competition_1');
  });

  it('rejects an incomplete category rather than keying a partial document', () => {
    const { service } = buildService();
    expect(() => service.buildIdentity(COMPETITION, { gender: 'Male' })).toThrow(ValidationError);
    expect(() => service.buildIdentity(null, CATEGORY)).toThrow(ValidationError);
  });
});

describe('getOrderedRoster', () => {
  it('sorts by stored position and appends unordered teams in name order', async () => {
    const { service } = buildService({
      submittedTeams: [team('t1', 'Alpha'), team('t2', 'Bravo'), team('t3', 'Charlie')],
      orderDoc: {
        teamOrder: [
          { team: 't3', lotNo: 1, position: 0 },
          { team: 't1', lotNo: 2, position: 1 },
        ],
      },
    });

    const roster = await service.getOrderedRoster(COMPETITION, CATEGORY);

    // t2 has no stored position — it must land LAST, not first. `null` sorts as
    // 0 in a naive numeric compare, which would promote a team registered after
    // the draw to the head of the running order.
    expect(roster.teams.map((t) => t.name)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(roster.teams[2].lotNo).toBeNull();
  });

  it('keeps only athletes in the category being ordered', async () => {
    const { service } = buildService({
      submittedTeams: [team('t1', 'Alpha', [
        { id: 'p1', first: 'In', last: 'Category' },
        { id: 'p2', first: 'Wrong', last: 'Age', ageGroup: 'Under18' },
        { id: 'p3', first: 'Wrong', last: 'Gender', gender: 'Female' },
      ])],
    });

    const roster = await service.getOrderedRoster(COMPETITION, CATEGORY);
    expect(roster.teams[0].players.map((p) => p.name)).toEqual(['In Category']);
  });
});

describe('drawLots', () => {
  it('numbers every team 1..N and stamps the draw metadata', async () => {
    const { service, performanceOrderRepository } = buildService({
      submittedTeams: [team('t1', 'Alpha'), team('t2', 'Bravo'), team('t3', 'Charlie')],
    });

    await service.drawLots(COMPETITION, CATEGORY, { id: 'admin-1', name: 'Asha', role: 'admin' });

    const [, updates] = performanceOrderRepository.upsertByCategory.mock.calls[0];
    expect(updates.teamOrder.map((t) => t.lotNo).sort()).toEqual([1, 2, 3]);
    expect(updates.teamOrder.map((t) => t.position).sort()).toEqual([0, 1, 2]);
    expect(new Set(updates.teamOrder.map((t) => t.team)).size).toBe(3);
    expect(updates.lotsDrawnByName).toBe('Asha');
    expect(updates.lotsDrawnAt).toBeInstanceOf(Date);
  });

  it('refuses to draw when no team has been submitted', async () => {
    const { service } = buildService({ submittedTeams: [] });
    await expect(service.drawLots(COMPETITION, CATEGORY, { id: 'a' })).rejects.toThrow(NotFoundError);
  });

  it('keeps the existing athlete sequence when includePlayers is false', async () => {
    const existingPlayerOrders = [{ team: 't1', players: [{ player: 'p2', lotNo: 1, position: 0 }] }];
    const { service, performanceOrderRepository } = buildService({
      submittedTeams: [team('t1', 'Alpha', [{ id: 'p1', first: 'A', last: 'One' }, { id: 'p2', first: 'B', last: 'Two' }])],
      orderDoc: { teamOrder: [], playerOrders: existingPlayerOrders },
    });

    await service.drawLots(COMPETITION, CATEGORY, { id: 'a' }, { includePlayers: false });

    const [, updates] = performanceOrderRepository.upsertByCategory.mock.calls[0];
    expect(updates.playerOrders).toEqual(existingPlayerOrders);
  });

  it('broadcasts into BOTH room-id forms', async () => {
    const { service, socketManager } = buildService({ submittedTeams: [team('t1', 'Alpha')] });

    await service.drawLots(COMPETITION, CATEGORY, { id: 'a', name: 'Asha', role: 'admin' });

    const rooms = socketManager.emitToRoom.mock.calls.map(([room]) => room);
    // Judges are auto-joined to both the slug and the display form; emitting to
    // only one reaches only part of the panel.
    expect(rooms).toContain('scoring_Male_Under14_competition_1');
    expect(rooms).toContain('scoring_Male_Under14_Competition I');
  });
});

describe('setTeamOrder', () => {
  const submittedTeams = [team('t1', 'Alpha'), team('t2', 'Bravo'), team('t3', 'Charlie')];

  it('carries the drawn lot number through a reorder', async () => {
    const { service, performanceOrderRepository } = buildService({
      submittedTeams,
      orderDoc: {
        teamOrder: [
          { team: 't1', lotNo: 7, position: 0 },
          { team: 't2', lotNo: 8, position: 1 },
          { team: 't3', lotNo: 9, position: 2 },
        ],
      },
    });

    await service.setTeamOrder(COMPETITION, CATEGORY, ['t3', 't1', 't2'], { id: 'j1', role: 'Senior Judge' });

    const [, updates] = performanceOrderRepository.upsertByCategory.mock.calls[0];
    expect(updates.teamOrder).toEqual([
      { team: 't3', lotNo: 9, position: 0 },
      { team: 't1', lotNo: 7, position: 1 },
      { team: 't2', lotNo: 8, position: 2 },
    ]);
  });

  it('appends a team the client did not know about instead of dropping it', async () => {
    const { service, performanceOrderRepository } = buildService({ submittedTeams });

    await service.setTeamOrder(COMPETITION, CATEGORY, ['t2', 't1'], { id: 'j1' });

    const [, updates] = performanceOrderRepository.upsertByCategory.mock.calls[0];
    expect(updates.teamOrder.map((t) => t.team)).toEqual(['t2', 't1', 't3']);
  });

  it('rejects a team that is not in the category', async () => {
    const { service } = buildService({ submittedTeams });
    await expect(service.setTeamOrder(COMPETITION, CATEGORY, ['t1', 'intruder'], {}))
      .rejects.toThrow(ValidationError);
  });

  it('rejects a duplicated team', async () => {
    const { service } = buildService({ submittedTeams });
    await expect(service.setTeamOrder(COMPETITION, CATEGORY, ['t1', 't1'], {}))
      .rejects.toThrow(ValidationError);
  });
});

describe('setPlayerOrder', () => {
  const submittedTeams = [team('t1', 'Alpha', [
    { id: 'p1', first: 'A', last: 'One' },
    { id: 'p2', first: 'B', last: 'Two' },
  ])];

  it('rewrites one team without disturbing another team\'s athlete order', async () => {
    const { service, performanceOrderRepository } = buildService({
      submittedTeams,
      orderDoc: {
        teamOrder: [],
        playerOrders: [{ team: 't9', players: [{ player: 'z1', lotNo: 1, position: 0 }] }],
      },
    });

    await service.setPlayerOrder(COMPETITION, CATEGORY, 't1', ['p2', 'p1'], { id: 'j1' });

    const [, updates] = performanceOrderRepository.upsertByCategory.mock.calls[0];
    expect(updates.playerOrders).toContainEqual({ team: 't9', players: [{ player: 'z1', lotNo: 1, position: 0 }] });
    expect(updates.playerOrders.find((e) => e.team === 't1').players)
      .toEqual([{ player: 'p2', lotNo: null, position: 0 }, { player: 'p1', lotNo: null, position: 1 }]);
  });

  it('rejects an athlete who is not on that team in that category', async () => {
    const { service } = buildService({ submittedTeams });
    await expect(service.setPlayerOrder(COMPETITION, CATEGORY, 't1', ['p1', 'stranger'], {}))
      .rejects.toThrow(ValidationError);
  });
});

describe('assertJudgeMaySequence', () => {
  const identity = { competition: COMPETITION, ...CATEGORY };

  const assignment = (overrides = {}) => ({
    judgeType: 'Senior Judge',
    gender: 'Male',
    ageGroup: 'Under14',
    competition: COMPETITION,
    competitionTypes: ['competition_1'],
    ...overrides,
  });

  const judgeUser = { username: 'SJ1', competition: COMPETITION, judgeType: 'Senior Judge' };

  it('admits the Senior Judge of that exact category', async () => {
    const { service } = buildService({ judgeAssignments: [assignment()] });
    await expect(service.assertJudgeMaySequence(judgeUser, identity)).resolves.toBeTruthy();
  });

  it('admits a Scorer with no competitionTypes — an empty list means all of them', async () => {
    const { service } = buildService({
      judgeAssignments: [assignment({ judgeType: 'Scorer', competitionTypes: [] })],
    });
    await expect(service.assertJudgeMaySequence(judgeUser, identity)).resolves.toBeTruthy();
  });

  it('admits a judge whose MATCHING assignment is not the one they logged in with', async () => {
    // A judge holds one document per assignment; req.user is only the document
    // they happened to authenticate against, so checking that alone would
    // refuse a legitimate re-sequence.
    const { service } = buildService({
      judgeAssignments: [assignment({ ageGroup: 'Under18' }), assignment()],
    });
    await expect(
      service.assertJudgeMaySequence({ ...judgeUser, ageGroup: 'Under18' }, identity)
    ).resolves.toBeTruthy();
  });

  it('refuses a Senior Judge assigned to a different age group', async () => {
    const { service } = buildService({ judgeAssignments: [assignment({ ageGroup: 'Under18' })] });
    await expect(service.assertJudgeMaySequence(judgeUser, identity)).rejects.toThrow(AuthorizationError);
  });

  it('refuses a Senior Judge assigned to a different gender', async () => {
    const { service } = buildService({ judgeAssignments: [assignment({ gender: 'Female' })] });
    await expect(service.assertJudgeMaySequence(judgeUser, identity)).rejects.toThrow(AuthorizationError);
  });

  it('refuses an evaluation judge on the right panel', async () => {
    const { service } = buildService({ judgeAssignments: [assignment({ judgeType: 'Judge 2' })] });
    await expect(
      service.assertJudgeMaySequence({ ...judgeUser, judgeType: 'Judge 2' }, identity)
    ).rejects.toThrow(AuthorizationError);
  });

  it('refuses a Senior Judge whose assignment excludes this competition type', async () => {
    const { service } = buildService({
      judgeAssignments: [assignment({ competitionTypes: ['competition_2'] })],
    });
    await expect(service.assertJudgeMaySequence(judgeUser, identity)).rejects.toThrow(AuthorizationError);
  });
});

describe('secureShuffle', () => {
  it('returns a permutation and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    const out = secureShuffle(input);

    expect(input).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
  });

  it('does not always return the identity order', () => {
    // Guards against a shuffle that silently no-ops (an off-by-one in the loop
    // bound, say). Over 40 runs of 8 elements a correct shuffle produces the
    // identity with probability ~40/8! ≈ 1e-3.
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const results = Array.from({ length: 40 }, () => secureShuffle(input).join(','));
    expect(new Set(results).size).toBeGreaterThan(1);
  });
});
