/**
 * A judge's slip must not erase the Scorer's sheet, and six people scoring one
 * performer must all land.
 *
 * `Score` nests two levels of array — `playerScores[].judgeSlips[]` — and
 * `saveScores` merges them in application code under a `__v` guard, because an
 * `arrayFilters` positional `$set` cannot express upsert-a-slip-by-role or the
 * per-athlete finalize guard. That merge is correct. What was not correct is
 * everything AROUND the merge:
 *
 *   - the whole document was `$set` on every write, and `buildScoreDocData`
 *     defaults `timeKeeper` / `scorer` / `remarks` to '' and `judgeDetails` to
 *     {}. Only `playerScores` and `isLocked` were merged back from the stored
 *     document, so any slip submission blanked the Scorer's record;
 *   - the retry budget was five with no delay between attempts, while a
 *     five-judge panel plus the Scorer is six concurrent writers on one
 *     document — so the last one could exhaust it and be told to try again,
 *     mid-routine.
 */

const mongoose = require('mongoose');

const ScoringService = require('../../src/services/scoring/scoring.service');
const CalculationService = require('../../src/services/scoring/calculation.service');
const ScoreRepository = require('../../src/repositories/score.repository');
const Score = require('../../src/models/Score');

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const oid = () => new mongoose.Types.ObjectId();

const COMPETITION = oid();
const TEAM = oid();
const PLAYER = oid();

/** Every athlete referenced by a slip must exist and be active. */
const playerRepositoryStub = {
  find: async () => [{ _id: PLAYER, isActive: true }],
};

function buildService() {
  return new ScoringService(
    new ScoreRepository(quiet),
    { findById: async () => ({ _id: COMPETITION }) }, // competitionRepository
    playerRepositoryStub,
    null,                                            // judgeRepository
    null,                                            // socketManager
    quiet,
    new CalculationService(quiet)
  );
}

/** The category every write in this file targets. */
const category = {
  competitionId: COMPETITION,
  teamId: TEAM,
  gender: 'Male',
  ageGroup: 'Under14',
  competitionType: 'Competition I',
};

/**
 * One judge's slip, in the shape admin.controller builds from a judge payload.
 * @param {string} field - a `judgeScores` key
 * @param {string} role - the matching `judgeSlips[].judgeRole`
 * @param {number} score
 */
const slipFrom = (field, role, score) => ({
  ...category,
  playerScores: [{
    playerId: PLAYER,
    playerName: 'Asha Kulkarni',
    apparatus: 'Pole Mallakhamb',
    judgeScores: { [field]: score },
    judgeSlips: [{ judgeRole: role, total: score, submittedAt: new Date() }],
  }],
});

/** The Scorer's sheet: metadata plus the deductions only they record. */
const scorerSheet = () => ({
  ...category,
  timeKeeper: 'R. Patil',
  scorer: 'S. Rao',
  remarks: 'Clean session',
  playerScores: [{
    playerId: PLAYER,
    playerName: 'Asha Kulkarni',
    apparatus: 'Pole Mallakhamb',
    time: '01:32',
    deduction: 0.2,
  }],
});

const stored = () => Score.findOne({ teamId: TEAM, competition: COMPETITION }).lean();

describe('a judge slip does not erase the Scorer sheet', () => {
  let service;

  beforeEach(() => {
    service = buildService();
  });

  it('keeps timeKeeper, scorer and remarks when a judge submits afterwards', async () => {
    await service.saveScores(scorerSheet());

    const beforeSlip = await stored();
    expect(beforeSlip.timeKeeper).toBe('R. Patil');

    // A judge's payload carries none of those fields.
    await service.saveScores(slipFrom('seniorJudge', 'SR_JUDGE', 8.4));

    const afterSlip = await stored();
    expect(afterSlip.timeKeeper).toBe('R. Patil');
    expect(afterSlip.scorer).toBe('S. Rao');
    expect(afterSlip.remarks).toBe('Clean session');

    // And the slip itself landed.
    const row = afterSlip.playerScores.find((ps) => String(ps.playerId) === String(PLAYER));
    expect(row.judgeScores.seniorJudge).toBe(8.4);
    expect(row.judgeSlips.map((s) => s.judgeRole)).toContain('SR_JUDGE');
    // The Scorer's deduction is still applied.
    expect(row.deduction).toBe(0.2);
  });

  it('lets the Scorer clear remarks deliberately', async () => {
    await service.saveScores(scorerSheet());
    await service.saveScores({ ...scorerSheet(), remarks: '' });

    // `??` not `||`: an explicit '' from the Scorer is a real edit, whereas a
    // judge's absent field is not.
    expect((await stored()).remarks).toBe('');
  });
});

