/**
 * Payment Controller
 *
 * Handles inbound Razorpay webhook reconciliation.
 * Signature verification and state mutation are fully delegated to PaymentService.
 *
 * @module controllers/payment.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createPaymentController(container) {
  const paymentService = container.resolve('paymentService');
  const logger = container.resolve('logger');

  return {
    /**
     * Reconcile Razorpay webhook.
     * req.rawBody must be set by Express middleware using the `verify` callback
     * so HMAC signature validation works on the raw bytes.
     *
     * @route POST /api/webhooks/razorpay
     */
    reconcileRazorpayWebhook: asyncHandler(async (req, res, next) => {
      try {
        const signature = req.headers['x-razorpay-signature'];
        const result = await paymentService.reconcileWebhook(req.rawBody, signature, req.body);
        
        // Map service return values to HTTP responses
        if (result.message === 'Webhook event ignored' || result.message === 'No matching order found') {
          res.status(200).json({ success: true, message: result.message });
        } else {
          res.status(200).json({ success: true, message: 'Webhook processed successfully.' });
        }
      } catch (error) {
        // AuthenticationError (invalid signature) propagates to error middleware (HTTP 400)
        next(error);
      }
    }),
  };
}

module.exports = createPaymentController;
