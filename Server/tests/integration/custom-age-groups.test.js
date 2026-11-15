/**
 * Custom age groups end to end (owner, 2026-11-15): the Super Admin defines
 * them on a competition, every model stores their key like a COP value, the
 * coach enters players by the group's own range, and a group still holding
 * entries cannot be deleted.
 */
const { validationResult } = require('express-validator');
const SuperAdminService = require('../../src/services/user/super-admin.service');
const CompetitionService = require('../../src/services/competition/competition.service');
const CoachService = require('../../src/services/user/coach.service');
const PlayerTeamService = require('../../src/services/team/player-team.service');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const PlayerRepository = require('../../src/repositories/player.repository');
const Competition = require('../../src/models/Competition');
const Admin = require('../../src/models/Admin');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const Player = require('../../src/models/Player');
const Score = require('../../src/models/Score');
const Judge = require('../../src/models/Judge');
const PerformanceOrder = require('../../src/models/PerformanceOrder');
const Qualification = require('../../src/models/Qualification');
const TieBreakDraw = require('../../src/models/TieBreakDraw');
const competitionValidators = require('../../src/validators/competition.validator');
const adminValidators = require('../../src/validators/admin.validator');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const config = { get: () => undefined };
const cache = { get: () => null, set() {}, delete() {}, deletePattern() {} };
const YEAR = new Date().getUTCFullYear() + 1;
const born = (age) => new Date(`${YEAR - age}-07-01T00:00:00Z`);

function services() {
  const competitionRepository = new CompetitionRepository(noopLogger);
  const adminRepository = new AdminRepository(noopLogger);
  const superAdmin = new SuperAdminService({ competitionRepository, adminRepository, logger: noopLogger });
  return { competitionRepository, adminRepository, superAdmin };
}

async function createMeet(superAdmin, extra = {}) {
  const admin = await Admin.create({ name: 'Meet Admin', email: `meet${Math.random()}@example.com`, password: 'AdminPass1!', role: 'admin' });
  return superAdmin.createCompetition({
    name: `Custom meet ${Math.random()}`, level: 'district', place: 'Pune', year: YEAR,
    startDate: `${YEAR}-12-12`, endDate: `${YEAR}-12-13`,
    playerFee: 300, maxTeamSize: 4, competitionTypes: ['competition_1'],
    apparatusByGender: { competition_1: { Male: ['Pole Mallakhamb'], Female: ['Rope Mallakhamb'] } },
    admins: [admin._id],
    customAgeGroups: [{ label: 'Under 11', minAge: '', maxAge: '11' }, { key: 'CustomVeterans35', label: 'Veterans 35+', minAge: 35, maxAge: null }],
    ageGroups: [
      { gender: 'Male', ageGroup: 'Under12' },
      { gender: 'Male', ageGroup: 'CustomUnder11' },
      { gender: 'Female', ageGroup: 'CustomUnder11' },
      { gender: 'Male', ageGroup: 'CustomVeterans35' },
    ],
    ...extra,
  }, admin._id);
}

