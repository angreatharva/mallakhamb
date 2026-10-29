/**
 * Competition I → II / III against a real database (docs/qualification-plan.md):
 * waiting until locked, the team cap, the all-ages final, entries written for
 * the finals, freezing, withdrawal and replacement, coach emails.
 */

const QualificationService = require('../../src/services/scoring/qualification.service');
const QualificationRepository = require('../../src/repositories/qualification.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const ScoreRepository = require('../../src/repositories/score.repository');
const TieBreakDrawRepository = require('../../src/repositories/tie-break-draw.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const Competition = require('../../src/models/Competition');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const Player = require('../../src/models/Player');
const Score = require('../../src/models/Score');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const year = new Date().getUTCFullYear() + 1;
const POLE = 'Pole Mallakhamb';
const ROPE = 'Rope Mallakhamb';

function build() {
  const otpService = { notifyCoachOfQualifiers: jest.fn() };
  const service = new QualificationService({
    qualificationRepository: new QualificationRepository(noopLogger),
    competitionRepository: new CompetitionRepository(noopLogger),
    scoreRepository: new ScoreRepository(noopLogger),
    tieBreakDrawRepository: new TieBreakDrawRepository(noopLogger),
    teamRepository: new TeamRepository(noopLogger),
    otpService,
    logger: noopLogger,
  });
  return { service, otpService };
}

let n = 0;
async function team(name) {
  n += 1;
  const coach = await Coach.create({ firstName: name, lastName: 'Coach', email: `q${n}.${Math.random()}@example.com`, phone: '9100000001', password: 'CoachPass1' });
  return Team.create({ name, coach: coach._id });
}
async function player(name, age) {
  n += 1;
  return Player.create({
    firstName: name, lastName: 'Q', gender: 'Male', dateOfBirth: new Date(`${year - age}-03-01T00:00:00Z`),
    emailType: 'self', email: `pl${n}.${Math.random()}@example.com`, phone: '9100000002', password: 'PlayerPass1',
  });
}

/**
 * A meet running I + II + III for boys on Pole and Rope, U12 and U14.
 * `squads`: [{ team, players: [{ player, ageGroup }] }]
 */
async function meet(squads, types = ['competition_1', 'competition_2', 'competition_3']) {
  return Competition.create({
    name: `Finals ${Math.random()}`, level: 'district', place: 'Pune', year,
    startDate: new Date(`${year}-12-12T00:00:00Z`), endDate: new Date(`${year}-12-13T00:00:00Z`),
    playerFee: 300, competitionTypes: types,
    apparatusConfig: Object.fromEntries(types.map((t) => [t, [POLE, ROPE]])),
    ageGroups: [{ gender: 'Male', ageGroup: 'Under12' }, { gender: 'Male', ageGroup: 'Under14' }],
    registeredTeams: squads.map(({ team: t, players }) => ({
      team: t._id, coach: t.coach, isActive: true, isSubmitted: true, paymentStatus: 'completed',
      players: players.map(({ player: p, ageGroup }) => ({ player: p._id, gender: 'Male', ageGroup, apparatus: { competition_1: [POLE, ROPE] } })),
    })),
  });
}

/** Competition I scores of one team in one age group; locked unless told otherwise. */
async function scores(competition, t, ageGroup, rows, { locked = [POLE, ROPE] } = {}) {
  return Score.create({
    competition: competition._id, teamId: t._id, gender: 'Male', ageGroup, competitionType: 'Competition I',
    lockedApparatus: locked,
    playerScores: rows.map(([p, apparatus, finalScore]) => ({
      playerId: p._id, playerName: `${p.firstName} Q`, apparatus, finalScore, isFinalized: true, panelSize: 5,
    })),
  });
}

const ids = (list) => list.map((q) => String(q.player)).sort();

describe('qualification service', () => {
  test('III waits until every team has locked, then takes the top 10 with at most 2 per team', async () => {
    const { service, otpService } = build();
    const a = await team('Alpha');
    const b = await team('Bravo');
    const [a1, a2, a3] = [await player('A1', 13), await player('A2', 13), await player('A3', 13)];
    const b1 = await player('B1', 13);
    const competition = await meet([
      { team: a, players: [a1, a2, a3].map((p) => ({ player: p, ageGroup: 'Under14' })) },
      { team: b, players: [{ player: b1, ageGroup: 'Under14' }] },
    ]);
    await scores(competition, a, 'Under14', [[a1, POLE, 9.5], [a2, POLE, 9.4], [a3, POLE, 9.3], [a1, ROPE, 8], [a2, ROPE, 8.1], [a3, ROPE, 7]]);

    await service.onCompetitionOneChange(competition._id, 'Male', 'Under14');
    let finals = await service.list(competition._id);
    const pole = () => finals.find((f) => f.competitionType === 'competition_3' && f.apparatus === POLE && f.ageGroup === 'Under14');
    expect(pole().status).toBe('waiting');
    expect(pole().waitingFor.join(' ')).toMatch(/Bravo/);

    await scores(competition, b, 'Under14', [[b1, POLE, 6], [b1, ROPE, 6]]);
    await service.onCompetitionOneChange(competition._id, 'Male', 'Under14');
    finals = await service.list(competition._id);
    expect(pole().status).toBe('set');
    expect(pole().qualifiers.map((q) => q.playerName)).toEqual(['A1 Q', 'A2 Q', 'B1 Q']); // A3 passed over: Alpha already has 2
    expect(pole().skipped).toEqual([expect.objectContaining({ playerName: 'A3 Q', reason: 'team_cap' })]);

    // The entries now carry the finals the engine decided.
    const saved = await Competition.findById(competition._id).lean();
    const entryOf = (p) => saved.registeredTeams.flatMap((rt) => rt.players).find((e) => String(e.player) === String(p._id));
    expect(entryOf(a1).apparatus.competition_3).toEqual(expect.arrayContaining([POLE, ROPE]));
    // A3 is Alpha's third on both apparatus: passed over on each, in no final.
    expect(entryOf(a3).apparatus.competition_3).toBeUndefined();
    expect(otpService.notifyCoachOfQualifiers).toHaveBeenCalled();
  });

  test('II: one All-ages final with the top 2 of each age group by the sum of every apparatus', async () => {
    const { service } = build();
    const a = await team('Alpha2');
    const [y1, y2, y3, o1, o2] = [await player('Y1', 11), await player('Y2', 11), await player('Y3', 11), await player('O1', 13), await player('O2', 13)];
    const competition = await meet([{ team: a, players: [
      ...[y1, y2, y3].map((p) => ({ player: p, ageGroup: 'Under12' })),
      ...[o1, o2].map((p) => ({ player: p, ageGroup: 'Under14' })),
    ] }], ['competition_1', 'competition_2']);
    await scores(competition, a, 'Under12', [[y1, POLE, 9], [y1, ROPE, 9], [y2, POLE, 9.9], [y3, POLE, 8], [y3, ROPE, 8.5]]);

    await service.onCompetitionOneChange(competition._id, 'Male', 'Under12');
    let [ii] = await service.list(competition._id);
    expect(ii).toMatchObject({ competitionType: 'competition_2', ageGroup: 'AllAges', status: 'waiting' });
    expect(ii.qualifiers.map((q) => q.playerName)).toEqual(['Y1 Q', 'Y3 Q']); // 18 and 16.5; Y2 did Pole only (9.9)

    await scores(competition, a, 'Under14', [[o1, POLE, 7], [o1, ROPE, 7], [o2, POLE, 6], [o2, ROPE, 6]]);
    await service.onCompetitionOneChange(competition._id, 'Male', 'Under14');
    [ii] = await service.list(competition._id);
    expect(ii.status).toBe('set');
    expect(ii.qualifiers.map((q) => q.playerName)).toEqual(['Y1 Q', 'Y3 Q', 'O1 Q', 'O2 Q']);
  });

  test('a withdrawal is replaced by the next in rank; after the first final score the list is frozen', async () => {
    const { service } = build();
    const teams = [];
    const boys = [];
    for (const name of ['Tango', 'Uniform', 'Victor', 'Whiskey']) teams.push(await team(name));
    for (const name of ['Pa', 'Pb', 'Pc', 'Pd']) boys.push(await player(name, 13));
    const competition = await meet(teams.map((t, i) => ({ team: t, players: [{ player: boys[i], ageGroup: 'Under14' }] })), ['competition_1', 'competition_3']);
    for (let i = 0; i < 4; i++) await scores(competition, teams[i], 'Under14', [[boys[i], POLE, 9 - i], [boys[i], ROPE, 9 - i]]);
    await service.onCompetitionOneChange(competition._id, 'Male', 'Under14');

    const doc = (await service.list(competition._id)).find((f) => f.apparatus === POLE);
    expect(doc.qualifiers).toHaveLength(4);
    // Make the cap bite less: withdraw P2, everyone else stays (only 4 performed).
    const after = await service.withdraw({ id: null }, doc._id, { playerId: String(boys[1]._id) });
    expect(ids(after.qualifiers)).toEqual([boys[0], boys[2], boys[3]].map((p) => String(p._id)).sort());

    // The final starts: a Competition I correction now only warns.
    await service.markStarted(competition._id, 'competition_3', 'Male', 'Under14', [POLE]);
    await Score.updateOne({ teamId: teams[3]._id }, { $set: { 'playerScores.$[].finalScore': 9.9 } });
    await Score.create({ competition: competition._id, teamId: teams[0]._id, gender: 'Male', ageGroup: 'Under14', competitionType: 'Competition III',
      playerScores: [{ playerId: boys[0]._id, playerName: 'Pa Q', apparatus: POLE, finalScore: 0, isFinalized: false }] });
    await service.reinstate({ id: null }, doc._id, { playerId: String(boys[1]._id) }).catch((e) => e);
    const frozen = (await service.list(competition._id)).find((f) => f.apparatus === POLE);
    expect(frozen.status).toBe('started');
    await expect(service.withdraw({ id: null }, doc._id, { playerId: String(boys[0]._id) })).rejects.toThrow(/started/);
  });

  test('a legacy meet and a meet running Competition I only are left alone', async () => {
    const { service } = build();
    const a = await team('Legacy');
    const p = await player('L1', 13);
    const one = await meet([{ team: a, players: [{ player: p, ageGroup: 'Under14' }] }], ['competition_1']);
    await scores(one, a, 'Under14', [[p, POLE, 9]]);
    await service.onCompetitionOneChange(one._id, 'Male', 'Under14');
    expect(await service.list(one._id)).toEqual([]);

    const legacy = await meet([{ team: a, players: [{ player: p, ageGroup: 'Under14' }] }]);
    await Competition.updateOne({ _id: legacy._id }, { $set: { legacyFinals: true } });
    await scores(legacy, a, 'Under14', [[p, POLE, 9]]);
    await service.onCompetitionOneChange(legacy._id, 'Male', 'Under14');
    expect(await service.list(legacy._id)).toEqual([]);
  });
});
