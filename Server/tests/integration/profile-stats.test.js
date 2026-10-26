/**
 * Profile stats and the Judge fairness board, on a real in-memory MongoDB.
 *
 * The fixture is two meets of one category (Male / Under14 / Competition I,
 * Pole) with three teams and a five-judge panel. Judge "Asha" is seated as
 * Judge 1, shares a home state with Team A, and marks Team A half a point above
 * the rest of the panel; Judge "Bala" is strict with everyone. The first meet's
 * slips carry no author (written before slips were stamped), the second meet's
 * are stamped.
 *
 * What is pinned:
 *  - only PUBLISHED marks reach any graph (finalized AND locked);
 *  - a player's sections and rank match the public board's rules;
 *  - players and coaches never receive a judge's identity;
 *  - a coach sees only their own teams;
 *  - a consistent lean is flagged, a strict-with-everyone judge is not, and
 *    inferred authorship alone never flags anyone;
 *  - an admin sees only their own meets;
 *  - migration 013 freezes inferred authors, is re-runnable and reversible.
 */

const mongoose = require('mongoose');

const StatsService = require('../../src/services/stats/stats.service');
const PublicService = require('../../src/services/public/public.service');
const ScoreRepository = require('../../src/repositories/score.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const JudgeRepository = require('../../src/repositories/judge.repository');
const JudgeAccountRepository = require('../../src/repositories/judge-account.repository');
const { averageSlipBreakdown } = require('../../src/utils/scoring/slip-breakdown.util');
const migration013 = require('../../src/migrations/013_judge_slip_authors');

const Score = require('../../src/models/Score');
const Team = require('../../src/models/Team');
const Competition = require('../../src/models/Competition');
const Judge = require('../../src/models/Judge');
const JudgeAccount = require('../../src/models/JudgeAccount');

const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const oid = () => new mongoose.Types.ObjectId();

const C1 = oid();
const C2 = oid();
const COACH = oid();
const OTHER_COACH = oid();
const TEAM_A = oid(); // Maharashtra, coach's
const TEAM_B = oid(); // Gujarat, coach's
const TEAM_C = oid(); // Goa, another coach's

const ACCOUNTS = {
  'Senior Judge': { _id: oid(), firstName: 'Sana', lastName: 'Sood', stateUnit: 'Delhi' },
  'Judge 1': { _id: oid(), firstName: 'Asha', lastName: 'Lean', stateUnit: 'Maharashtra' },
  'Judge 2': { _id: oid(), firstName: 'Bala', lastName: 'Strict', stateUnit: 'Kerala' },
  'Judge 3': { _id: oid(), firstName: 'Chitra', lastName: 'Fair', stateUnit: 'Punjab' },
  'Judge 4': { _id: oid(), firstName: 'Dev', lastName: 'Fair', stateUnit: 'Assam' },
};
const ROLE = { 'Senior Judge': 'SR_JUDGE', 'Judge 1': 'J1', 'Judge 2': 'J2', 'Judge 3': 'J3', 'Judge 4': 'J4' };
const FIELD = { 'Senior Judge': 'seniorJudge', 'Judge 1': 'judge1', 'Judge 2': 'judge2', 'Judge 3': 'judge3', 'Judge 4': 'judge4' };

const TEAMS = [
  { _id: TEAM_A, name: 'Team A', coach: COACH, stateUnit: 'Maharashtra', players: 6 },
  { _id: TEAM_B, name: 'Team B', coach: COACH, stateUnit: 'Gujarat', players: 4 },
  { _id: TEAM_C, name: 'Team C', coach: OTHER_COACH, stateUnit: 'Goa', players: 4 },
];
const PLAYERS = Object.fromEntries(TEAMS.map((t) => [String(t._id), Array.from({ length: t.players }, () => oid())]));
const P1 = PLAYERS[String(TEAM_A)][0];

const round05 = (v) => Math.round(v * 20) / 20;

/** One judge's slip: D 3.00 and C 1.60 fixed, Execution carries the mark. */
function slipFor(seat, total, stamp) {
  const execution = round05(total - 4.6);
  return {
    judgeRole: ROLE[seat],
    difficultyScore: 3.0,
    combinationScore: 1.6,
    executionScore: execution,
    bonusScore: 0,
    total: Number((4.6 + execution).toFixed(2)),
    breakdown: {
      difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.0 },
      combination: { checked: { 1: true, 2: true, 3: seat !== 'Judge 3', 4: true }, total: 1.6 },
      execution,
    },
    ...(stamp ? { judgeAccountId: ACCOUNTS[seat]._id, attribution: 'recorded' } : {}),
  };
}

