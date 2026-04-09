const crypto = require('crypto');
const Competition = require('../models/Competition');

const verifyWebhookSignature = (rawBody, signature) => {
  if (!rawBody || !signature || !process.env.RAZORPAY_WEBHOOK_SECRET) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
};

const reconcileRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const isValidSignature = verifyWebhookSignature(req.rawBody, signature);

    if (!isValidSignature) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const event = req.body?.event;
    const paymentEntity = req.body?.payload?.payment?.entity;

    if (!event || !paymentEntity?.order_id) {
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    if (event !== 'payment.captured' && event !== 'payment.failed') {
      return res.status(200).json({ message: 'Webhook event ignored' });
    }

    const competition = await Competition.findOne({
      'registeredTeams.paymentOrderId': paymentEntity.order_id,
    });

    if (!competition) {
      return res.status(200).json({ message: 'No matching order found' });
    }

    const registeredTeam = competition.registeredTeams.find(
      (rt) => rt.paymentOrderId === paymentEntity.order_id
    );

    if (!registeredTeam) {
      return res.status(200).json({ message: 'No matching team found for order' });
    }

    registeredTeam.paymentGateway = 'razorpay';
    registeredTeam.paymentId = paymentEntity.id || registeredTeam.paymentId;
    registeredTeam.paymentVerifiedAt = new Date();

    if (event === 'payment.failed') {
      registeredTeam.paymentStatus = 'failed';
    } else if (event === 'payment.captured' && !registeredTeam.isSubmitted) {
      // Reconciliation: mark capture even if synchronous verify route missed.
      registeredTeam.paymentStatus = 'completed';
      registeredTeam.paymentAmount = Number((paymentEntity.amount || 0) / 100);
    }

    await competition.save();
    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Razorpay webhook reconciliation error:', error);
    return res.status(500).json({ message: 'Webhook processing failed' });
  }
};

module.exports = {
  reconcileRazorpayWebhook,
};
