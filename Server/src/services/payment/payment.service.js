const crypto = require('crypto');
const { ValidationError, AuthenticationError } = require('../../errors');

class PaymentService {
  constructor(config, logger, transactionRepository = null) {
    this.config = config;
    this.logger = logger;
    this.transactionRepository = transactionRepository;
  }

  verifySignature(rawBody, signature) {
    const secret = this.config.get('razorpay.keySecret');
    if (!secret) throw new ValidationError('Razorpay secret is not configured');
    if (!signature) throw new AuthenticationError('Missing Razorpay signature');

    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody || '')
      .digest('hex');

    return computed === signature;
  }

  async reconcileWebhook(rawBody, signature, payload) {
    if (!this.verifySignature(rawBody, signature)) {
      throw new AuthenticationError('Invalid Razorpay webhook signature');
    }

    if (this.transactionRepository) {
      await this.transactionRepository.create({
        source: 'razorpay',
        type: payload?.event || 'webhook',
        paymentStatus: 'completed',
        rawPayload: payload,
      });
    }

    this.logger.info('Razorpay webhook reconciled', { event: payload?.event });
    return { processed: true };
  }
}

module.exports = PaymentService;