describe('the Super Admin defines a meet\'s own age groups', () => {
  test('create stores the definitions and the per-gender ticks', async () => {
    const { superAdmin } = services();
    const meet = await createMeet(superAdmin);
    const saved = await Competition.findById(meet._id).lean();
    expect(saved.customAgeGroups).toEqual([
      { key: 'CustomUnder11', label: 'Under 11', minAge: null, maxAge: 11 },
      { key: 'CustomVeterans35', label: 'Veterans 35+', minAge: 35, maxAge: null },
    ]);
    expect(saved.ageGroups.map(({ gender, ageGroup }) => `${gender}:${ageGroup}`))
      .toEqual(['Male:Under12', 'Male:CustomUnder11', 'Female:CustomUnder11', 'Male:CustomVeterans35']);
  });

  test('a tick for a group the meet does not define is refused', async () => {
    const { superAdmin } = services();
    await expect(createMeet(superAdmin, { customAgeGroups: [], ageGroups: [{ gender: 'Male', ageGroup: 'CustomGhost' }] }))
      .rejects.toThrow('not defined for this competition');
  });

  test('edit renames, adds and removes; a group with a player in it stays', async () => {
    const { superAdmin } = services();
    const meet = await createMeet(superAdmin);
    await superAdmin.updateCompetition(meet._id, {
      customAgeGroups: [{ key: 'CustomUnder11', label: 'Under Eleven', minAge: null, maxAge: 11 }, { label: 'Open', minAge: null, maxAge: null }],
      ageGroups: [{ gender: 'Female', ageGroup: 'CustomUnder11' }, { gender: 'Female', ageGroup: 'CustomOpen' }],
    });
    let saved = await Competition.findById(meet._id).lean();
    expect(saved.customAgeGroups.map((d) => `${d.key}=${d.label}`)).toEqual(['CustomUnder11=Under Eleven', 'CustomOpen=Open']);
    expect(saved.ageGroups.map((g) => g.ageGroup)).toEqual(['CustomUnder11', 'CustomOpen']);

    const coach = await Coach.create({ firstName: 'C', lastName: 'Coach', email: `c${Math.random()}@example.com`, phone: '9100000001', password: 'CoachPass1' });
    const team = await Team.create({ name: 'Custom Club', coach: coach._id });
    await Competition.updateOne({ _id: meet._id }, { $push: { registeredTeams: { team: team._id, coach: coach._id, players: [{ gender: 'Female', ageGroup: 'CustomOpen' }] } } });
    await expect(superAdmin.updateCompetition(meet._id, { customAgeGroups: [{ key: 'CustomUnder11', label: 'Under Eleven', maxAge: 11 }] }))
      .rejects.toMatchObject({ details: expect.objectContaining({ reason: 'CUSTOM_AGE_GROUP_IN_USE' }) });
    saved = await Competition.findById(meet._id).lean();
    expect(saved.customAgeGroups).toHaveLength(2);
  });

  test('an admin may switch defined groups on and off but not define new ones', async () => {
    const { superAdmin, competitionRepository, adminRepository } = services();
    const meet = await createMeet(superAdmin);
    const competitions = new CompetitionService(competitionRepository, cache, null, noopLogger, adminRepository);
    await competitions.updateCompetition(meet._id, {
      customAgeGroups: [{ label: 'Sneaky', maxAge: 9 }],
      ageGroups: [{ gender: 'Female', ageGroup: 'CustomUnder11' }],
    });
    const saved = await Competition.findById(meet._id).lean();
    expect(saved.customAgeGroups.map((d) => d.key)).toEqual(['CustomUnder11', 'CustomVeterans35']);
    expect(saved.ageGroups.map((g) => g.ageGroup)).toEqual(['CustomUnder11']);
  });

  test('the request validators accept custom groups and refuse junk', async () => {
    const run = async (chains, body) => {
      const req = { body, params: {}, query: {} };
      for (const chain of chains) await chain.run(req);
      return validationResult(req).array().map((e) => e.msg);
    };
    const update = competitionValidators.updateCompetition();
    expect(await run(update, { customAgeGroups: [{ label: 'Under 11', maxAge: 11 }], ageGroups: [{ gender: 'Male', ageGroup: 'CustomUnder11' }] })).toEqual([]);
    expect(await run(update, { ageGroups: [{ gender: 'Male', ageGroup: 'Under11' }] })).toEqual(['Invalid age group in age groups']);
    expect(await run(update, { customAgeGroups: [{ label: 'x', key: 'Under12' }] })).toEqual(['Invalid custom age group key']);
    expect(await run(update, { customAgeGroups: [{ maxAge: 3 }] })).toEqual(['Every custom age group needs a name']);
  });
});

describe('every category store takes a custom key', () => {
  test.each([
    ['Score', Score], ['Judge', Judge], ['PerformanceOrder', PerformanceOrder], ['Qualification', Qualification], ['TieBreakDraw', TieBreakDraw],
  ])('%s', (_, Model) => {
    expect(new Model({ ageGroup: 'CustomUnder11' }).validateSync()?.errors?.ageGroup).toBeUndefined();
    expect(new Model({ ageGroup: 'AllAges' }).validateSync()?.errors?.ageGroup).toBeUndefined();
    expect(new Model({ ageGroup: 'Under11' }).validateSync()?.errors?.ageGroup).toBeDefined();
  });

  test('a player and a squad entry take one too, but never All ages', () => {
    expect(new Player({ ageGroup: 'CustomUnder11' }).validateSync()?.errors?.ageGroup).toBeUndefined();
    expect(new Player({ ageGroup: 'AllAges' }).validateSync()?.errors?.ageGroup).toBeDefined();
    const meet = new Competition({ registeredTeams: [{ players: [{ ageGroup: 'CustomUnder11' }, { ageGroup: 'AllAges' }] }] });
    const errors = meet.validateSync()?.errors || {};
    expect(errors['registeredTeams.0.players.0.ageGroup']).toBeUndefined();
    expect(errors['registeredTeams.0.players.1.ageGroup']).toBeDefined();
  });

  test('category routes accept a custom key', async () => {
    const req = { body: { gender: 'Male', ageGroup: 'CustomUnder11', competitionTypes: ['competition_1'] }, params: {}, query: {} };
    const chains = adminValidators.saveJudges();
    for (const chain of chains) await chain.run(req);
    expect(validationResult(req).array().filter((e) => e.path === 'ageGroup')).toEqual([]);
  });
});

