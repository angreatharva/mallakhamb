const express = require('express');
const { body, param, query, oneOf } = require('express-validator');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const accountValidators = require('../validators/account.validator');
const performanceOrderValidator = require('../validators/performance-order.validator');
const tieBreakDrawValidator = require('../validators/tie-break-draw.validator');
const playerTeamValidator = require('../validators/player-team-admin.validator');

function createSuperAdminRoutes(container) {
  const router = express.Router();
  const auth = createAuthMiddleware(container);
  const controller = container.resolve('superAdminController');

  router.post('/login', controller.loginSuperAdmin);

  router.use(auth, requireSuperAdmin);
  router.post('/players/payment/create', controller.createPlayerPaymentOrder);
  router.post('/players/payment/verify', controller.verifyPlayerPaymentAndAdd);
  router.post('/players/add', controller.addPlayer);
  router.get('/admins', controller.getAllAdmins);
  router.post('/admins', controller.createAdmin);
  router.put('/admins/:adminId', controller.updateAdmin);
  router.delete('/admins/:adminId', controller.deleteAdmin);
  router.get('/coaches', controller.getAllCoaches);
  router.put('/coaches/:coachId/status', controller.updateCoachStatus);
  router.get('/teams', controller.getAllTeams);
  router.get('/teams/submitted', container.resolve('adminController').getSubmittedTeams);
  router.get('/teams/:teamId', controller.getTeamDetails);
  router.delete('/teams/:teamId', controller.deleteTeam);
  router.delete('/judges/:judgeId', controller.deleteJudge);
  router.post('/competitions', controller.createCompetition);
  router.get('/competitions', controller.getAllCompetitions);
  router.get('/competitions/:id', controller.getCompetitionById);
  router.put('/competitions/:id', controller.updateCompetition);
  router.delete('/competitions/:id', controller.deleteCompetition);
  router.post('/competitions/:id/admins', controller.assignAdminToCompetition);
  router.delete('/competitions/:id/admins/:adminId', controller.removeAdminFromCompetition);
  router.get('/stats', controller.getSystemStats);
  router.get('/dashboard', controller.getSuperAdminDashboard);
  router.get('/transactions', controller.getTransactions);
  
  // Score and ranking routes (reuse admin controller methods)
  const adminController = container.resolve('adminController');
  router.get('/submitted-teams', adminController.getSubmittedTeams);
  router.get('/scores/team', adminController.getTeamScores);
  router.get('/scores/individual', adminController.getIndividualScores);
  router.get('/scores/team-rankings', adminController.getTeamRankings);
  router.post('/scores/save', adminController.saveScores);
  router.put('/scores/:scoreId/unlock', adminController.unlockScores);
  router.put('/scores/:scoreId/lock', adminController.lockScores);
  router.post('/scores/recalculate', adminController.recalculateScores);
  router.get('/judges/summary', adminController.getAllJudgesSummary);
  router.post('/competition/age-group/start', adminController.startAgeGroup);
  router.post('/age-groups/start', adminController.startAgeGroup);
  
  // Running order / lot draw. Same handlers as /api/admin; the whole router is
  // already behind `auth, requireSuperAdmin` (line 12), so no extra guard is
  // needed here. Unlike the admin router these have no
  // `validateCompetitionContext` — a superadmin is not scoped to one
  // competition and sends `competitionId` explicitly.
  const performanceOrderController = container.resolve('performanceOrderController');
  router.get('/lots', performanceOrderValidator.getOrder(), handleValidationErrors, performanceOrderController.getOrder);
  router.post('/lots/draw', performanceOrderValidator.drawLots(), handleValidationErrors, performanceOrderController.drawLots);
  router.put('/lots/teams', performanceOrderValidator.setTeamOrder(), handleValidationErrors, performanceOrderController.setTeamOrder);
  router.put('/lots/players', performanceOrderValidator.setPlayerOrder(), handleValidationErrors, performanceOrderController.setPlayerOrder);

  // Lucky draw (COP 1.12.4). Same handlers as /api/admin; competitionId is sent explicitly.
  // Finals (Competition II / III qualifiers) of the meet named by competitionId
  // (a superadmin is not scoped to one meet). Same handlers as /api/admin.
  const finals = (name) => (req, res, next) => container.resolve('qualificationController')[name](req, res, next);
  const meetOf = (req, res, next) => { req.competitionId = req.query.competitionId || req.body?.competitionId; next(); };
  const meetRule = oneOf([query('competitionId').isMongoId(), body('competitionId').isMongoId()], { message: 'competitionId is required' });
  router.get('/finals', meetRule, handleValidationErrors, meetOf, finals('list'));
  router.post('/finals/recompute', meetRule, handleValidationErrors, meetOf, finals('recompute'));
  router.post('/finals/:finalId/withdraw', meetRule, param('finalId').isMongoId(), body('playerId').isMongoId(), handleValidationErrors, meetOf, finals('withdraw'));
  router.post('/finals/:finalId/reinstate', meetRule, param('finalId').isMongoId(), body('playerId').isMongoId(), handleValidationErrors, meetOf, finals('reinstate'));
  router.post('/finals/:finalId/draw', meetRule, param('finalId').isMongoId(), body('order').isArray({ min: 2, max: 20 }), handleValidationErrors, meetOf, finals('draw'));

  // "Player teams": a player's team at each level — look, correct, audit
  // (docs/team-per-level-plan.md step 3).
  const playerTeams = container.resolve('playerTeamAdminController');
  const v = (chains) => [...chains, handleValidationErrors];
  router.get('/player-teams/players', v(playerTeamValidator.search()), playerTeams.search);
  router.get('/player-teams/players/:playerId', v(playerTeamValidator.player()), playerTeams.detail);
  router.post('/player-teams/players/:playerId/correct', v(playerTeamValidator.correct()), playerTeams.correct);
  router.post('/player-teams/players/:playerId/remove-entries', v(playerTeamValidator.removeEntries()), playerTeams.removeEntries);
  router.get('/player-teams/conflicts', playerTeams.listConflicts);
  router.post('/player-teams/conflicts/:conflictId/resolve', v(playerTeamValidator.resolveConflict()), playerTeams.resolveConflict);
  router.get('/player-teams/history', v(playerTeamValidator.history()), playerTeams.history);

  const tieBreakDrawController = container.resolve('tieBreakDrawController');
  router.post('/tie-break/draws', tieBreakDrawValidator.recordDraw(), handleValidationErrors, tieBreakDrawController.recordDraw);
  router.delete('/tie-break/draws', tieBreakDrawValidator.clearDraw(), handleValidationErrors, tieBreakDrawController.clearDraw);

  // Judge management routes (reuse admin controller methods)
  router.get('/judge-accounts', adminController.searchJudgeAccounts);
  router.get('/judges', adminController.getJudges);
  router.post('/judges', adminController.createSingleJudge);
  router.put('/judges/:judgeId', adminController.updateJudge);
  router.post('/judges/bulk', adminController.saveJudges);

  // Every open request from a player with no email: the fallback for a player
  // on no team, or a coach who cannot be reached.
  // Resolved per request: harnesses that build this router without the
  // account-request pieces need not register them.
  const requests = ['list', 'approve', 'reject'].reduce((handlers, name) => ({
    ...handlers,
    [name]: (req, res, next) => container.resolve('accountRequestController').superAdmin[name](req, res, next),
  }), {});
  router.get('/account-requests', requests.list);
  router.post('/account-requests/:requestId/approve', accountValidators.decideRequest(), handleValidationErrors, requests.approve);
  router.post('/account-requests/:requestId/reject', accountValidators.decideRequest(), handleValidationErrors, requests.reject);

  return router;
}

module.exports = createSuperAdminRoutes;
