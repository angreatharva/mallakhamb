/**
 * A player's team is FINAL at each competition level (docs/team-per-level-plan.md).
 *
 * Every path that joins, registers or enters a player goes through
 * PlayerTeamService; these tests walk each one against a real database.
 */

const PlayerTeamService = require('../../src/services/team/player-team.service');
const CoachService = require('../../src/services/user/coach.service');
const CoachPlayerService = require('../../src/services/user/coach-player.service');
const PlayerService = require('../../src/services/user/player.service');
const TeamService = require('../../src/services/team/team.service');
const RegistrationService = require('../../src/services/competition/registration.service');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const CoachRepository = require('../../src/repositories/coach.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const PlayerRepository = require('../../src/repositories/player.repository');
const AuditLogRepository = require('../../src/repositories/audit-log.repository');
const Competition = require('../../src/models/Competition');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const Player = require('../../src/models/Player');
const AuditLog = require('../../src/models/AuditLog');
const PlayerTeamConflict = require('../../src/models/PlayerTeamConflict');
const { encrypt } = require('../../src/utils/security/data-encryption.util');
const migration014 = require('../../src/migrations/014_player_teams_per_level');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const config = { get: (key) => ({ 'jwt.secret': 'j'.repeat(40) }[key]) };
const cache = { get: () => null, set() {}, delete() {}, deletePattern() {} };
const thisYear = new Date().getUTCFullYear();

function build() {
  const coachRepository = new CoachRepository(noopLogger);
  const teamRepository = new TeamRepository(noopLogger);
  const playerRepository = new PlayerRepository(noopLogger);
  const competitionRepository = new CompetitionRepository(noopLogger);
  const notices = { notifyLevelTeamSet: jest.fn(), notifyCoachOfPlayerId: jest.fn() };
  const teams = new PlayerTeamService({
    playerRepository, teamRepository, auditLogRepository: new AuditLogRepository(noopLogger), otpService: notices, logger: noopLogger,
  });
  const coachService = new CoachService(coachRepository, teamRepository, noopLogger, null, null, competitionRepository, playerRepository, config, null);
  const coachPlayerService = new CoachPlayerService({ coachRepository, playerRepository, teamRepository, competitionRepository, otpService: notices, config, logger: noopLogger });
  const playerService = new PlayerService(playerRepository, teamRepository, noopLogger, null, null, competitionRepository);
  const teamService = new TeamService(teamRepository, playerRepository, competitionRepository, cache, null, noopLogger);
  const registrationService = new RegistrationService(competitionRepository, teamRepository, cache, noopLogger);
  for (const s of [coachService, coachPlayerService, playerService, teamService, registrationService]) s.playerTeamService = teams;
  return { teams, coachService, coachPlayerService, playerService, teamService, registrationService, notices };
}

let seq = 0;
async function coachWithTeam(name) {
  seq += 1;
  const coach = await Coach.create({
    firstName: name, lastName: 'Coach', email: `coach${seq}.${Math.random()}@example.com`, phone: `90000${String(seq).padStart(5, '0')}`,
    password: 'CoachPass1', playerDefaultPassword: encrypt('Default2026', config), playerDefaultPasswordSetAt: new Date(),
  });
  const team = await Team.create({ name: `${name} Club`, coach: coach._id });
  return { coach, team };
}

async function meet(level, registered = []) {
  return Competition.create({
    name: `${level} meet ${Math.random()}`,
    level,
    place: 'Pune',
    year: thisYear,
    startDate: new Date(`${thisYear + 1}-01-20T00:00:00Z`),
    endDate: new Date(`${thisYear + 1}-01-22T00:00:00Z`),
    playerFee: 300,
    competitionTypes: ['competition_1'],
    apparatusConfig: { competition_1: ['Pole Mallakhamb'] },
    ageGroups: [{ gender: 'Male', ageGroup: 'Under12' }],
    registeredTeams: registered.map(({ team, coach, players = [] }) => ({ team: team._id, coach: coach._id, isActive: true, players })),
  });
}

async function child(overrides = {}) {
  seq += 1;
  return Player.create({
    firstName: 'Aarav', lastName: `Patil${String.fromCharCode(97 + (seq % 26))}`, gender: 'Male',
    dateOfBirth: new Date(`${thisYear - 11}-03-14T00:00:00Z`),
    emailType: 'self', email: `p${seq}.${Math.random()}@example.com`, phone: '9000000001', password: 'PlayerPass1',
    ...overrides,
  });
}

const levelsOf = async (id) => Object.fromEntries(((await Player.findById(id).lean()).levelTeams || []).map((e) => [e.level, String(e.team)]));

describe('a player\'s team is final at each level', () => {
  test('set once per level; the same team again is a no-op; another team is refused', async () => {
    const { teams } = build();
    const sgam = await coachWithTeam('Sgam');
    const maha = await coachWithTeam('Maha');
    const p = await child();

    const first = await teams.setTeamAtLevel({ player: p._id, teamId: sgam.team._id, level: 'district', actor: { id: sgam.coach._id, type: 'coach' } });
    expect(first.created).toBe(true);
    expect((await teams.setTeamAtLevel({ player: p._id, teamId: sgam.team._id, level: 'district', actor: { type: 'system' } })).created).toBe(false);

    await expect(teams.setTeamAtLevel({ player: p._id, teamId: maha.team._id, level: 'district', actor: { id: maha.coach._id, type: 'coach' } }))
      .rejects.toMatchObject({ statusCode: 409, details: expect.objectContaining({ reason: 'TEAM_FINAL_AT_LEVEL', level: 'district' }) });

    // Another level is a separate, free choice.
    await teams.setTeamAtLevel({ player: p._id, teamId: maha.team._id, level: 'state', actor: { id: maha.coach._id, type: 'coach' } });
    expect(await levelsOf(p._id)).toEqual({ district: String(sgam.team._id), state: String(maha.team._id) });
    // The first team ever is kept as the old single team.
    expect(String((await Player.findById(p._id).lean()).team)).toBe(String(sgam.team._id));
  });

  test('two teams racing for the same child at one level: exactly one wins', async () => {
    const { teams } = build();
    const a = await coachWithTeam('Racea');
    const b = await coachWithTeam('Raceb');
    const p = await child();
    const results = await Promise.allSettled([
      teams.setTeamAtLevel({ player: p._id, teamId: a.team._id, level: 'national', actor: { id: a.coach._id, type: 'coach' } }),
      teams.setTeamAtLevel({ player: p._id, teamId: b.team._id, level: 'national', actor: { id: b.coach._id, type: 'coach' } }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await Player.findById(p._id).lean()).levelTeams).toHaveLength(1);
  });

  test('a team taking a child at a NEW level emails the player and the other coach, and is audited', async () => {
    const { teams, notices } = build();
    const sgam = await coachWithTeam('Notsgam');
    const maha = await coachWithTeam('Notmaha');
    const p = await child({ team: sgam.team._id, levelTeams: [{ level: 'district', team: sgam.team._id }] });

    await teams.setTeamAtLevel({ player: p._id, teamId: maha.team._id, level: 'state', actor: { id: maha.coach._id, type: 'coach' } });
    expect(notices.notifyLevelTeamSet).toHaveBeenCalledWith(expect.objectContaining({
      teamName: 'Notmaha Club', levelName: 'State',
      others: [expect.objectContaining({ teamName: 'Notsgam Club', levelName: 'District', coachId: sgam.coach._id })],
    }));
    expect(await AuditLog.countDocuments({ action: 'PLAYER_TEAM_SET', resourceId: String(p._id) })).toBe(1);

    // The player choosing for themself is not a claim: no emails.
    notices.notifyLevelTeamSet.mockClear();
    await teams.setTeamAtLevel({ player: p._id, teamId: maha.team._id, level: 'national', actor: { id: p._id, type: 'player' } });
    expect(notices.notifyLevelTeamSet).not.toHaveBeenCalled();
  });
});

describe('squad entry', () => {
  test('refuses a player another team holds at the meet\'s level; sets the level for a roster player', async () => {
    const { coachService } = build();
    const sgam = await coachWithTeam('Entsgam');
    const maha = await coachWithTeam('Entmaha');
    const district = await meet('district', [sgam, maha]);
    const taken = await child({ team: sgam.team._id, levelTeams: [{ level: 'district', team: sgam.team._id }] });
    const mine = await child({ team: maha.team._id });
    const stranger = await child();

    const entry = (p) => ({ playerId: String(p._id), ageGroup: 'Under12', gender: 'Male', apparatus: ['Pole Mallakhamb'] });
    await expect(coachService.addPlayerToAgeGroup(maha.coach._id, district._id, entry(taken)))
      .rejects.toMatchObject({ statusCode: 409, details: expect.objectContaining({ reason: 'TEAM_FINAL_AT_LEVEL' }) });
    await expect(coachService.addPlayerToAgeGroup(maha.coach._id, district._id, entry(stranger)))
      .rejects.toMatchObject({ details: expect.objectContaining({ reason: 'NOT_ON_TEAM' }) });

    await coachService.addPlayerToAgeGroup(maha.coach._id, district._id, entry(mine));
    expect(await levelsOf(mine._id)).toEqual({ district: String(maha.team._id) });
  });

  test('the competition route checks the coach owns the team, and the level rule', async () => {
    const { registrationService } = build();
    const own = await coachWithTeam('Ownrt');
    const other = await coachWithTeam('Othrt');
    const state = await meet('state', [own, other]);
    const p = await child({ team: own.team._id });

    await expect(registrationService.addPlayerToRegistration(state._id, other.team._id, p._id, 'Under12', 'Male', { id: own.coach._id, type: 'coach' }))
      .rejects.toMatchObject({ statusCode: 403 });
    await registrationService.addPlayerToRegistration(state._id, own.team._id, p._id, 'Under12', 'Male', { id: own.coach._id, type: 'coach' });
    expect(await levelsOf(p._id)).toEqual({ state: String(own.team._id) });
  });
});

describe('every other path', () => {
  test('player join-team: final at the chosen level, free at another, never a move without one', async () => {
    const { playerService } = build();
    const a = await coachWithTeam('Joina');
    const b = await coachWithTeam('Joinb');
    const p = await child();

    await playerService.joinTeam(p._id, a.team._id, null, { level: 'district' });
    await expect(playerService.joinTeam(p._id, b.team._id, null, { level: 'district' })).rejects.toMatchObject({ statusCode: 409 });
    await playerService.joinTeam(p._id, b.team._id, null, { level: 'state' });
    expect(await levelsOf(p._id)).toEqual({ district: String(a.team._id), state: String(b.team._id) });

    // No level: joining another team would be a move — refused.
    await expect(playerService.joinTeam(p._id, b.team._id)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('coach Register Player: the new player is the team\'s at the meet\'s level; no second ID over another team\'s child', async () => {
    const { coachPlayerService } = build();
    const sgam = await coachWithTeam('Regsgam');
    const maha = await coachWithTeam('Regmaha');
    const district = await meet('district');
    const input = { firstName: 'Riya', lastName: 'Kale', dateOfBirth: new Date(`${thisYear - 11}-05-01T00:00:00Z`), gender: 'Female', guardianConsent: true };

    const { player } = await coachPlayerService.registerPlayer(sgam.coach._id, input, { competitionId: district._id });
    expect(await levelsOf(player._id)).toEqual({ district: String(sgam.team._id) });

    // Another coach finds the same child: shown the match first …
    await expect(coachPlayerService.registerPlayer(maha.coach._id, input, { competitionId: district._id }))
      .rejects.toMatchObject({ details: expect.objectContaining({ reason: 'POSSIBLE_DUPLICATE' }) });
    // … and may not register "a different child" over it at this level.
    await expect(coachPlayerService.registerPlayer(maha.coach._id, { ...input, confirmDuplicate: true }, { competitionId: district._id }))
      .rejects.toMatchObject({ details: expect.objectContaining({ reason: 'TEAM_FINAL_AT_LEVEL' }) });
    expect(await Player.countDocuments({ firstName: 'Riya' })).toBe(1);
  });

  test('roster add never moves a player; roster removal keeps a final team', async () => {
    const { teamService } = build();
    const a = await coachWithTeam('Rosa');
    const b = await coachWithTeam('Rosb');
    const onA = await child({ team: a.team._id, levelTeams: [{ level: 'district', team: a.team._id }] });

    await expect(teamService.addPlayer(b.team._id, onA._id, b.coach._id)).rejects.toBeTruthy();
    await expect(teamService.removePlayer(a.team._id, onA._id, a.coach._id)).rejects.toThrow(/final/);
    expect(String((await Player.findById(onA._id).lean()).team)).toBe(String(a.team._id));
  });

  test('coach roster search shows the team\'s players at the meet\'s level, never another team\'s', async () => {
    const { coachService } = build();
    const sgam = await coachWithTeam('Srcsgam');
    const maha = await coachWithTeam('Srcmaha');
    const district = await meet('district', [sgam]);
    const state = await meet('state', [sgam]);
    // Old team SGAM, but Maha holds them at District.
    const p = await child({ team: sgam.team._id, levelTeams: [{ level: 'district', team: maha.team._id }] });

    const atDistrict = await coachService.searchPlayers(sgam.coach._id, district._id, '');
    const atState = await coachService.searchPlayers(sgam.coach._id, state._id, '');
    expect(atDistrict.map((x) => String(x._id))).not.toContain(String(p._id));
    expect(atState.map((x) => String(x._id))).toContain(String(p._id));
  });
});

describe('migration 014', () => {
  test('one team at a level → set; two teams → a conflict, nothing guessed; re-run is harmless', async () => {
    const a = await coachWithTeam('Miga');
    const b = await coachWithTeam('Migb');
    const single = await child({ team: a.team._id });
    const split = await child({ team: a.team._id });
    const entry = (p) => ({ player: p._id, gender: 'Male', ageGroup: 'Under12' });
    await meet('district', [{ ...a, players: [entry(single), entry(split)] }]);
    await meet('district', [{ ...b, players: [entry(split)] }]);
    await meet('state', [{ ...b, players: [entry(split)] }]);

    await migration014.up();
    await migration014.up();

    expect(await levelsOf(single._id)).toEqual({ district: String(a.team._id) });
    expect(await levelsOf(split._id)).toEqual({ state: String(b.team._id) });
    const conflicts = await PlayerTeamConflict.find({}).lean();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ level: 'district', resolved: false });
    expect(conflicts[0].teams.map((t) => String(t.team)).sort()).toEqual([String(a.team._id), String(b.team._id)].sort());

    await migration014.down();
    expect(await levelsOf(single._id)).toEqual({});
  });
});
