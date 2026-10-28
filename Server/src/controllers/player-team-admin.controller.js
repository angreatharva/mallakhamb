/**
 * Super Admin "Player teams" controller. See services/team/player-team-admin.
 *
 * @module controllers/player-team-admin.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

const actorOf = (req) => ({ id: req.user._id, userType: req.userType });

function createPlayerTeamAdminController(container) {
  const service = () => container.resolve('playerTeamAdminService');
  const ok = (res, data, message) => res.json({ success: true, data, ...(message ? { message } : {}) });

  return {
    search: asyncHandler(async (req, res) => ok(res, { players: await service().search(req.query.q) })),
    detail: asyncHandler(async (req, res) => ok(res, await service().detail(req.params.playerId))),
    correct: asyncHandler(async (req, res) => ok(res, await service().correct(actorOf(req), req.params.playerId, req.body), 'Team corrected')),
    removeEntries: asyncHandler(async (req, res) => ok(res, await service().removeEntries(actorOf(req), req.params.playerId, req.body), 'Removed from those squads')),
    listConflicts: asyncHandler(async (req, res) => ok(res, { conflicts: await service().listConflicts() })),
    resolveConflict: asyncHandler(async (req, res) => ok(res, await service().resolveConflict(actorOf(req), req.params.conflictId, req.body), 'Conflict resolved')),
    history: asyncHandler(async (req, res) => ok(res, await service().history({
      level: req.query.level, teamId: req.query.teamId, playerId: req.query.playerId, page: req.query.page,
    }))),
  };
}

module.exports = createPlayerTeamAdminController;
