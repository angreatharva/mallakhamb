/**
 * Absent (user rule 2026-11-15): the Senior Judge marks an athlete who did not
 * perform. Every scoring rule is overridden: all marks, the time, every
 * deduction and the final score are 0, and the row is finalized for the whole
 * panel. No other save changes it; only a per-athlete admin unlock clears it.
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
const ASHA = oid();
const MEERA = oid();
const ADMIN = oid();

function buildService(socketManager = null) {
  return new ScoringService(
    new ScoreRepository(quiet),
    { findById: async () => ({ _id: COMPETITION }) },
    { find: async () => [{ _id: ASHA, isActive: true }, { _id: MEERA, isActive: true }] },
    null,
    socketManager,
    quiet,
    new CalculationService(quiet)
  );
}

const category = {
  competitionId: COMPETITION, teamId: TEAM, gender: 'Female', ageGroup: 'Under14', competitionType: 'Competition I',
};
const slip = (playerId, name, field, role, score) => ({
  ...category,
  panelSize: 3,
  playerScores: [{
    playerId, playerName: name, apparatus: 'Pole Mallakhamb', judgeScores: { [field]: score },
    judgeSlips: [{ judgeRole: role, total: score }],
  }],
});
/** What the controller hands the service for the Senior Judge's Absent. */
const absent = (playerId, name) => ({
  ...category,
  markAbsent: true,
  isFinalSubmit: true,
  playerScores: [{ playerId, playerName: name, apparatus: 'Pole Mallakhamb', isAbsent: true }],
});
const stored = () => Score.findOne({ teamId: TEAM, competition: COMPETITION }).lean();
const rowOf = (doc, playerId) => doc.playerScores.find((ps) => String(ps.playerId) === String(playerId));

describe('marking an athlete absent', () => {
  it('writes every value 0, finalized, over slips already submitted', async () => {
    const emitted = [];
    const service = buildService({ emitToRoom: (room, event, data) => emitted.push({ event, data }) });
    await service.saveScores(slip(ASHA, 'Asha', 'judge1', 'J1', 8.0));
    await service.saveScores(absent(ASHA, 'Asha'));

    const row = rowOf(await stored(), ASHA);
    expect(row).toMatchObject({
      isAbsent: true, isFinalized: true, time: '0', deduction: 0, otherDeduction: 0, averageMarks: 0, finalScore: 0,
    });
    expect(Object.values(row.judgeScores).every((v) => v === 0)).toBe(true);
    expect(row.judgeSlips).toEqual([]);
    // Every judge's screen hears it is final, and that it is an absence.
    expect(emitted.find((e) => e.event === 'scores_saved_notification').data).toMatchObject({ isAbsent: true, isFinalized: true });
  });

  it('works for an athlete nobody has scored yet', async () => {
    const service = buildService();
    await service.saveScores(absent(MEERA, 'Meera'));
    expect(rowOf(await stored(), MEERA)).toMatchObject({ isAbsent: true, finalScore: 0, isFinalized: true });
  });

  it('no judge slip, Scorer time or admin sheet changes an absent row', async () => {
    const service = buildService();
    await service.saveScores(absent(ASHA, 'Asha'));
    await expect(service.saveScores(slip(ASHA, 'Asha', 'judge2', 'J2', 7.5))).rejects.toThrow(/locked/);
    await service.saveScores({
      ...category, allowFinalizedEdit: true, scorerTimeOnly: true,
      playerScores: [{ playerId: ASHA, playerName: 'Asha', apparatus: 'Pole Mallakhamb', time: '0:40' }],
    });
    await service.saveScores({
      ...category, allowFinalizedEdit: true, isLocked: true,
      playerScores: [{ playerId: ASHA, playerName: 'Asha', apparatus: 'Pole Mallakhamb', judgeScores: { judge1: 9 }, finalScore: 9 }],
    });
    expect(rowOf(await stored(), ASHA)).toMatchObject({ isAbsent: true, time: '0', deduction: 0, finalScore: 0 });
  });

  it('a judge cannot mark absent an athlete whose score is already final', async () => {
    const service = buildService();
    await service.saveScores(slip(ASHA, 'Asha', 'judge1', 'J1', 8.0));
    await service.saveScores({ ...slip(ASHA, 'Asha', 'seniorJudge', 'SR_JUDGE', 8.4), isFinalSubmit: true });
    await expect(service.saveScores(absent(ASHA, 'Asha'))).rejects.toThrow(/already final/);
  });

  it('a whole-sheet unlock keeps the absence; a per-athlete unlock clears it', async () => {
    const service = buildService();
    await service.saveScores(slip(MEERA, 'Meera', 'judge1', 'J1', 7.6));
    await service.saveScores({ ...slip(MEERA, 'Meera', 'seniorJudge', 'SR_JUDGE', 7.8), isFinalSubmit: true });
    await service.saveScores(absent(ASHA, 'Asha'));
    const doc = await stored();

    await service.unlockScoreAsAdmin(doc._id, ADMIN, { competitionId: COMPETITION });
    let after = await stored();
    expect(rowOf(after, MEERA).isFinalized).toBe(false);
    expect(rowOf(after, ASHA)).toMatchObject({ isAbsent: true, isFinalized: true });

    await service.unlockPlayerForJudges(doc._id, { playerId: ASHA, apparatus: 'Pole Mallakhamb' }, ADMIN, { competitionId: COMPETITION });
    after = await stored();
    expect(rowOf(after, ASHA)).toMatchObject({ isAbsent: false, isFinalized: false, time: '' });
    // …and the panel can score the performance again.
    await service.saveScores(slip(ASHA, 'Asha', 'judge1', 'J1', 8.2));
    expect(rowOf(await stored(), ASHA).judgeScores.judge1).toBe(8.2);
  });

  // Found by the e2e (2026-11-15): the Scorer's Lock & Submit waits for a
  // Senior Judge mark above 0 (rule 2026-11-11), which an absent row never has.
  const scorerLock = (...rows) => ({
    ...category, allowFinalizedEdit: true, scorerTimeOnly: true, isLocked: true,
    playerScores: rows.map(([playerId, playerName]) => ({ playerId, playerName, apparatus: 'Pole Mallakhamb', time: '0:40' })),
  });

  it('the Scorer can Lock & Submit a sheet with an absent athlete', async () => {
    const service = buildService();
    await service.saveScores(slip(MEERA, 'Meera', 'judge1', 'J1', 7.6));
    await service.saveScores({ ...slip(MEERA, 'Meera', 'seniorJudge', 'SR_JUDGE', 7.8), isFinalSubmit: true });
    await service.saveScores(absent(ASHA, 'Asha'));
    await service.saveScores(scorerLock([MEERA, 'Meera'], [ASHA, 'Asha']));
    const doc = await stored();
    expect(doc.lockedApparatus).toHaveLength(1);
    expect(rowOf(doc, ASHA)).toMatchObject({ isAbsent: true, finalScore: 0, time: '0' });
  });

  it('an absent athlete does not excuse another the Senior Judge has not marked', async () => {
    const service = buildService();
    await service.saveScores(slip(MEERA, 'Meera', 'judge1', 'J1', 7.6));
    await service.saveScores(absent(ASHA, 'Asha'));
    await expect(service.saveScores(scorerLock([MEERA, 'Meera'], [ASHA, 'Asha'])))
      .rejects.toThrow(/Senior Judge has not marked Meera yet/);
  });
});
