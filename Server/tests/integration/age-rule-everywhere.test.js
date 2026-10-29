/**
 * The COP age rule at every point a player is put into a team's age group
 * (docs/team-per-level-plan.md, step 2): age on 31 December of the cut-off
 * year, "Under N" includes N, their own group or any higher one.
 */

const { validationResult } = require('express-validator');
const CoachService = require('../../src/services/user/coach.service');
const PlayerTeamService = require('../../src/services/team/player-team.service');
const RegistrationService = require('../../src/services/competition/registration.service');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const PlayerRepository = require('../../src/repositories/player.repository');
const Competition = require('../../src/models/Competition');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const Player = require('../../src/models/Player');
const { checkAgeGroup, assertAgeGroup } = require('../../src/utils/data/age-eligibility.util');
const playerValidators = require('../../src/validators/player.validator');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const config = { get: () => undefined };
const cache = { get: () => null, set() {}, delete() {}, deletePattern() {} };
// The meets below are held in this year, so ages count on 31 Dec of it.
const CUTOFF = new Date().getUTCFullYear() + 1;
const born = (age) => new Date(`${CUTOFF - age}-07-01T00:00:00Z`);

describe('the age check', () => {
  test('"Under N" includes N; one year older is out; playing up is always allowed', () => {
    const at = (age, ageGroup, gender = 'Male') => checkAgeGroup({ dateOfBirth: born(age), gender, ageGroup, cutoffYear: CUTOFF }).ok;
    expect(at(12, 'Under12')).toBe(true);
    expect(at(13, 'Under12')).toBe(false);
    expect(at(13, 'Under14')).toBe(true);
    expect(at(10, 'Above18')).toBe(true); // play up
    expect(at(15, 'Above16', 'Female')).toBe(true); // a girl playing up into Above 16
    expect(at(17, 'Under16', 'Female')).toBe(false);
  });

  test('the owner example: a meet held in 2021 counts on 31 Dec 2021 — born 2008 is Under 14, born 2009 may play Under 12', () => {
    const meet = { startDate: new Date('2021-12-12T00:00:00Z') };
    expect(checkAgeGroup({ dateOfBirth: new Date('2008-12-31'), gender: 'Male', ageGroup: 'Under14', competition: meet }).ok).toBe(true);
    expect(checkAgeGroup({ dateOfBirth: new Date('2008-12-31'), gender: 'Male', ageGroup: 'Under12', competition: meet }).ok).toBe(false);
    expect(checkAgeGroup({ dateOfBirth: new Date('2009-01-01'), gender: 'Male', ageGroup: 'Under12', competition: meet }).ok).toBe(true);
  });

  test('the refusal says the age, the cut-off and what to choose', () => {
    const meet = { startDate: new Date(`${CUTOFF}-12-12T00:00:00Z`), ageGroups: [{ gender: 'Male', ageGroup: 'Under12' }, { gender: 'Male', ageGroup: 'Under14' }] };
    expect(() => assertAgeGroup({ player: { firstName: 'Aarav', lastName: 'Patil', dateOfBirth: born(13) }, gender: 'Male', ageGroup: 'Under12', competition: meet }))
      .toThrow(`Aarav Patil is 13 on 31 Dec ${CUTOFF}, too old for Under 12. Choose Under 14.`);
  });
});

