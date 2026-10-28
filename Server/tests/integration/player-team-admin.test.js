/**
 * Super Admin "Player teams" (docs/team-per-level-plan.md step 3): look at,
 * correct and audit a player's team at each competition level.
 */

const mongoose = require('mongoose');
const PlayerTeamAdminService = require('../../src/services/team/player-team-admin.service');
const PlayerRepository = require('../../src/repositories/player.repository');
const TeamRepository = require('../../src/repositories/team.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const AuditLogRepository = require('../../src/repositories/audit-log.repository');
const PlayerTeamConflictRepository = require('../../src/repositories/player-team-conflict.repository');
const Competition = require('../../src/models/Competition');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const Player = require('../../src/models/Player');
const PlayerTeamConflict = require('../../src/models/PlayerTeamConflict');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const year = new Date().getUTCFullYear();
const actor = { id: new mongoose.Types.ObjectId(), userType: 'superadmin' };

const build = () => new PlayerTeamAdminService({
  playerRepository: new PlayerRepository(noopLogger),
  teamRepository: new TeamRepository(noopLogger),
  competitionRepository: new CompetitionRepository(noopLogger),
  auditLogRepository: new AuditLogRepository(noopLogger),
  playerTeamConflictRepository: new PlayerTeamConflictRepository(noopLogger),
  logger: noopLogger,
});

let n = 0;
async function team(name) {
  n += 1;
  const coach = await Coach.create({ firstName: name, lastName: 'Coach', email: `c${n}.${Math.random()}@example.com`, phone: '9100000001', password: 'CoachPass1' });
  return Team.create({ name, coach: coach._id });
}

async function meet(level, { ended = false, entries = [] } = {}) {
  const start = ended ? new Date(`${year - 1}-01-10T00:00:00Z`) : new Date(`${year + 1}-01-20T00:00:00Z`);
  const end = ended ? new Date(`${year - 1}-01-12T00:00:00Z`) : new Date(`${year + 1}-01-22T00:00:00Z`);
  return Competition.create({
    name: `${level} ${ended ? 'past' : 'open'} ${Math.random()}`, level, place: 'Pune', year,
    startDate: start, endDate: end, playerFee: 300, competitionTypes: ['competition_1'],
    ageGroups: [{ gender: 'Male', ageGroup: 'Under14' }],
    registeredTeams: entries.map(({ team: t, player }) => ({
      team: t._id, coach: t.coach, isActive: true, players: [{ player: player._id, gender: 'Male', ageGroup: 'Under14' }],
    })),
  });
}

const child = (overrides = {}) => Player.create({
  firstName: 'Aarav', lastName: 'Patil', gender: 'Male', dateOfBirth: new Date(`${year - 13}-03-14T00:00:00Z`),
  emailType: 'self', email: `p${Math.random()}@example.com`, phone: '9100000002', password: 'PlayerPass1', ...overrides,
});

describe('Super Admin player teams', () => {
  test('search and detail show the team at every level, entries and age issues', async () => {
    const service = build();
    const sgam = await team('SGAM');
    const p = await child({ team: sgam._id, levelTeams: [{ level: 'district', team: sgam._id, setByType: 'coach', via: 'squad-entry' }] });
    await meet('district', { entries: [{ team: sgam, player: p }] });

    const [found] = await service.search('aarav pat');
    expect(found.levels.find((l) => l.level === 'district')).toMatchObject({ team: { name: 'SGAM' }, via: 'squad-entry' });
    expect(found.levels.find((l) => l.level === 'state').team).toBeNull();

    const detail = await service.detail(p._id);
    expect(detail.entries).toEqual([expect.objectContaining({ team: expect.objectContaining({ name: 'SGAM' }), heldAtLevel: true, ageIssue: null })]);
  });

  test('a correction is refused while entered for the old team in an open meet; remove first, then correct', async () => {
    const service = build();
    const wrong = await team('Wrong Club');
    const right = await team('Right Club');
    const p = await child({ team: wrong._id, levelTeams: [{ level: 'district', team: wrong._id }] });
    const open = await meet('district', { entries: [{ team: wrong, player: p }] });
    await meet('district', { ended: true, entries: [{ team: wrong, player: p }] }); // history stays

    await expect(service.correct(actor, p._id, { level: 'district', teamId: right._id, reason: 'Paper form misread' }))
      .rejects.toMatchObject({ details: expect.objectContaining({ reason: 'ENTERED_FOR_OLD_TEAM' }) });

    const { removed } = await service.removeEntries(actor, p._id, { level: 'district' });
    expect(removed.map((r) => String(r._id))).toEqual([String(open._id)]);

    const after = await service.correct(actor, p._id, { level: 'district', teamId: right._id, reason: 'Paper form misread' });
    expect(after.levels.find((l) => l.level === 'district')).toMatchObject({ team: { name: 'Right Club' }, via: 'superadmin-correction' });
    expect(after.oldTeam.name).toBe('Right Club');

    const { rows } = await service.history({ playerId: p._id });
    expect(rows.map((r) => r.action)).toEqual(['PLAYER_TEAM_CORRECTED', 'PLAYER_TEAM_ENTRIES_REMOVED']);
    expect(rows[0]).toMatchObject({ from: 'Wrong Club', to: 'Right Club', reason: 'Paper form misread', level: 'district' });
  });

  test('a migration conflict is listed and settled with one of its teams', async () => {
    const service = build();
    const a = await team('Team A');
    const b = await team('Team B');
    const p = await child({ team: a._id });
    const conflict = await PlayerTeamConflict.create({ player: p._id, level: 'district', teams: [{ team: a._id }, { team: b._id }] });

    const [listed] = await service.listConflicts();
    expect(listed).toMatchObject({ level: 'district', player: { name: 'Aarav Patil' } });
    expect(listed.teams.map((t) => t.name).sort()).toEqual(['Team A', 'Team B']);

    const other = await team('Team C');
    await expect(service.resolveConflict(actor, conflict._id, { teamId: other._id })).rejects.toBeTruthy();
    await service.resolveConflict(actor, conflict._id, { teamId: b._id });
    expect((await Player.findById(p._id).lean()).levelTeams).toEqual([expect.objectContaining({ level: 'district', team: b._id, via: 'conflict-resolved' })]);
    expect(await service.listConflicts()).toEqual([]);
  });
});
