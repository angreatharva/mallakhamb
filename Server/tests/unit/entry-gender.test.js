/**
 * A squad entry's gender must match the athlete's own.
 *
 * `registeredTeams[].players[].gender` arrives in the coach's payload and used
 * to be written straight through, independent of `Player.gender`. Two records
 * of the same fact that nothing kept in step — and they decide different
 * things. The ENTRY's gender picks the category, the panel seat and the Score
 * document; several client screens filtered the roster on the ACCOUNT's while
 * pairing it with the entry's ageGroup.
 *
 * So a coach picking the wrong option put an athlete into a category the client
 * would then not show them in — or showed them to one panel and scored them
 * under another. The entry stays authoritative, and is verified on write so the
 * two cannot drift.
 */

const CoachService = require('../../src/services/user/coach.service');
const { ValidationError, NotFoundError } = require('../../src/errors');

const COACH_ID = '6a8a9286fe57edf060353b19';
const COMPETITION_ID = '6a8a9286fe57edf060353b1a';
const TEAM_ID = '6a8a9286fe57edf060353b1b';
const PLAYER_ID = '6a8a9286fe57edf060353b1c';

/**
 * A coach service wired with just enough to reach the guard.
 * @param {Object} player - what playerRepository.findById returns
 */
function buildService(player) {
  const updates = [];

  const competition = {
    _id: COMPETITION_ID,
    registeredTeams: [{
      team: TEAM_ID,
      coach: COACH_ID,
      players: [],
    }],
  };

  const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  // Positional, matching the constructor:
  // (coachRepository, teamRepository, logger, cacheService, authenticationService,
  //  competitionRepository, playerRepository, config, transactionRepository)
  const service = new CoachService(
    { findById: async () => ({ _id: COACH_ID }) },
    { find: async () => [{ _id: TEAM_ID, coach: COACH_ID }] },
    quiet,
    null,
    null,
    {
      findById: async () => competition,
      updateById: async (id, update) => { updates.push(update); return competition; },
    },
    { findById: async () => player }
  );

  // getCoachTeams is the first thing addPlayerToAgeGroup calls; stubbing it
  // keeps this test on the guard rather than on team resolution.
  service.getCoachTeams = async () => [{ _id: TEAM_ID }];

  return { service, updates };
}

const add = (service, gender) => service.addPlayerToAgeGroup(COACH_ID, COMPETITION_ID, {
  playerId: PLAYER_ID,
  ageGroup: 'Under14',
  gender,
  apparatus: {},
});

describe('addPlayerToAgeGroup — entry gender', () => {
  it('refuses an entry whose gender contradicts the athlete', async () => {
    const { service, updates } = buildService({
      _id: PLAYER_ID, firstName: 'Asha', lastName: 'Kulkarni', gender: 'Female',
    });

    await expect(add(service, 'Male')).rejects.toThrow(ValidationError);
    // Nothing written — the entry must not exist in a state the client cannot
    // find the athlete in.
    expect(updates).toHaveLength(0);
  });

  it('names the athlete and both genders, so the coach can see what to change', async () => {
    const { service } = buildService({
      _id: PLAYER_ID, firstName: 'Asha', lastName: 'Kulkarni', gender: 'Female',
    });

    await expect(add(service, 'Male')).rejects.toThrow(/Asha Kulkarni.*Female.*Male/);
  });

  it('accepts an entry that agrees with the athlete', async () => {
    const { service, updates } = buildService({
      _id: PLAYER_ID, firstName: 'Asha', lastName: 'Kulkarni', gender: 'Female',
    });

    await add(service, 'Female');

    expect(updates).toHaveLength(1);
    const pushed = Object.values(updates[0].$push)[0];
    expect(pushed.gender).toBe('Female');
  });

  it('refuses when the athlete does not exist', async () => {
    const { service } = buildService(null);
    await expect(add(service, 'Female')).rejects.toThrow(NotFoundError);
  });

  it('writes the entry when the athlete has no recorded gender', async () => {
    // `Player.gender` is required by the schema, so this is defensive: a legacy
    // row without one must not become unaddable.
    const { service, updates } = buildService({
      _id: PLAYER_ID, firstName: 'Legacy', lastName: 'Row', gender: undefined,
    });

    await add(service, 'Male');

    expect(updates).toHaveLength(1);
  });
});