describe('a whole panel scoring one performer', () => {
  it('lands every slip when six writers submit concurrently', async () => {
    const service = buildService();

    // Seed the document first so all six take the update path and contend on
    // `__v`, rather than racing to create it.
    await service.saveScores(scorerSheet());

    const panel = [
      ['seniorJudge', 'SR_JUDGE', 8.4],
      ['judge1', 'J1', 8.2],
      ['judge2', 'J2', 8.3],
      ['judge3', 'J3', 8.5],
      ['judge4', 'J4', 8.1],
    ];

    const writes = [
      ...panel.map(([field, role, score]) => service.saveScores(slipFrom(field, role, score))),
      // The Scorer saving alongside them is the sixth writer, and the one the
      // old five-attempt budget could starve.
      service.saveScores(scorerSheet()),
    ];

    const results = await Promise.allSettled(writes);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.map((r) => r.reason?.message)).toEqual([]);

    const doc = await stored();
    const row = doc.playerScores.find((ps) => String(ps.playerId) === String(PLAYER));

    // Every seat's mark is present — none was overwritten by a later writer.
    expect(row.judgeScores.seniorJudge).toBe(8.4);
    expect(row.judgeScores.judge1).toBe(8.2);
    expect(row.judgeScores.judge2).toBe(8.3);
    expect(row.judgeScores.judge3).toBe(8.5);
    expect(row.judgeScores.judge4).toBe(8.1);

    expect(row.judgeSlips.map((s) => s.judgeRole).sort())
      .toEqual(['J1', 'J2', 'J3', 'J4', 'SR_JUDGE']);

    // And the Scorer's sheet survived all five slips.
    expect(doc.timeKeeper).toBe('R. Patil');
    expect(doc.scorer).toBe('S. Rao');
  });
});

// User rule 2026-11-08: a Scorer records the TIME only. The judges' marks and
// the deductions stay as stored, whatever the Scorer's payload carries, and
// the average and final are recomputed from the stored marks.
describe('a Scorer save changes the time only', () => {
  const tampered = (overrides = {}) => ({
    ...category,
    scorerTimeOnly: true,
    allowFinalizedEdit: true,
    timeKeeper: 'R. Patil',
    scorer: 'S. Rao',
    playerScores: [{
      playerId: PLAYER,
      playerName: 'Asha Kulkarni',
      apparatus: 'Pole Mallakhamb',
      time: '1:35',
      judgeScores: { seniorJudge: 10, judge1: 10, judge2: 10 },
      judgeSlips: [{ judgeRole: 'J1', total: 10 }],
      deduction: 0,
      otherDeduction: 1,
      averageMarks: 9.9,
      finalScore: 9.9,
      ...overrides,
    }],
  });

  it('keeps every judge mark and re-averages from them', async () => {
    const service = buildService();
    await service.saveScores({ ...slipFrom('seniorJudge', 'SR_JUDGE', 8.4), panelSize: 3 });
    await service.saveScores({ ...slipFrom('judge1', 'J1', 8.0), panelSize: 3 });
    await service.saveScores({ ...slipFrom('judge2', 'J2', 8.2), panelSize: 3 });

    await service.saveScores(tampered());

    const row = (await stored()).playerScores.find((ps) => String(ps.playerId) === String(PLAYER));
    expect(row.judgeScores.seniorJudge).toBe(8.4);
    expect(row.judgeScores.judge1).toBe(8.0);
    expect(row.judgeScores.judge2).toBe(8.2);
    expect(row.judgeSlips.find((sl) => sl.judgeRole === 'J1').total).toBe(8.0);
    // The time is the Scorer's; its deduction is worked out on the server
    // (95 s is 5 over → 0.30), and the other deduction is not theirs to set.
    expect(row.time).toBe('1:35');
    expect(row.deduction).toBe(0.3);
    expect(Number(row.otherDeduction) || 0).toBe(0);
    // 3-judge panel: the simple average of the stored marks, less 0.30.
    expect(row.averageMarks).toBeCloseTo(8.2, 3);
    expect(row.finalScore).toBeCloseTo(7.9, 3);
  });

  it('writes no marks when the Scorer saves before any judge', async () => {
    await buildService().saveScores(tampered({ time: '1:10' }));
    const row = (await stored()).playerScores[0];
    expect(row.time).toBe('1:10');
    expect(row.judgeScores?.judge1 ?? 0).toBe(0);
    expect(row.judgeScores?.seniorJudge ?? 0).toBe(0);
    expect(row.finalScore).toBe(0);
  });

  it('leaves an admin save as it was', async () => {
    const service = buildService();
    await service.saveScores({ ...slipFrom('judge1', 'J1', 8.0), panelSize: 3 });
    await service.saveScores({ ...tampered(), scorerTimeOnly: false });
    const row = (await stored()).playerScores[0];
    expect(row.judgeScores.judge1).toBe(10);
    expect(row.otherDeduction).toBe(1);
  });
});

