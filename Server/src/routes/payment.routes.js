const express = require('express');

function createPaymentRoutes(container) {
  const router = express.Router();
  const paymentController = container.resolve('paymentController');
  router.post('/razorpay', paymentController.reconcileRazorpayWebhook);
  return router;
}

module.exports = createPaymentRoutes;
