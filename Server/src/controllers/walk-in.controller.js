/**
 * Walk-in desk controller. See services/walk-in/walk-in.service.
 *
 * @module controllers/walk-in.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

/** Who is at the desk — passed to every service call. */
const actorOf = (req) => ({ id: req.user._id, userType: req.userType, user: req.user });

function createWalkInController(container) {
  const service = () => container.resolve('walkInService');
  const ok = (res, data, message, status = 200) => res.status(status).json({ success: true, data, ...(message ? { message } : {}) });

  return {
    listMeets: asyncHandler(async (req, res) => ok(res, await service().listOpenMeets(actorOf(req)))),

    ocrStatus: asyncHandler(async (req, res) => ok(res, await service().ocrStatus())),

    findCoach: asyncHandler(async (req, res) => {
      // ?q= searches name / email / phone / team; ?email= is the exact lookup.
      if (req.query.q !== undefined) return ok(res, { coaches: await service().searchCoaches(req.query.q) });
      return ok(res, { coach: await service().findCoach(req.query.email) });
    }),

    createCoach: asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      ok(res, await service().createCoach(actorOf(req), req.body), 'Coach account created', 201);
    }),

    setDefaultPassword: asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      ok(res, await service().setCoachDefaultPassword(actorOf(req), req.params.coachId, req.body), 'Default player password saved');
    }),

    ensureTeam: asyncHandler(async (req, res) => {
      const data = await service().ensureTeam(actorOf(req), req.params.coachId, req.body);
      ok(res, data, data.created ? 'Team created' : 'The coach already has a team', data.created ? 201 : 200);
    }),

    formPdf: asyncHandler(async (req, res) => {
      const { pdf, name } = await service().formPdf(actorOf(req), req.params.competitionId);
      const file = `walk-in-form-${String(name || 'competition').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.pdf`;
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="${file}"`);
      res.send(pdf);
    }),

    listDrafts: asyncHandler(async (req, res) => ok(res, await service().listDrafts(actorOf(req), req.query.competitionId))),

    openDraft: asyncHandler(async (req, res) => ok(res, await service().openDraft(actorOf(req), req.body), undefined, 201)),

    getDraft: asyncHandler(async (req, res) => ok(res, await service().view(actorOf(req), req.params.draftId))),

    cancelDraft: asyncHandler(async (req, res) => ok(res, await service().cancelDraft(actorOf(req), req.params.draftId), 'Form discarded')),

    scan: asyncHandler(async (req, res) => {
      // Crops are photos of a child's handwriting: never cached anywhere.
      res.set('Cache-Control', 'no-store');
      ok(res, await service().scanPage(actorOf(req), req.params.draftId, req.body, { pageHint: req.query.page }));
    }),

    saveRows: asyncHandler(async (req, res) => ok(res, await service().saveRows(actorOf(req), req.params.draftId, req.body))),

    submit: asyncHandler(async (req, res) => ok(res, await service().submit(actorOf(req), req.params.draftId), 'Players registered and entered')),

    createPaymentOrder: asyncHandler(async (req, res) => ok(res, await service().createPaymentOrder(actorOf(req), req.params.draftId))),

    verifyPayment: asyncHandler(async (req, res) => ok(res, await service().verifyPayment(actorOf(req), req.params.draftId, req.body), 'Payment received')),

    quoteDiscount: asyncHandler(async (req, res) => ok(res, await service().quoteDiscount(actorOf(req), req.params.draftId, req.body.discountCode))),

    redeemDiscount: asyncHandler(async (req, res) => ok(res, await service().redeemDiscount(actorOf(req), req.params.draftId, req.body.discountCode), 'Entry submitted')),

    slip: asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      ok(res, await service().slip(actorOf(req), req.params.draftId));
    }),
  };
}

module.exports = createWalkInController;
