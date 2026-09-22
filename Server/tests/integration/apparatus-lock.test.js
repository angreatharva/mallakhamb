/**
 * Locking one apparatus must not finalize the other two.
 *
 * A panel is seated per apparatus, so a squad entered for Pole, Hanging and
 * Rope is judged three separate times by three separate panels. All three sets
 * of marks live in ONE `Score` document: its identity index
 * `score_identity_unique` is {teamId, gender, ageGroup, competition,
 * competitionType} and carries no apparatus.
 *
 * `isLocked` was a single boolean over that document, so the Scorer sitting
 * with the Pole panel pressing "Lock & Submit" — which simply meant Pole was
 * finished — froze Rope and Hanging before anyone had performed on them. The
 * sheet came back read-only and there was no way forward short of an admin
 * unlock.
 *
 * `lockedApparatus` records what was actually locked. `isLocked` stays the
 * admin's whole-sheet freeze, and published results honour both.
 */

const mongoose = require('mongoose');

const ScoringService = require('../../src/services/scoring/scoring.service');
const CalculationService = require('../../src/services/scoring/calculation.service');
const PublicService = require('../../src/services/public/public.service');
const ScoreRepository = require('../../src/repositories/score.repository');
const Score = require('../../models/Score');
// `getPublicScores` populates `teamId`, so the model has to be registered on
// this connection even though these tests never read a team's fields.
require('../../models/Team');

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const oid = () => new mongoose.Types.ObjectId();

const COMPETITION = oid();
const TEAM = oid();
const PLAYER = oid();

const playerRepositoryStub = { find: async () => [{ _id: PLAYER, isActive: true }] };

const buildScoring = () => new ScoringService(
  new ScoreRepository(quiet),
  { findById: async () => ({ _id: COMPETITION }) },
  playerRepositoryStub,
  null,
  null,
  quiet,
  new CalculationService(quiet)
);

const buildPublic = () => new PublicService({
  competitionRepository: { findById: async () => ({ _id: COMPETITION }) },
  scoreRepository: new ScoreRepository(quiet),
  adminService: null,
  logger: quiet,
});

const category = {
  competitionId: COMPETITION,
  teamId: TEAM,
  gender: 'Male',
  ageGroup: 'Above18',
  competitionType: 'Competition I',
};

/**
 * One apparatus' sheet, as ScorerScoring.jsx now sends it — narrowed to the
 * apparatus the Scorer's panel is seated for.
 *
 * @param {string} apparatus
 * @param {{lock?: boolean, score?: number}} [opts]
 */
const sheetFor = (apparatus, { lock = false, score = 8 } = {}) => ({
  ...category,
  timeKeeper: 'R. Patil',
  scorer: 'S. Rao',
  isLocked: lock,
  isFinalSubmit: true,
  playerScores: [{
    playerId: PLAYER,
    playerName: 'Atharva Angre',
    apparatus,
    time: '01:30',
    judgeScores: { seniorJudge: score, judge1: score, judge2: score },
  }],
});

const stored = () => Score.findOne({ teamId: TEAM, competition: COMPETITION }).lean();

const rowFor = (doc, apparatus) =>
  doc.playerScores.find((ps) => ps.apparatus === apparatus);

describe('locking one apparatus', () => {
  let scoring;

  beforeEach(() => {
    scoring = buildScoring();
  });

  it('leaves the other apparatus writable', async () => {
    // The reported bug: Pole finished first, and Rope could never be scored.
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { lock: true, score: 7.5 }));

    await expect(
      scoring.saveScores(sheetFor('Rope Mallakhamb', { score: 8.1 }))
    ).resolves.toBeDefined();

    const doc = await stored();
    expect(rowFor(doc, 'Rope Mallakhamb').judgeScores.seniorJudge).toBe(8.1);
    // And Pole is untouched by the Rope write.
    expect(rowFor(doc, 'Pole Mallakhamb').judgeScores.seniorJudge).toBe(7.5);
  });

  it('refuses a second write to the apparatus it locked', async () => {
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { lock: true, score: 7.5 }));

    await expect(
      scoring.saveScores(sheetFor('Pole Mallakhamb', { score: 9.9 }))
    ).rejects.toThrow(/Pole Mallakhamb.*locked/);

    expect(rowFor(await stored(), 'Pole Mallakhamb').judgeScores.seniorJudge).toBe(7.5);
  });

  it('records the apparatus without freezing the document', async () => {
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { lock: true }));

    const doc = await stored();
    expect(doc.lockedApparatus).toEqual(['Pole Mallakhamb']);
    // `isLocked` is the admin's whole-sheet freeze and nothing else sets it.
    expect(doc.isLocked).toBe(false);
  });

  it('accumulates as each panel finishes', async () => {
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { lock: true }));
    await scoring.saveScores(sheetFor('Rope Mallakhamb', { lock: true }));

    expect((await stored()).lockedApparatus.sort())
      .toEqual(['Pole Mallakhamb', 'Rope Mallakhamb']);
  });

  it('is cleared by an admin unlock, or the unlock reopens nothing', async () => {
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { lock: true, score: 7.5 }));
    const doc = await stored();

    await scoring.unlockScore(doc._id);

    expect((await stored()).lockedApparatus).toEqual([]);
    await expect(
      scoring.saveScores(sheetFor('Pole Mallakhamb', { score: 9.1 }))
    ).resolves.toBeDefined();
  });

  it('still lets an admin freeze the whole sheet', async () => {
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { score: 7.5 }));
    await Score.updateOne({ teamId: TEAM }, { isLocked: true });

    await expect(
      scoring.saveScores(sheetFor('Rope Mallakhamb', { score: 8.1 }))
    ).rejects.toThrow(/locked and cannot be modified/);
  });
});

describe('published results', () => {
  let scoring;
  let publicService;

  beforeEach(() => {
    scoring = buildScoring();
    publicService = buildPublic();
  });

  const published = async () => {
    const rows = await publicService.getPublicScores(String(COMPETITION), {});
    return rows.flatMap((r) => r.playerScores).map((ps) => ps.apparatus);
  };

  it('shows the locked apparatus and holds the unlocked one back', async () => {
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { lock: true, score: 7.5 }));
    await scoring.saveScores(sheetFor('Rope Mallakhamb', { score: 8.1 }));

    // Rope has a Senior Judge's Final Submit on it but no Scorer lock, so it is
    // still a panel's working score — exactly what the lock keeps private.
    expect(await published()).toEqual(['Pole Mallakhamb']);
  });

  it('adds each apparatus as its panel finishes', async () => {
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { lock: true, score: 7.5 }));
    await scoring.saveScores(sheetFor('Rope Mallakhamb', { lock: true, score: 8.1 }));

    expect((await published()).sort()).toEqual(['Pole Mallakhamb', 'Rope Mallakhamb']);
  });

  it('publishes nothing while every panel is still scoring', async () => {
    await scoring.saveScores(sheetFor('Pole Mallakhamb', { score: 7.5 }));

    expect(await published()).toEqual([]);
  });
});
