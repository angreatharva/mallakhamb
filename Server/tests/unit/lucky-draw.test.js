/**
 * Lucky draw — the last tie-break step.
 *
 * 3-judge panels: same time → lucky draw. 4/5-judge panels: COP 1.12.4, after
 * 1.12.1–1.12.3 leave the athletes level. The draw is physical; the admin
 * records the order and the ranking follows it (models/TieBreakDraw.js).
 */

const { calculateIndividualRankings, calculateIndividualRankingsByApparatus } = require('../../src/utils/scoring/ranking.util');
const { tieGroupKey } = require('../../src/utils/scoring/tie-breaker.util');
const TieBreakDrawService = require('../../src/services/scoring/tie-break-draw.service');

const threeJudge = (playerId, time, extra = {}) => ({
  playerId, finalScore: 8.0, panelSize: 3, time, apparatus: 'Pole Mallakhamb',
  judgeScores: { seniorJudge: 8, judge1: 8, judge2: 8 }, ...extra
});
const fiveJudge = (playerId, finalScore = 8.0, extra = {}) => ({
  playerId, finalScore, panelSize: 5, apparatus: 'Pole Mallakhamb',
  judgeScores: { seniorJudge: 8, judge1: 8, judge2: 8, judge3: 8, judge4: 8 }, ...extra
});
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.playerId, r]));

describe('Lucky draw on a 3-judge panel (same time)', () => {
  test('without a recorded draw the tie stands and is flagged as awaiting one', () => {
    const ranked = byId(calculateIndividualRankings([threeJudge('a', '1:30'), threeJudge('b', '1:30')]));

    expect(ranked.a.rank).toBe(1);
    expect(ranked.b.rank).toBe(1);
    expect(ranked.a.tieBreakInfo).toMatchObject({ unresolved: true, awaitingLuckyDraw: true, tieGroupKey: 'a,b' });
  });

  test('a recorded draw places them in the drawn order, as step 2', () => {
    const ranked = calculateIndividualRankings(
      [threeJudge('a', '1:30'), threeJudge('b', '1:30')],
      'Competition II',
      { draws: [{ order: ['b', 'a'] }] }
    );

    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([['b', 1], ['a', 2]]);
    expect(ranked[0].tieBreakInfo).toEqual({
      resolvedAtStep: 2,
      method: 'lucky_draw',
      unresolved: false,
      awaitingLuckyDraw: false,
      luckyDrawPosition: 1,
      tieGroupKey: 'a,b'
    });
  });

  test('a faster time still beats the draw — the draw is only for the level ones', () => {
    const ranked = calculateIndividualRankings(
      [threeJudge('a', '1:30'), threeJudge('b', '1:30'), threeJudge('c', '1:20')],
      'Competition II',
      { draws: [{ order: ['b', 'a'] }] }
    );

    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([['c', 1], ['b', 2], ['a', 3]]);
    expect(ranked[0].tieBreakInfo.method).toBe('faster_time');
  });

  test('a missing time is not a draw: the data has to be fixed', () => {
    const ranked = byId(calculateIndividualRankings(
      [threeJudge('a', ''), threeJudge('b', '1:30')],
      'Competition II',
      { draws: [{ order: ['a', 'b'] }] }
    ));

    expect(ranked.a.rank).toBe(1);
    expect(ranked.b.rank).toBe(1);
    expect(ranked.a.tieBreakInfo).toMatchObject({ unresolved: true, awaitingLuckyDraw: false });
  });
});

