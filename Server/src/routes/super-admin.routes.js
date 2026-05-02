const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../middleware/auth.middleware');

function createSuperAdminRoutes(container) {
  const router = express.Router();
  const auth = createAuthMiddleware(container);
  const controller = container.resolve('superAdminController');

  router.post('/login', controller.loginSuperAdmin);

  router.use(auth, requireSuperAdmin);
  router.post('/players/add', controller.addPlayer);
  router.get('/admins', controller.getAllAdmins);
  router.post('/admins', controller.createAdmin);
  router.put('/admins/:adminId', controller.updateAdmin);
  router.delete('/admins/:adminId', controller.deleteAdmin);
  router.get('/coaches', controller.getAllCoaches);
  router.put('/coaches/:coachId/status', controller.updateCoachStatus);
  router.get('/teams', controller.getAllTeams);
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
  router.get('/scores/individual', adminController.getIndividualScores);
  router.get('/scores/team-rankings', adminController.getTeamRankings);
  router.get('/judges/summary', adminController.getAllJudgesSummary);
  router.post('/competition/age-group/start', adminController.startAgeGroup);
  
  // Judge management routes (reuse admin controller methods)
  router.get('/judges', adminController.getJudges);
  router.post('/judges', adminController.createSingleJudge);
  router.put('/judges/:judgeId', adminController.updateJudge);
  router.post('/judges/bulk', adminController.saveJudges);

  return router;
}

module.exports = createSuperAdminRoutes;
