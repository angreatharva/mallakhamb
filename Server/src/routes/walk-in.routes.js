/**
 * Walk-in desk routes — /api/desk/*
 *
 * Admin and Super Admin only. An admin's competition scope and the end-date
 * lock are enforced in the service, against the meet the DRAFT belongs to:
 * most of these routes name a draft, not a competition, so the request-level
 * `validateCompetitionContext` / lock guard would be checking whatever meet
 * the admin's token happens to carry instead. See services/walk-in.
 *
 * @module routes/walk-in.routes
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { createUserRateLimitMiddleware } = require('../middleware/security.middleware');
const v = require('../validators/walk-in.validator');

/** A phone photo, already shrunk by the browser; the cap is generous on purpose. */
const IMAGE_LIMIT = '8mb';

function createWalkInRoutes(container) {
  const router = express.Router();
  const auth = createAuthMiddleware(container);
  const controller = container.resolve('walkInController');
  const userRateLimit = createUserRateLimitMiddleware(container);
  const check = (chains) => [...chains, handleValidationErrors];

  router.use(auth, requireAdmin);

  router.get('/meets', controller.listMeets);
  router.get('/ocr/status', controller.ocrStatus);

  router.get('/coaches', check(v.findCoach()), controller.findCoach);
  router.post('/coaches', userRateLimit, check(v.createCoach()), controller.createCoach);
  router.put('/coaches/:coachId/player-default-password', userRateLimit, check(v.setDefaultPassword()), controller.setDefaultPassword);
  router.post('/coaches/:coachId/team', check(v.ensureTeam()), controller.ensureTeam);

  router.get('/forms/:competitionId', check(v.competitionInParam()), controller.formPdf);

  router.get('/drafts', check(v.competitionInQuery()), controller.listDrafts);
  router.post('/drafts', check(v.openDraft()), controller.openDraft);
  router.get('/drafts/:draftId', check(v.draftId()), controller.getDraft);
  router.delete('/drafts/:draftId', check(v.draftId()), controller.cancelDraft);
  router.post(
    '/drafts/:draftId/scan',
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: IMAGE_LIMIT }),
    check(v.scan()),
    controller.scan
  );
  router.put('/drafts/:draftId/rows', check(v.saveRows()), controller.saveRows);
  router.post('/drafts/:draftId/submit', check(v.draftId()), controller.submit);

  router.post('/drafts/:draftId/payment/order', check(v.draftId()), controller.createPaymentOrder);
  router.post('/drafts/:draftId/payment/verify', check(v.verifyPayment()), controller.verifyPayment);
  // The discount code is a shared secret worth a team's fee: rate limited per
  // user, exactly as on the coach's own routes.
  router.post('/drafts/:draftId/payment/discount/quote', userRateLimit, check(v.discount()), controller.quoteDiscount);
  router.post('/drafts/:draftId/payment/discount', userRateLimit, check(v.discount()), controller.redeemDiscount);

  router.get('/drafts/:draftId/slip', check(v.draftId()), controller.slip);

  return router;
}

module.exports = createWalkInRoutes;