/** A published performance: five slips around a base mark. */
function performance({ playerId, team, base, stamp, apparatus = 'Pole Mallakhamb', finalized = true }) {
  const marks = {
    'Senior Judge': base,
    'Judge 1': team === TEAM_A ? base + 0.5 : base + 0.05,
    'Judge 2': base - 0.3,
    'Judge 3': base,
    'Judge 4': base - 0.05,
  };
  const judgeSlips = Object.entries(marks).map(([seat, total]) => slipFor(seat, total, stamp));
  return {
    playerId,
    playerName: `Athlete ${String(playerId).slice(-4)}`,
    apparatus,
    time: '01:20',
    panelSize: 5,
    judgeScores: Object.fromEntries(judgeSlips.map((s, i) => [FIELD[Object.keys(marks)[i]], s.total])),
    judgeSlips,
    executionAverage: base,
    averageMarks: base,
    finalScore: base,
    isFinalized: finalized,
  };
}

async function seed() {
  await Competition.collection.insertMany([
    { _id: C1, name: 'Winter Open', level: 'state', place: 'Pune', year: 2026, startDate: new Date('2026-01-10'), endDate: new Date('2026-01-12') },
    { _id: C2, name: 'Summer Cup', level: 'national', place: 'Nagpur', year: 2026, startDate: new Date('2026-06-10'), endDate: new Date('2026-06-12') },
  ]);
  await Team.collection.insertMany(TEAMS.map(({ players, ...t }) => ({ ...t, isActive: true })));
  await JudgeAccount.collection.insertMany(Object.values(ACCOUNTS).map((a, i) => ({
    ...a, email: `judge${i}@club.in`, password: 'x', isActive: true,
  })));
  for (const competition of [C1, C2]) {
    await Judge.collection.insertMany(Object.entries(ACCOUNTS).map(([judgeType, acc], i) => ({
      judgeAccount: acc._id, competition, competitionTypes: ['competition_1'], gender: 'Male',
      ageGroup: 'Under14', apparatus: 'Pole Mallakhamb', judgeNo: i + 1, judgeType, isActive: true,
    })));
  }

  let k = 0;
  for (const [competition, stamp] of [[C1, false], [C2, true]]) {
    for (const team of TEAMS) {
      const rows = PLAYERS[String(team._id)].map((playerId) => {
        k += 1;
        return performance({ playerId, team: team._id, base: 7.6 + 0.05 * (k % 15), stamp });
      });
      if (competition === C2 && team._id === TEAM_A) {
        // Rope finalized but NOT locked — must stay out of every graph.
        rows.push(performance({ playerId: P1, team: TEAM_A, base: 8.2, stamp, apparatus: 'Rope Mallakhamb' }));
      }
      if (competition === C1 && team._id === TEAM_A) {
        // Locked sheet, but the Senior Judge never Final Submitted this row.
        rows.push(performance({ playerId: P1, team: TEAM_A, base: 8.1, stamp, apparatus: 'Hanging Mallakhamb', finalized: false }));
      }
      await Score.create({
        competition,
        teamId: team._id,
        gender: 'Male',
        ageGroup: 'Under14',
        competitionType: 'Competition I',
        isLocked: competition === C1,
        lockedApparatus: competition === C2 ? ['Pole Mallakhamb'] : [],
        playerScores: rows,
      });
    }
  }
}

function buildService() {
  const scoreRepository = new ScoreRepository(quiet);
  const competitionRepository = new CompetitionRepository(quiet);
  const publicService = new PublicService({
    competitionRepository, scoreRepository, adminService: null, logger: quiet,
  });
  return new StatsService({
    scoreRepository,
    competitionRepository,
    teamRepository: new TeamRepository(quiet),
    judgeRepository: new JudgeRepository(quiet),
    judgeAccountRepository: new JudgeAccountRepository(quiet),
    publicService,
    logger: quiet,
  });
}

