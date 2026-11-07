/**
 * Admin / superadmin unlock of the judges' scores (user rule 2026-11-08).
 *
 * After the Senior Judge's Final Submit a judge can no longer change their
 * slip, and after the Scorer's Lock & Submit nothing on that apparatus can be
 * written. The unlock has to open BOTH, for one athlete or the whole sheet,
 * without touching a single mark — and an admin may only reach sheets in their
 * own meet.
 */

const mongoose = require('mongoose');

const ScoringService = require('../../src/services/scoring/scoring.service');
const CalculationService = require('../../src/services/scoring/calculation.service');
const ScoreRepository = require('../../src/repositories/score.repository');
const Score = require('../../src/models/Score');
const { NotFoundError } = require('../../src/errors');

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
const row = (playerId, name, judgeScores) => ({
  playerId, playerName: name, apparatus: 'Pole Mallakhamb', judgeScores,
});
const slip = (playerId, name, field, role, score) => ({
  ...category,
  panelSize: 3,
  playerScores: [{ ...row(playerId, name, { [field]: score }), judgeSlips: [{ judgeRole: role, total: score }] }],
});
const stored = () => Score.findOne({ teamId: TEAM, competition: COMPETITION }).lean();
const rowOf = (doc, playerId) => doc.playerScores.find((ps) => String(ps.playerId) === String(playerId));

/** Both athletes scored, Final Submitted by the Senior Judge, sheet locked by the Scorer. */
async function finishedSheet(service) {
  await service.saveScores(slip(ASHA, 'Asha', 'judge1', 'J1', 8.0));
  await service.saveScores(slip(MEERA, 'Meera', 'judge1', 'J1', 7.6));
  await service.saveScores({ ...slip(ASHA, 'Asha', 'seniorJudge', 'SR_JUDGE', 8.4), isFinalSubmit: true });
  await service.saveScores({ ...slip(MEERA, 'Meera', 'seniorJudge', 'SR_JUDGE', 7.8), isFinalSubmit: true });
  await service.saveScores({
    ...category, isLocked: true, allowFinalizedEdit: true, scorerTimeOnly: true,
    playerScores: [{ ...row(ASHA, 'Asha', {}), time: '1:20' }, { ...row(MEERA, 'Meera', {}), time: '1:25' }],
  });
  return stored();
}

describe('unlocking one athlete for the judges', () => {
  it('starts from a sheet the judges cannot write to', async () => {
    const service = buildService();
    const doc = await finishedSheet(service);
    expect(rowOf(doc, ASHA).isFinalized).toBe(true);
    expect(doc.lockedApparatus).toContain('Pole Mallakhamb');
    await expect(service.saveScores(slip(ASHA, 'Asha', 'judge1', 'J1', 9.0))).rejects.toThrow(/locked/);
  });

  it('reopens that athlete only, keeps every mark, and lets the judge resubmit', async () => {
    const emitted = [];
    const service = buildService({ emitToRoom: (room, event, data) => emitted.push({ room, event, data }) });
    const doc = await finishedSheet(service);

    const result = await service.unlockPlayerForJudges(
      doc._id, { playerId: ASHA, apparatus: 'Pole Mallakhamb' }, ADMIN, { competitionId: COMPETITION }
    );
    expect(result.isFinalized).toBe(false);

    const after = await stored();
    expect(rowOf(after, ASHA).isFinalized).toBe(false);
    expect(rowOf(after, MEERA).isFinalized).toBe(true);
    expect(after.lockedApparatus).not.toContain('Pole Mallakhamb');
    expect(after.isLocked).toBe(false);
    // Nothing the panel or the Scorer recorded moved.
    expect(rowOf(after, ASHA).judgeScores.judge1).toBe(8.0);
    expect(rowOf(after, ASHA).judgeScores.seniorJudge).toBe(8.4);
    expect(rowOf(after, ASHA).time).toBe('1:20');
    // Open screens are told, in both room-id forms.
    const notes = emitted.filter((e) => e.event === 'scores_saved_notification' && e.data.unlocked);
    expect(notes.map((e) => e.room).sort()).toEqual(['scoring_Female_Under14_Competition I', 'scoring_Female_Under14_competition_1']);
    expect(notes[0].data).toMatchObject({ playerId: ASHA, unlocked: true, isFinalized: false });

    // The judge can now correct the slip.
    await service.saveScores(slip(ASHA, 'Asha', 'judge1', 'J1', 8.2));
    expect(rowOf(await stored(), ASHA).judgeScores.judge1).toBe(8.2);
    // Meera is still finalized: her judges are still refused.
    await expect(service.saveScores(slip(MEERA, 'Meera', 'judge1', 'J1', 9.0))).rejects.toThrow(/finalized/);
  });

  it('refuses a sheet from another meet to an admin, and an unknown athlete', async () => {
    const service = buildService();
    const doc = await finishedSheet(service);
    await expect(service.unlockPlayerForJudges(doc._id, { playerId: ASHA }, ADMIN, { competitionId: oid() }))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(service.unlockPlayerForJudges(doc._id, { playerId: oid() }, ADMIN, {}))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(rowOf(await stored(), ASHA).isFinalized).toBe(true);
  });
});

describe('unlocking the whole sheet', () => {
  it('reopens every athlete for the judges, marks untouched', async () => {
    const service = buildService();
    const doc = await finishedSheet(service);

    await service.unlockScoreAsAdmin(doc._id, ADMIN, { competitionId: COMPETITION });

    const after = await stored();
    expect(after.lockedApparatus).toEqual([]);
    expect(rowOf(after, ASHA).isFinalized).toBe(false);
    expect(rowOf(after, MEERA).isFinalized).toBe(false);
    expect(rowOf(after, MEERA).judgeScores.judge1).toBe(7.6);
    await service.saveScores(slip(MEERA, 'Meera', 'judge1', 'J1', 7.9));
    expect(rowOf(await stored(), MEERA).judgeScores.judge1).toBe(7.9);
  });

  it('is scoped to the admin\'s meet', async () => {
    const service = buildService();
    const doc = await finishedSheet(service);
    await expect(service.unlockScoreAsAdmin(doc._id, ADMIN, { competitionId: oid() }))
      .rejects.toBeInstanceOf(NotFoundError);
    expect((await stored()).lockedApparatus).toContain('Pole Mallakhamb');
  });
});
