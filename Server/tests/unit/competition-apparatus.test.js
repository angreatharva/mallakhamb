/**
 * Apparatus per competition type AND gender, and what that means for a coach
 * entering an athlete.
 */

const {
  normalizeApparatusByGender,
  applyApparatusByGender,
  offeredApparatus,
} = require('../../src/utils/data/competition-apparatus.util');
const CoachService = require('../../src/services/user/coach.service');
const { ValidationError } = require('../../src/errors');

const POLE = 'Pole Mallakhamb';
const HANGING = 'Hanging Mallakhamb';
const ROPE = 'Rope Mallakhamb';

describe('normalizeApparatusByGender', () => {
  it('keeps each gender\'s list and derives the per-type union', () => {
    const result = normalizeApparatusByGender({
      competition_1: { Male: [ROPE, POLE, HANGING], Female: [ROPE] },
    }, ['competition_1']);

    expect(result.apparatusByGender).toEqual({
      competition_1: { Male: [POLE, HANGING, ROPE], Female: [ROPE] },
    });
    expect(result.apparatusConfig).toEqual({ competition_1: [POLE, HANGING, ROPE] });
  });

  it('drops types the meet does not run', () => {
    const result = normalizeApparatusByGender({
      competition_1: { Male: [POLE], Female: [] },
      competition_3: { Male: [ROPE], Female: [ROPE] },
    }, ['competition_1']);
    expect(Object.keys(result.apparatusConfig)).toEqual(['competition_1']);
  });

  it('refuses Hanging Mallakhamb for women', () => {
    expect(() => normalizeApparatusByGender({ competition_1: { Male: [], Female: [HANGING] } }, ['competition_1']))
      .toThrow(ValidationError);
  });

  it('refuses a type that runs nothing for either gender', () => {
    expect(() => normalizeApparatusByGender({ competition_1: { Male: [], Female: [] } }, ['competition_1']))
      .toThrow(/at least one apparatus for Competition I/);
  });

  it('refuses an unknown apparatus or type key', () => {
    expect(() => normalizeApparatusByGender({ competition_1: { Male: ['Trampoline'] } }, ['competition_1']))
      .toThrow(ValidationError);
    expect(() => normalizeApparatusByGender({ competition_9: { Male: [POLE] } }, ['competition_1']))
      .toThrow(ValidationError);
  });

  it('leaves a body without apparatusByGender alone', () => {
    const body = { apparatusConfig: { competition_1: [POLE] } };
    expect(applyApparatusByGender(body)).toBe(body);
  });

  it('overrides a sent apparatusConfig with the derived one', () => {
    const body = applyApparatusByGender({
      competitionTypes: ['competition_1'],
      apparatusConfig: { competition_1: [HANGING] },
      apparatusByGender: { competition_1: { Male: [POLE], Female: [ROPE] } },
    });
    expect(body.apparatusConfig).toEqual({ competition_1: [POLE, ROPE] });
  });
});

describe('offeredApparatus', () => {
  it('answers per gender when the meet declares it', () => {
    const competition = {
      apparatusConfig: { competition_1: [POLE, ROPE] },
      apparatusByGender: { competition_1: { Male: [POLE], Female: [ROPE] } },
    };
    expect(offeredApparatus(competition, 'competition_1', 'Male')).toEqual([POLE]);
    expect(offeredApparatus(competition, 'competition_1', 'Female')).toEqual([ROPE]);
  });

  it('reads a hydrated Map as well as a plain object', () => {
    const competition = {
      apparatusByGender: new Map([['competition_1', { Male: [POLE], Female: [] }]]),
    };
    expect(offeredApparatus(competition, 'competition_1', 'Male')).toEqual([POLE]);
    expect(offeredApparatus(competition, 'competition_1', 'Female')).toEqual([]);
  });

  it('falls back to the per-type list for an older meet, less Hanging for women', () => {
    const competition = { apparatusConfig: { competition_1: [POLE, HANGING, ROPE] } };
    expect(offeredApparatus(competition, 'competition_1', 'Male')).toEqual([POLE, HANGING, ROPE]);
    expect(offeredApparatus(competition, 'competition_1', 'Female')).toEqual([POLE, ROPE]);
  });
});

