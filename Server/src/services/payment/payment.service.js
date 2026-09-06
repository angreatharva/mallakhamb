const crypto = require('crypto');
const { ValidationError, AuthenticationError } = require('../../errors');

class PaymentService {
  constructor(config, logger, transactionRepository = null, competitionRepository = null) {
    this.config = config;
    this.logger = logger;
    this.transactionRepository = transactionRepository;
    this.competitionRepository = competitionRepository;
  }

  verifySignature(rawBody, signature) {
    const secret = this.config.get('razorpay.keySecret');
    if (!secret) throw new ValidationError('Razorpay secret is not configured');
    if (!signature) throw new AuthenticationError('Missing Razorpay signature');

    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody || '')
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const computedBuffer = Buffer.from(computed);
    const signatureBuffer = Buffer.from(signature);
    
    // Guard against length mismatch to avoid timingSafeEqual throwing
    if (computedBuffer.length !== signatureBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
  }

  async reconcileWebhook(rawBody, signature, payload) {
    if (!this.verifySignature(rawBody, signature)) {
      throw new AuthenticationError('Invalid Razorpay webhook signature');
    }

    // Extract event and order_id from payload
    const event = payload?.event;
    const orderId = payload?.payload?.payment?.entity?.order_id;

    // Only handle payment.captured and payment.failed events
    if (event !== 'payment.captured' && event !== 'payment.failed') {
      this.logger.info('Webhook event ignored', { event });
      return { processed: false, message: 'Webhook event ignored' };
    }

    if (!orderId) {
      this.logger.warn('Webhook carried no order id', { event });
      return { processed: false, message: 'No matching order found' };
    }

    if (!this.competitionRepository) {
      this.logger.error('Competition repository not available for webhook processing');
      return { processed: false, message: 'No matching order found' };
    }

    const paymentEntity = payload?.payload?.payment?.entity || {};

    /*
     * Razorpay reports `amount` in PAISE. The registration's `paymentAmount`
     * and the Transaction's `amount` are both recorded in RUPEES everywhere
     * else — coach.service divides by 100 on the verify-and-submit path — so
     * this converts rather than storing a figure a hundred times too large
     * next to correct ones.
     */
    const amountInRupees = Number.isFinite(Number(paymentEntity.amount))
      ? Number(paymentEntity.amount) / 100
      : undefined;

    const paymentStatus = event === 'payment.captured' ? 'completed' : 'failed';

    const registrationFields = paymentStatus === 'completed'
      ? {
        paymentStatus,
        paymentGateway: 'razorpay',
        paymentId: paymentEntity.id,
        paymentVerifiedAt: new Date(),
        ...(amountInRupees !== undefined && { paymentAmount: amountInRupees }),
      }
      : { paymentStatus };

    /*
     * One atomic update, targeted by order id.
     *
     * This used to load every active competition, scan `registeredTeams` in
     * JavaScript, mutate the match and call `competition.save()` — on a `.lean()`
     * object, so it was a TypeError and this endpoint answered 500 to every
     * webhook Razorpay ever sent. See the repository method for the rest.
     */
    const match = await this.competitionRepository.applyPaymentWebhookResult(
      orderId,
      registrationFields
    );

    if (!match) {
      this.logger.info('No matching order found for webhook', { orderId, event });
      return { processed: false, message: 'No matching order found' };
    }

    /*
     * The Transaction record.
     *
     * Previously `{ source: 'razorpay', type: payload.event, rawPayload }` —
     * `source` is an enum of ['coach','superadmin'], `type` an enum of
     * ['team_submission','player_add','other'], `competition` is required and
     * `rawPayload` is not a path on the schema. Every field was wrong, so even
     * with the save() bug fixed this would have thrown a ValidationError.
     *
     * A webhook reconciles a coach's team-submission payment, which is what the
     * enums already have names for; the raw event goes in `metadata`, which is
     * the schema's open field.
     */
    if (this.transactionRepository) {
      try {
        await this.transactionRepository.create({
          source: 'coach',
          type: 'team_submission',
          competition: match.competitionId,
          team: match.team,
          coach: match.coach,
          amount: amountInRupees,
          paymentStatus,
          description: `Razorpay ${event} reconciled from webhook`,
          metadata: {
            razorpay_event: event,
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentEntity.id,
            reconciledAt: new Date(),
          },
        });
      } catch (error) {
        /*
         * The registration is already updated, and that is the part that
         * matters. Throwing here would answer 5xx and make Razorpay redeliver
         * an event that has in fact been applied.
         */
        this.logger.error('Failed to record webhook transaction', {
          orderId,
          event,
          error: error.message,
        });
      }
    }

    this.logger.info('Razorpay webhook reconciled', {
      event,
      orderId,
      competitionId: String(match.competitionId),
      paymentStatus,
    });
    return { processed: true };
  }
}

module.exports = PaymentService;
