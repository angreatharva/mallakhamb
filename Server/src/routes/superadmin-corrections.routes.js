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
  const corrections = svc(container, 'correctionService');
  const superAdmin = svc(container, 'superAdminService');

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

  return router;
}

module.exports = mountCorrectionRoutes;
module.exports.asyncHandler = asyncHandler;
module.exports.actorOf = actorOf;
module.exports.id = id;