describe('the coach enters players by the group\'s own range', () => {
  async function setup() {
    const coachRepository = new CoachRepository(noopLogger);
    const teamRepository = new TeamRepository(noopLogger);
    const playerRepository = new PlayerRepository(noopLogger);
    const competitionRepository = new CompetitionRepository(noopLogger);
    const coachService = new CoachService(coachRepository, teamRepository, noopLogger, null, null, competitionRepository, playerRepository, config, null);
    coachService.playerTeamService = new PlayerTeamService({ playerRepository, teamRepository, logger: noopLogger });
    const coach = await Coach.create({ firstName: 'Range', lastName: 'Coach', email: `r${Math.random()}@example.com`, phone: '9100000002', password: 'CoachPass1' });
    const team = await Team.create({ name: 'Range Club', coach: coach._id });
    const meet = await Competition.create({
      name: `Range meet ${Math.random()}`, level: 'district', place: 'Pune', year: YEAR,
      startDate: new Date(`${YEAR}-12-12T00:00:00Z`), endDate: new Date(`${YEAR}-12-13T00:00:00Z`),
      playerFee: 300, competitionTypes: ['competition_1'], apparatusConfig: { competition_1: ['Pole Mallakhamb'] },
      customAgeGroups: [{ key: 'CustomUnder11', label: 'Under 11', minAge: null, maxAge: 11 }, { key: 'CustomVeterans35', label: 'Veterans 35+', minAge: 35, maxAge: null }],
      ageGroups: [{ gender: 'Male', ageGroup: 'CustomUnder11' }, { gender: 'Male', ageGroup: 'Under14' }, { gender: 'Male', ageGroup: 'CustomVeterans35' }],
      registeredTeams: [{ team: team._id, coach: coach._id, isActive: true, players: [] }],
    });
    const player = (age, name) => Player.create({
      firstName: name, lastName: 'Patil', gender: 'Male', dateOfBirth: born(age), team: team._id,
      emailType: 'self', email: `${name}${Math.random()}@example.com`, phone: '9100000003', password: 'PlayerPass1',
    });
    return { coachService, coach, meet, player };
  }

  test('an 11-year-old goes into Under 11; a 12-year-old is told why not', async () => {
    const { coachService, coach, meet, player } = await setup();
    const young = await player(11, 'Aarav');
    const older = await player(12, 'Vihaan');
    const entry = (p, ageGroup) => ({ playerId: String(p._id), ageGroup, gender: 'Male', apparatus: ['Pole Mallakhamb'] });
    await coachService.addPlayerToAgeGroup(coach._id, meet._id, entry(young, 'CustomUnder11'));
    await expect(coachService.addPlayerToAgeGroup(coach._id, meet._id, entry(older, 'CustomUnder11')))
      .rejects.toMatchObject({
        message: expect.stringContaining(`is 12 on 31 Dec ${YEAR}, too old for Under 11. Choose Under 14.`),
        details: expect.objectContaining({ reason: 'AGE_GROUP_NOT_ALLOWED', eligible: ['Under14'] }),
      });
    const saved = await Competition.findById(meet._id).lean();
    expect(saved.registeredTeams[0].players).toEqual([expect.objectContaining({ ageGroup: 'CustomUnder11' })]);
  });

  test('a veterans group refuses the too young', async () => {
    const { coachService, coach, meet, player } = await setup();
    const p = await player(30, 'Ravi');
    await expect(coachService.addPlayerToAgeGroup(coach._id, meet._id, { playerId: String(p._id), ageGroup: 'CustomVeterans35', gender: 'Male', apparatus: ['Pole Mallakhamb'] }))
      .rejects.toThrow('too young for Veterans 35+');
  });
});