describe('addPlayerToAgeGroup — apparatus per gender and the squad cap', () => {
  const COACH_ID = '6a8a9286fe57edf060353b19';
  const COMPETITION_ID = '6a8a9286fe57edf060353b1a';
  const TEAM_ID = '6a8a9286fe57edf060353b1b';
  const PLAYER_ID = '6a8a9286fe57edf060353b1c';
  const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  function buildService({ competition, team, playerGender = 'Female' }) {
    const updates = [];
    const service = new CoachService(
      { findById: async () => ({ _id: COACH_ID }) },
      { find: async () => [team], findById: async () => team },
      quiet,
      null,
      null,
      {
        findById: async () => competition,
        addPlayerToRegistration: async (id, teamId, entry) => { updates.push(entry); return true; },
        updatePlayerInRegistration: async (id, teamId, playerId, fields) => { updates.push(fields); return true; },
      },
      { findById: async () => ({ _id: PLAYER_ID, firstName: 'Asha', lastName: 'K', gender: playerGender }) }
    );
    service.getCoachTeams = async () => [team];
    return { service, updates };
  }

  const meet = (players = [], maxTeamSize = 6) => ({
    _id: COMPETITION_ID,
    maxTeamSize,
    competitionTypes: ['competition_1', 'competition_3'],
    apparatusConfig: { competition_1: [POLE, ROPE], competition_3: [POLE, ROPE] },
    apparatusByGender: {
      competition_1: { Male: [POLE, ROPE], Female: [POLE] },
      competition_3: { Male: [POLE], Female: [ROPE] },
    },
    registeredTeams: [{ team: TEAM_ID, coach: COACH_ID, players }],
  });

  it('enters each type only for the apparatus it offers that gender', async () => {
    const { service, updates } = buildService({ competition: meet(), team: { _id: TEAM_ID, name: 'SGAM-A', maxTeamSize: 6 } });
    await service.addPlayerToAgeGroup(COACH_ID, COMPETITION_ID, {
      playerId: PLAYER_ID, ageGroup: 'Under14', gender: 'Female', apparatus: [POLE, ROPE],
    });
    expect(updates[0].apparatus).toEqual({ competition_1: [POLE], competition_3: [ROPE] });
  });

  it('refuses an apparatus the meet does not run for that gender at all', async () => {
    // Men run Rope nowhere in this meet.
    const competition = meet();
    competition.apparatusByGender.competition_1.Male = [POLE];
    const { service, updates } = buildService({
      competition, team: { _id: TEAM_ID, name: 'SGAM-A', maxTeamSize: 6 }, playerGender: 'Male',
    });
    await expect(service.addPlayerToAgeGroup(COACH_ID, COMPETITION_ID, {
      playerId: PLAYER_ID, ageGroup: 'Under14', gender: 'Male', apparatus: [ROPE],
    })).rejects.toThrow(/None of the selected apparatus/);
    expect(updates).toHaveLength(0);
  });

  it('refuses a fifth athlete per age group when the competition allows 4', async () => {
    const others = ['a', 'b', 'c', 'd'].map((suffix) => ({
      player: `6a8a9286fe57edf060353c0${suffix}`, gender: 'Female', ageGroup: 'Under14',
    }));
    const { service, updates } = buildService({
      competition: meet(others, 4), team: { _id: TEAM_ID, name: 'SGAM-A' },
    });
    await expect(service.addPlayerToAgeGroup(COACH_ID, COMPETITION_ID, {
      playerId: PLAYER_ID, ageGroup: 'Under14', gender: 'Female', apparatus: [POLE],
    })).rejects.toThrow(/at most 4 players per age group, and Female Under14 is full/);
    expect(updates).toHaveLength(0);
  });
});