const accountOf = (seat) => ACCOUNTS[seat];

describe('profile stats', () => {
  let stats;
  beforeEach(async () => {
    await seed();
    stats = buildService();
  });

  describe('player', () => {
    test('only published performances, with board rank and the published sections', async () => {
      const result = await stats.getPlayerStats({ _id: P1, firstName: 'Atharva', lastName: 'Angre' });

      expect(result.player.name).toBe('Atharva Angre');
      // Pole at both meets; the unlocked Rope and the unfinalized Hanging are out.
      expect(result.performances.map((p) => [p.competitionName, p.apparatus])).toEqual([
        ['Winter Open', 'Pole Mallakhamb'],
        ['Summer Cup', 'Pole Mallakhamb'],
      ]);
      expect(result.competitions.map((c) => c.name)).toEqual(['Winter Open', 'Summer Cup']);

      const first = result.performances[0];
      const doc = await Score.findOne({ competition: C1, teamId: TEAM_A }).lean();
      const row = doc.playerScores.find((ps) => String(ps.playerId) === String(P1) && ps.apparatus === 'Pole Mallakhamb');
      const expected = averageSlipBreakdown(row.judgeSlips, 5);
      expect(first.sections.execution).toBeCloseTo(expected.execution, 3);
      expect(first.sections.difficulty).toBe(3);
      expect(first.fieldSize).toBe(14);
      expect(first.rank).toBeGreaterThanOrEqual(1);
      expect(first.category.best).toBeGreaterThanOrEqual(first.finalScore);
      // Judge 3 missed checklist item 3; the counted judges decide what shows.
      expect(first.checklist.items.find((i) => i.id === 3).metBy).toBeLessThanOrEqual(first.checklist.of);
      expect(first.elements).toEqual({ a: 4, b: 6, c: 1 });
      expect(first.panel.map((j) => j.seat)).toEqual(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']);
      expect(first.panel.filter((j) => j.counted)).toHaveLength(2);

      expect(result.summary.performances).toBe(2);
      expect(result.summary.meets).toBe(2);
      expect(result.checklists['Pole Mallakhamb']).toHaveLength(10);
    });

    test('never carries a judge identity', async () => {
      const result = await stats.getPlayerStats({ _id: P1 });
      const wire = JSON.stringify(result);
      for (const acc of Object.values(ACCOUNTS)) {
        expect(wire).not.toContain(String(acc._id));
        expect(wire).not.toContain(acc.lastName);
      }
      expect(wire).not.toContain('judgeAccountId');
    });
  });

  describe('coach', () => {
    test("sees every athlete on their own teams and nobody else's", async () => {
      const result = await stats.getCoachStats({ _id: COACH });
      expect(result.teams.map((t) => t.name).sort()).toEqual(['Team A', 'Team B']);
      expect(result.athletes).toHaveLength(10);
      expect(result.performances.every((p) => ['Team A', 'Team B'].includes(p.teamName))).toBe(true);
      expect(result.performances).toHaveLength(20);
      expect(result.performances[0].panel).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain(String(ACCOUNTS['Judge 1']._id));
    });

    test('a coach with no teams gets an empty, well-formed answer', async () => {
      const result = await stats.getCoachStats({ _id: oid() });
      expect(result).toMatchObject({ teams: [], performances: [], athletes: [] });
    });
  });

  describe('judge', () => {
    test("a consistent lean toward the judge's home-state team is flagged", async () => {
      const result = await stats.getJudgeStats(accountOf('Judge 1'));
      const teamA = result.byTeam.find((t) => t.teamName === 'Team A');
      const teamB = result.byTeam.find((t) => t.teamName === 'Team B');

      expect(result.summary.performances).toBe(28);
      expect(result.summary.inferredShare).toBe(0.5);
      expect(teamA.isHomeState).toBe(true);
      expect(teamA.lean).toBeGreaterThan(0.3);
      expect(teamA.flagged).toBe(true);
      expect(teamB.flagged).toBe(false);
      expect(result.homeState.flagged).toBe(true);
    });

    test('a judge strict with everyone is described, not flagged', async () => {
      const result = await stats.getJudgeStats(accountOf('Judge 2'));
      expect(result.summary.strictness.mean).toBeLessThan(-0.2);
      expect(result.summary.sections.execution.mean).toBeLessThan(-0.2);
      expect(result.byTeam.some((t) => t.flagged)).toBe(false);
    });

    test('limits to one meet when asked; inferred marks alone flag nobody', async () => {
      const result = await stats.getJudgeStats(accountOf('Judge 1'), { competitionId: String(C1) });
      expect(result.scope.competitionId).toBe(String(C1));
      expect(result.competitions).toHaveLength(2);
      expect(result.summary.performances).toBe(14);
      expect(result.summary.inferredShare).toBe(1);
      const teamA = result.byTeam.find((t) => t.teamName === 'Team A');
      expect(teamA.lean).toBeGreaterThan(0.3);
      expect(teamA.flagged).toBe(false);
    });
  });

  describe('judge fairness board', () => {
    test('an admin sees only their own meets', async () => {
      await expect(stats.getJudgeIntegrity({ user: { competitions: [C2] }, userType: 'admin', competitionId: String(C1) }))
        .rejects.toMatchObject({ statusCode: 403 });
      await expect(stats.getJudgeIntegrity({ user: { competitions: [C2] }, userType: 'admin' }))
        .rejects.toThrow('Choose a competition');

      const board = await stats.getJudgeIntegrity({ user: { competitions: [C2] }, userType: 'admin', competitionId: String(C2) });
      expect(board.judges).toHaveLength(5);
      expect(board.teams.map((t) => t.name)).toEqual(['Team A', 'Team B', 'Team C']);
      expect(board.flags[0]).toMatchObject({ judgeName: 'Asha Lean', teamName: 'Team A' });
    });

    test('a super admin may look across every meet', async () => {
      const board = await stats.getJudgeIntegrity({ user: { role: 'superadmin' }, userType: 'superadmin' });
      expect(board.performances).toBe(28);
      expect(board.competitions).toHaveLength(2);
      const asha = board.judges.find((j) => j.name === 'Asha Lean');
      expect(asha.flaggedTeams).toBe(1);
      const bala = board.judges.find((j) => j.name === 'Bala Strict');
      expect(bala.flaggedTeams).toBe(0);
      expect(bala.strictness.mean).toBeLessThan(-0.2);
      expect(board.flags.every((f) => f.judgeName === 'Asha Lean')).toBe(true);
    });
  });
});

describe('migration 013 — judge slip authors', () => {
  beforeEach(seed);

  // Pole only: the Hanging row has no seated panel, so nobody can be inferred.
  const slipsOf = async (competition) => (await Score.find({ competition }).lean())
    .flatMap((d) => d.playerScores.filter((ps) => ps.apparatus === 'Pole Mallakhamb').flatMap((ps) => ps.judgeSlips));

  test('a slip with no seated panel is left without an author', async () => {
    await migration013.up();
    const doc = await Score.findOne({ competition: C1, teamId: TEAM_A }).lean();
    const hanging = doc.playerScores.find((ps) => ps.apparatus === 'Hanging Mallakhamb');
    expect(hanging.judgeSlips.every((s) => !s.judgeAccountId)).toBe(true);
  });

  test('freezes inferred authors, leaves recorded ones, and reverses cleanly', async () => {
    await migration013.up();

    const c1 = await slipsOf(C1);
    expect(c1.every((s) => s.attribution === 'inferred' && s.judgeAccountId)).toBe(true);
    const j1 = c1.filter((s) => s.judgeRole === 'J1');
    expect(j1.every((s) => String(s.judgeAccountId) === String(ACCOUNTS['Judge 1']._id))).toBe(true);
    expect((await slipsOf(C2)).every((s) => s.attribution === 'recorded')).toBe(true);

    await migration013.up();
    expect((await slipsOf(C1)).every((s) => s.attribution === 'inferred')).toBe(true);

    await migration013.down();
    expect((await slipsOf(C1)).every((s) => !s.judgeAccountId && !s.attribution)).toBe(true);
    expect((await slipsOf(C2)).every((s) => s.attribution === 'recorded' && s.judgeAccountId)).toBe(true);
  });
});
