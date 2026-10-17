const crypto = require('crypto');
const { ValidationError, AuthenticationError } = require('../../errors');
const { noopMetrics } = require('../../infrastructure/prometheus/registry');

class PaymentService {
  constructor(config, logger, transactionRepository = null, competitionRepository = null, metrics = noopMetrics) {
    this.config = config;
    this.logger = logger;
    this.transactionRepository = transactionRepository;
    this.competitionRepository = competitionRepository;
    this.metrics = metrics || noopMetrics;
  }

  /**
   * Check a webhook's X-Razorpay-Signature.
   *
   * Razorpay signs webhook bodies with the secret entered in its dashboard
   * (Settings → Webhooks), which is NOT the API key secret — that one signs the
   * checkout callback (razorpay.gateway.js verifyPaymentSignature). This used
   * to read only the key secret, so webhooks verified only if someone had typed
   * the key secret into the webhook form (deploy/COMMON.md F4).
   *
   * RAZORPAY_WEBHOOK_SECRET is used when set. Unset, the key secret still
   * works as before, with a one-time warning, so an existing deployment keeps
   * reconciling until the webhook secret is configured.
   */
  verifySignature(rawBody, signature) {
    const webhookSecret = this.config.get('razorpay.webhookSecret');
    let secret = webhookSecret;
    if (!secret) {
      secret = this.config.get('razorpay.keySecret');
      if (secret && !this.warnedKeySecretFallback) {
        this.warnedKeySecretFallback = true;
        this.logger.warn('RAZORPAY_WEBHOOK_SECRET is not set: verifying webhooks with the key secret. Set the webhook secret from Razorpay → Webhooks.');
      }
    }
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

  /**
   * Apply a Razorpay webhook, counting every delivery by outcome for
   * mallakhamb_payment_webhooks_total:
   *   processed          — a registration was updated
   *   ignored            — a valid delivery with nothing to apply (unhandled
   *                        event, or no matching order)
   *   rejected_signature — missing or wrong signature
   *   error              — anything else, including a missing webhook secret
   */
  async reconcileWebhook(rawBody, signature, payload) {
    try {
      const result = await this.applyWebhook(rawBody, signature, payload);
      this.metrics.business.paymentWebhook(payload?.event, result?.processed ? 'processed' : 'ignored');
      return result;
    } catch (error) {
      this.metrics.business.paymentWebhook(
        payload?.event,
        error instanceof AuthenticationError ? 'rejected_signature' : 'error'
      );
      throw error;
    }
  }

  async applyWebhook(rawBody, signature, payload) {
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
         * Razorpay redelivers a webhook until it gets a 200, and this handler
         * has no delivery-id tracking of its own — the registration write
         * above is a `$set` and idempotent by nature, but without the unique
         * index on `metadata.razorpay_payment_id` (Transaction.js) a retry
         * would insert a second row for the same payment. Code 11000 here
         * means exactly that: this payment was already recorded, so treat it
         * as success rather than a failure.
         */
        if (error.code === 11000) {
          this.logger.info('Webhook transaction already recorded, skipping duplicate', {
            orderId,
            event,
            paymentId: paymentEntity.id,
          });
        } else {
          /*
           * Any other failure: the registration is already updated, and that
           * is the part that matters. Throwing here would answer 5xx and make
           * Razorpay redeliver an event that has in fact been applied.
           */
          this.logger.error('Failed to record webhook transaction', {
            orderId,
            event,
            error: error.message,
          });
        }
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