describe('Lucky draw on a 4/5-judge panel (COP 1.12.4)', () => {
  test('identical at every COP step and no draw → shared place, awaiting a draw', () => {
    const ranked = calculateIndividualRankings([fiveJudge('a'), fiveJudge('b'), fiveJudge('z', 7.5)]);

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(ranked[0].tieBreakInfo).toMatchObject({ method: 'identical_panel_scores', awaitingLuckyDraw: true });
    expect(ranked[2].tieBreakInfo).toBeUndefined();
  });

  test('a three-way draw gives 1, 2, 3 and the next athlete is 4th', () => {
    const ranked = calculateIndividualRankings(
      [fiveJudge('a'), fiveJudge('b'), fiveJudge('c'), fiveJudge('z', 7.5)],
      'Competition I',
      { draws: [{ order: ['c', 'a', 'b'] }] }
    );

    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([['c', 1], ['a', 2], ['b', 3], ['z', 4]]);
    expect(ranked[1].tieBreakInfo).toMatchObject({ method: 'lucky_draw', resolvedAtStep: 4, luckyDrawPosition: 2 });
  });

  test('a draw for a different group is ignored — the group changed since it was drawn', () => {
    const ranked = calculateIndividualRankings(
      [fiveJudge('a'), fiveJudge('b'), fiveJudge('c')],
      'Competition III',
      { draws: [{ order: ['b', 'a'] }] }
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1]);
    expect(ranked[0].tieBreakInfo).toMatchObject({ awaitingLuckyDraw: true, tieGroupKey: 'a,b,c' });
  });

  test('a rule step that separates the athletes wins over a stale draw', () => {
    const better = fiveJudge('a', 8.0, { judgeScores: { seniorJudge: 8.4, judge1: 8, judge2: 8, judge3: 8, judge4: 8 } });
    const ranked = calculateIndividualRankings(
      [fiveJudge('b'), better],
      'Competition II',
      { draws: [{ order: ['b', 'a'] }] }
    );

    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([['a', 1], ['b', 2]]);
    expect(ranked[0].tieBreakInfo.method).toBe('base_score');
  });

  test('draws apply to their own apparatus only', () => {
    const ranked = calculateIndividualRankingsByApparatus(
      [fiveJudge('a'), fiveJudge('b'), fiveJudge('a', 8.0, { apparatus: 'Rope Mallakhamb' }), fiveJudge('b', 8.0, { apparatus: 'Rope Mallakhamb' })],
      'Competition II',
      { draws: [{ apparatus: 'Rope Mallakhamb', order: ['b', 'a'] }] }
    );

    const pole = ranked.filter((r) => r.apparatus === 'Pole Mallakhamb');
    const rope = ranked.filter((r) => r.apparatus === 'Rope Mallakhamb');
    expect(pole.map((r) => r.rank)).toEqual([1, 1]);
    expect(rope.map((r) => [r.playerId, r.rank])).toEqual([['b', 1], ['a', 2]]);
  });

  test('player ids held as ObjectId-like values match the draw', () => {
    const oid = (hex) => ({ toString: () => hex });
    const ranked = calculateIndividualRankings(
      [fiveJudge(oid('aa')), fiveJudge(oid('bb'))],
      'Competition II',
      { draws: [{ order: [oid('bb'), oid('aa')] }] }
    );

    expect(ranked.map((r) => String(r.playerId))).toEqual(['bb', 'aa']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe('TieBreakDrawService.recordDraw', () => {
  const filters = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_2', apparatus: 'Pole Mallakhamb' };
  const actor = { id: 'admin1', name: 'Admin One', role: 'admin' };

  const serviceWith = (scores) => {
    const repo = { upsertByIdentity: jest.fn(async (identity, updates) => ({ ...identity, ...updates })) };
    const scoringService = {
      getIndividualScores: jest.fn(async () => {
        // The admin feed ranks the rows in place, as rankPlayerRows does.
        const ranked = calculateIndividualRankings(scores);
        return ranked.map((row) => ({ playerId: row.playerId, scores: [row] }));
      })
    };
    const logger = { info: jest.fn(), error: jest.fn() };
    return { service: new TieBreakDrawService({ tieBreakDrawRepository: repo, scoringService, logger }), repo };
  };

  test('records the order for a group awaiting a draw, with who recorded it', async () => {
    const { service, repo } = serviceWith([fiveJudge('a'), fiveJudge('b')]);

    await service.recordDraw('comp1', filters, ['b', 'a'], actor);

    expect(repo.upsertByIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ competition: 'comp1', competitionType: 'competition_2', apparatus: 'Pole Mallakhamb', groupKey: tieGroupKey(['a', 'b']) }),
      expect.objectContaining({ order: ['b', 'a'], tiedScore: 8, recordedBy: 'admin1', recordedByName: 'Admin One' })
    );
  });

  test('refuses athletes the rules have already separated', async () => {
    const { service, repo } = serviceWith([fiveJudge('a', 8.0), fiveJudge('b', 7.9)]);

    await expect(service.recordDraw('comp1', filters, ['b', 'a'], actor)).rejects.toThrow(/not a tie that awaits a lucky draw/);
    expect(repo.upsertByIdentity).not.toHaveBeenCalled();
  });

  test('refuses part of a tie group — the whole group is drawn together', async () => {
    const { service } = serviceWith([fiveJudge('a'), fiveJudge('b'), fiveJudge('c')]);

    await expect(service.recordDraw('comp1', filters, ['b', 'a'], actor)).rejects.toThrow(/not a tie/);
  });

  test('refuses a tie caused by a missing time', async () => {
    const { service } = serviceWith([threeJudge('a', ''), threeJudge('b', '1:30')]);

    await expect(service.recordDraw('comp1', filters, ['a', 'b'], actor)).rejects.toThrow(/not a tie/);
  });

  test('refuses duplicates and single athletes', async () => {
    const { service } = serviceWith([fiveJudge('a'), fiveJudge('b')]);

    await expect(service.recordDraw('comp1', filters, ['a', 'a'], actor)).rejects.toThrow(/more than once/);
    await expect(service.recordDraw('comp1', filters, ['a'], actor)).rejects.toThrow(/at least two/);
  });
});
