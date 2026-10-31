/**
 * The owner's correction tools (docs/superadmin-control-plan.md, Phases 2–6),
 * mounted inside the Super Admin router, so every route here is already
 * behind `auth, requireSuperAdmin`. None of them is guarded by the
 * competition end-date lock: correcting a finished meet is the point (D2).
 *
 * Every write takes a `reason` and is recorded by CorrectionService.
 *
 * @module routes/superadmin-corrections.routes
 */

const { param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation.middleware');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Resolve a service per request, so harnesses need not register every piece. */
const svc = (container, name) => () => container.resolve(name);

const actorOf = (req) => ({ id: String(req.user._id), name: req.user.name || null });
const id = (name) => [param(name).isMongoId().withMessage(`Invalid ${name}`), handleValidationErrors];

function mountCorrectionRoutes(router, container) {
  const superAdmin = svc(container, 'superAdminService');
  const accounts = svc(container, 'accountsAdminService');
  /*
   * Services register their undo handlers when they are built, and singletons
   * are built on first use. History must know every handler even right after
   * a restart, so resolving it resolves the services that own them first.
   */
  const UNDO_OWNERS = ['superAdminService', 'accountsAdminService', 'teamAdminService'];
  const corrections = () => {
    for (const name of UNDO_OWNERS) {
      try { container.resolve(name); } catch { /* not registered in this harness */ }
    }
    return container.resolve('correctionService');
  };

  // ── Phase 2: History ────────────────────────────────────────────────────
  router.get('/history', asyncHandler(async (req, res) => {
    res.json({ success: true, data: await corrections().list(req.query) });
  }));
  router.post('/history/:logId/undo', id('logId'), asyncHandler(async (req, res) => {
    await corrections().undo(actorOf(req), req.params.logId, req.body?.reason);
    res.json({ success: true, message: 'Change undone.' });
  }));

  // Deleted competitions can be brought back.
  router.get('/competitions-deleted', asyncHandler(async (req, res) => {
    res.json({ success: true, data: await superAdmin().getDeletedCompetitions() });
  }));
  router.post('/competitions/:id/restore', id('id'), asyncHandler(async (req, res) => {
    const competition = await superAdmin().restoreCompetition(req.params.id, String(req.user._id), req.body?.reason);
    res.json({ success: true, data: competition, message: 'Competition restored.' });
  }));

  // ── Phase 3: accounts ───────────────────────────────────────────────────
  const typed = [param('type').isIn(['player', 'coach', 'judge', 'admin']).withMessage('Unknown account type'), param('accountId').isMongoId().withMessage('Invalid account id'), handleValidationErrors];
  router.get('/accounts', asyncHandler(async (req, res) => {
    res.json({ success: true, data: await accounts().search(req.query) });
  }));
  router.get('/accounts/:type/:accountId', typed, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await accounts().get(req.params.type, req.params.accountId) });
  }));
  router.put('/accounts/:type/:accountId', typed, asyncHandler(async (req, res) => {
    const data = await accounts().update(actorOf(req), req.params.type, req.params.accountId, req.body || {});
    res.json({ success: true, data, message: 'Saved.' });
  }));
  router.post('/accounts/:type/:accountId/reset-password', typed, asyncHandler(async (req, res) => {
    const data = await accounts().resetPassword(actorOf(req), req.params.type, req.params.accountId, req.body || {});
    res.json({ success: true, data, message: 'Temporary password set.' });
  }));
  router.post('/accounts/:type/:accountId/sign-out', typed, asyncHandler(async (req, res) => {
    const data = await accounts().signOutEverywhere(actorOf(req), req.params.type, req.params.accountId, req.body || {});
    res.json({ success: true, data, message: 'Signed out everywhere.' });
  }));
  router.post('/accounts/:type/:accountId/active', typed, asyncHandler(async (req, res) => {
    const data = await accounts().setActive(actorOf(req), req.params.type, req.params.accountId, req.body || {});
    res.json({ success: true, data });
  }));

  // ── Phase 4: teams, coaches, transfers ──────────────────────────────────
  const teams = svc(container, 'teamAdminService');
  const teamId = id('teamId');
  router.get('/fix/teams', asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().search(req.query) });
  }));
  router.get('/fix/teams/:teamId', teamId, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().detail(req.params.teamId) });
  }));
  router.put('/fix/teams/:teamId', teamId, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().update(actorOf(req), req.params.teamId, req.body || {}) });
  }));
  router.post('/fix/teams/:teamId/delete', teamId, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().setDeleted(actorOf(req), req.params.teamId, { ...req.body, deleted: true }) });
  }));
  router.post('/fix/teams/:teamId/restore', teamId, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().setDeleted(actorOf(req), req.params.teamId, { ...req.body, deleted: false }) });
  }));
  router.post('/fix/teams/:teamId/change-coach', teamId, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().changeCoach(actorOf(req), req.params.teamId, req.body || {}), message: 'Coach changed.' });
  }));
  router.post('/fix/teams/:teamId/co-coaches/:coachId/remove', teamId, id('coachId'), asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().removeCoCoach(actorOf(req), req.params.teamId, req.params.coachId, req.body || {}) });
  }));
  router.get('/fix/transfer/preview', asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().previewTransfer(req.query) });
  }));
  router.post('/fix/transfer', asyncHandler(async (req, res) => {
    res.json({ success: true, data: await teams().transfer(actorOf(req), req.body || {}), message: 'Player moved.' });
  }));

  // ── Phase 5: scores ─────────────────────────────────────────────────────
  const scores = svc(container, 'scoreCorrectionService');
  router.get('/fix/scores', asyncHandler(async (req, res) => {
    res.json({ success: true, data: await scores().list(req.query) });
  }));
  router.post('/fix/scores/:scoreId/rows/:rowId', id('scoreId'), id('rowId'), asyncHandler(async (req, res) => {
    res.json({ success: true, data: await scores().correct(actorOf(req), req.params.scoreId, req.params.rowId, req.body || {}), message: 'Score corrected.' });
  }));

  // ── Phase 6: entries and manual payments ────────────────────────────────
  const entries = svc(container, 'entriesAdminService');
  const meetTeam = [...id('competitionId'), ...id('teamId')];
  router.get('/fix/entries/:competitionId', id('competitionId'), asyncHandler(async (req, res) => {
    res.json({ success: true, data: await entries().teams(req.params.competitionId) });
  }));
  router.get('/fix/entries/:competitionId/:teamId', meetTeam, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await entries().entry(req.params.competitionId, req.params.teamId) });
  }));
  router.post('/fix/entries/:competitionId/:teamId/players', meetTeam, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await entries().addPlayer(actorOf(req), req.params.competitionId, req.params.teamId, req.body || {}) });
  }));
  router.put('/fix/entries/:competitionId/:teamId/players/:playerId', meetTeam, id('playerId'), asyncHandler(async (req, res) => {
    res.json({ success: true, data: await entries().updatePlayer(actorOf(req), req.params.competitionId, req.params.teamId, req.params.playerId, req.body || {}) });
  }));
  router.post('/fix/entries/:competitionId/:teamId/players/:playerId/remove', meetTeam, id('playerId'), asyncHandler(async (req, res) => {
    res.json({ success: true, data: await entries().removePlayer(actorOf(req), req.params.competitionId, req.params.teamId, req.params.playerId, req.body || {}) });
  }));
  router.post('/fix/entries/:competitionId/:teamId/status', meetTeam, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await entries().setStatus(actorOf(req), req.params.competitionId, req.params.teamId, req.body || {}) });
  }));
  router.post('/fix/entries/:competitionId/:teamId/money', meetTeam, asyncHandler(async (req, res) => {
    res.json({ success: true, data: await entries().recordMoney(actorOf(req), req.params.competitionId, req.params.teamId, req.body || {}) });
  }));

  return router;
}

module.exports = mountCorrectionRoutes;
module.exports.asyncHandler = asyncHandler;
module.exports.actorOf = actorOf;
module.exports.id = id;
