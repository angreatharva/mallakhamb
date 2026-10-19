/**
 * Account Request Controller — the coach's and the super admin's side of
 * approving resets and email additions for players with no email, and the
 * player's "I have a code from my coach" reset.
 *
 * @module controllers/account-request.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createAccountRequestController(container) {
  const service = () => container.resolve('accountRequestService');

  /** Who is deciding: a coach, or a super admin (an Admin account with that role). */
  const approverOf = (req, userType) => ({ userId: req.user._id, userType });

  const decide = (userType) => ({
    list: asyncHandler(async (req, res) => {
      const data = userType === 'coach'
        ? await service().listForCoach(req.user._id)
        : await service().listForSuperAdmin();
      res.json({ success: true, data });
    }),

    approve: asyncHandler(async (req, res) => {
      const data = await service().approve(req.params.requestId, approverOf(req, userType));
      res.json({
        success: true,
        data,
        message: data.code
          ? 'Approved. Give this code to the player — it is shown only once.'
          : 'Approved. The email has been added.',
      });
    }),

    reject: asyncHandler(async (req, res) => {
      const data = await service().reject(req.params.requestId, approverOf(req, userType));
      res.json({ success: true, data, message: 'Request turned down.' });
    }),
  });

  return {
    coach: decide('coach'),
    superAdmin: decide('superadmin'),

    /** @route POST /api/auth/reset-password-coach */
    completePasswordReset: asyncHandler(async (req, res) => {
      const { identifier, code, password } = req.body;
      await service().completePasswordReset(identifier, code, password);
      res.json({ success: true, message: 'Password reset. You can now sign in with your Player ID.' });
    }),
  };
}

module.exports = createAccountRequestController;