describe('every path enforces it', () => {
  async function setup() {
    const coachRepository = new CoachRepository(noopLogger);
    const teamRepository = new TeamRepository(noopLogger);
    const playerRepository = new PlayerRepository(noopLogger);
    const competitionRepository = new CompetitionRepository(noopLogger);
    const teams = new PlayerTeamService({ playerRepository, teamRepository, logger: noopLogger });
    const coachService = new CoachService(coachRepository, teamRepository, noopLogger, null, null, competitionRepository, playerRepository, config, null);
    const registrationService = new RegistrationService(competitionRepository, teamRepository, cache, noopLogger);
    coachService.playerTeamService = teams;
    registrationService.playerTeamService = teams;

    const coach = await Coach.create({ firstName: 'Age', lastName: 'Coach', email: `age${Math.random()}@example.com`, phone: '9100000009', password: 'CoachPass1' });
    const team = await Team.create({ name: 'Age Club', coach: coach._id });
    const meet = await Competition.create({
      name: `Age meet ${Math.random()}`, level: 'district', place: 'Pune', year: CUTOFF,
      startDate: new Date(`${CUTOFF}-12-12T00:00:00Z`), endDate: new Date(`${CUTOFF}-12-13T00:00:00Z`),
      playerFee: 300, competitionTypes: ['competition_1'],
      apparatusConfig: { competition_1: ['Pole Mallakhamb'] },
      ageGroups: [{ gender: 'Male', ageGroup: 'Under12' }, { gender: 'Male', ageGroup: 'Under14' }],
      registeredTeams: [{ team: team._id, coach: coach._id, isActive: true, players: [] }],
    });
    const player = await Player.create({
      firstName: 'Aarav', lastName: 'Patil', gender: 'Male', dateOfBirth: born(13), team: team._id,
      emailType: 'self', email: `aarav${Math.random()}@example.com`, phone: '9100000010', password: 'PlayerPass1',
    });
    return { coachService, registrationService, coach, team, meet, player };
  }

  test('coach squad entry: too old for Under 12 is refused, Under 14 is entered', async () => {
    const { coachService, coach, meet, player } = await setup();
    const entry = (ageGroup) => ({ playerId: String(player._id), ageGroup, gender: 'Male', apparatus: ['Pole Mallakhamb'] });
    await expect(coachService.addPlayerToAgeGroup(coach._id, meet._id, entry('Under12')))
      .rejects.toMatchObject({ statusCode: 400, details: expect.objectContaining({ reason: 'AGE_GROUP_NOT_ALLOWED', eligible: ['Under14'] }) });
    await coachService.addPlayerToAgeGroup(coach._id, meet._id, entry('Under14'));
    const saved = await Competition.findById(meet._id).lean();
    expect(saved.registeredTeams[0].players).toEqual([expect.objectContaining({ ageGroup: 'Under14' })]);
  });

  test('the competition route refuses too old', async () => {
    const { registrationService, coach, team, meet, player } = await setup();
    await expect(registrationService.addPlayerToRegistration(meet._id, team._id, player._id, 'Under12', 'Male', { id: coach._id, type: 'coach' }))
      .rejects.toMatchObject({ details: expect.objectContaining({ reason: 'AGE_GROUP_NOT_ALLOWED' }) });
  });

  test('an older entry that breaks the rule is kept and flagged on the dashboard', async () => {
    const { coachService, coach, meet, player } = await setup();
    await Competition.updateOne({ _id: meet._id }, { $push: { 'registeredTeams.0.players': { player: player._id, gender: 'Male', ageGroup: 'Under12' } } });
    const dashboard = await coachService.getTeamDashboard(coach._id, meet._id);
    expect(dashboard.team.players).toHaveLength(1);
    expect(dashboard.team.players[0].ageIssue).toMatchObject({
      age: 13, eligible: ['Under14'], message: `Too old for Under 12 (13 on 31 Dec ${CUTOFF}) — move to Under 14`,
    });
  });

  test('a player\'s own age group (registration) is checked on 31 Dec of this year', async () => {
    const year = new Date().getUTCFullYear();
    const run = async (body) => {
      const req = { body };
      for (const chain of playerValidators.createPlayer()) await chain.run(req);
      return validationResult(req).array().filter((e) => e.path === 'ageGroup');
    };
    const base = { gender: 'Male', dateOfBirth: `${year - 13}-05-01` };
    expect(await run({ ...base, ageGroup: 'Under12' })).toEqual([expect.objectContaining({ msg: expect.stringMatching(/too old for Under 12; choose Under 14/) })]);
    expect(await run({ ...base, ageGroup: 'Under14' })).toEqual([]);
  });
});
