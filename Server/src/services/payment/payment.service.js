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

    // Find matching team by paymentOrderId
    if (!this.competitionRepository) {
      this.logger.error('Competition repository not available for webhook processing');
      return { processed: false, message: 'No matching order found' };
    }

    // Query all competitions to find the one with matching paymentOrderId
    const competitions = await this.competitionRepository.findActive();
    let matchingCompetition = null;
    let matchingTeam = null;

    for (const competition of competitions) {
      const team = competition.registeredTeams?.find(rt => rt.paymentOrderId === orderId);
      if (team) {
        matchingCompetition = competition;
        matchingTeam = team;
        break;
      }
    }

    if (!matchingCompetition || !matchingTeam) {
      this.logger.info('No matching order found for webhook', { orderId, event });
      return { processed: false, message: 'No matching order found' };
    }

    // Update payment status based on event type
    if (event === 'payment.captured') {
      matchingTeam.paymentStatus = 'completed';
      matchingTeam.paymentGateway = 'razorpay';
      matchingTeam.paymentId = payload?.payload?.payment?.entity?.id;
      matchingTeam.paymentVerifiedAt = new Date();
      matchingTeam.paymentAmount = payload?.payload?.payment?.entity?.amount;
    } else if (event === 'payment.failed') {
      matchingTeam.paymentStatus = 'failed';
    }

    // Save the competition document
    await matchingCompetition.save();

    // Create transaction record if repository is available
    if (this.transactionRepository) {
      await this.transactionRepository.create({
        source: 'razorpay',
        type: payload?.event || 'webhook',
        paymentStatus: matchingTeam.paymentStatus,
        rawPayload: payload,
      });
    }

    this.logger.info('Razorpay webhook reconciled', { 
      event, 
      orderId, 
      paymentStatus: matchingTeam.paymentStatus 
    });
    return { processed: true };
  }
}

module.exports = PaymentService;
