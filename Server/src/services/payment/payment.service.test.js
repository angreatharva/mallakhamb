/**
 * payment.service.test.js
 *
 * Unit tests for PaymentService focusing on HMAC verification and webhook event handling.
 * Tests timing-safe comparison and payment status updates.
 */

const crypto = require('crypto');
const PaymentService = require('./payment.service');
const { ValidationError, AuthenticationError } = require('../../errors');

// ── helpers ───────────────────────────────────────────────────────────────────

const buildConfig = (overrides = {}) => ({
  get: jest.fn((key) => {
    const defaults = {
      'razorpay.keySecret': 'test_secret_key'
    };
    return overrides[key] || defaults[key];
  })
});

const buildLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
});

const buildTransactionRepository = () => ({
  create: jest.fn().mockResolvedValue({ id: 'txn_123' })
});

const buildCompetitionRepository = () => ({
  findActive: jest.fn().mockResolvedValue([])
});

const buildCompetition = (registeredTeams = []) => ({
  _id: 'comp_123',
  name: 'Test Competition',
  registeredTeams,
  save: jest.fn().mockResolvedValue(true)
});

const buildRegisteredTeam = (overrides = {}) => ({
  team: 'team_123',
  coach: 'coach_123',
  paymentOrderId: 'order_123',
  paymentStatus: 'pending',
  paymentGateway: null,
  paymentId: null,
  paymentVerifiedAt: null,
  paymentAmount: null,
  ...overrides
});

const buildWebhookPayload = (event = 'payment.captured', orderId = 'order_123') => ({
  event,
  payload: {
    payment: {
      entity: {
        id: 'pay_123',
        order_id: orderId,
        amount: 150000
      }
    }
  }
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PaymentService', () => {
  let config, logger, transactionRepository, competitionRepository, service;

  beforeEach(() => {
    jest.clearAllMocks();
    config = buildConfig();
    logger = buildLogger();
    transactionRepository = buildTransactionRepository();
    competitionRepository = buildCompetitionRepository();
    service = new PaymentService(config, logger, transactionRepository, competitionRepository);
  });

  describe('verifySignature', () => {
    it('returns true for valid signature', () => {
      const rawBody = '{"test": "data"}';
      const secret = 'test_secret_key';
      const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const result = service.verifySignature(rawBody, expectedSignature);

      expect(result).toBe(true);
    });

    it('returns false for tampered signature', () => {
      const rawBody = '{"test": "data"}';
      const secret = 'test_secret_key';
      const validSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const tamperedSignature = validSignature + 'x';

      const result = service.verifySignature(rawBody, tamperedSignature);

      expect(result).toBe(false);
    });

    it('returns false for signatures with different lengths', () => {
      const rawBody = '{"test": "data"}';
      const shortSignature = 'abc';

      const result = service.verifySignature(rawBody, shortSignature);

      expect(result).toBe(false);
    });

    it('throws ValidationError when secret is missing', () => {
      config.get.mockReturnValue(null);
      
      expect(() => {
        service.verifySignature('{"test": "data"}', 'signature');
      }).toThrow(ValidationError);
      expect(() => {
        service.verifySignature('{"test": "data"}', 'signature');
      }).toThrow('Razorpay secret is not configured');
    });

    it('throws AuthenticationError when signature is missing', () => {
      expect(() => {
        service.verifySignature('{"test": "data"}', null);
      }).toThrow(AuthenticationError);
      expect(() => {
        service.verifySignature('{"test": "data"}', null);
      }).toThrow('Missing Razorpay signature');
    });
  });

  describe('reconcileWebhook', () => {
    const validRawBody = '{"event":"payment.captured"}';
    const validSignature = crypto.createHmac('sha256', 'test_secret_key').update(validRawBody).digest('hex');

    it('updates paymentStatus to completed for payment.captured event', async () => {
      const registeredTeam = buildRegisteredTeam({ paymentOrderId: 'order_123' });
      const competition = buildCompetition([registeredTeam]);
      competitionRepository.findActive.mockResolvedValue([competition]);

      const payload = buildWebhookPayload('payment.captured', 'order_123');
      
      const result = await service.reconcileWebhook(validRawBody, validSignature, payload);

      expect(registeredTeam.paymentStatus).toBe('completed');
      expect(registeredTeam.paymentGateway).toBe('razorpay');
      expect(registeredTeam.paymentId).toBe('pay_123');
      expect(registeredTeam.paymentAmount).toBe(150000);
      expect(registeredTeam.paymentVerifiedAt).toBeInstanceOf(Date);
      expect(competition.save).toHaveBeenCalled();
      expect(result.processed).toBe(true);
    });

    it('updates paymentStatus to failed for payment.failed event', async () => {
      const registeredTeam = buildRegisteredTeam({ paymentOrderId: 'order_123' });
      const competition = buildCompetition([registeredTeam]);
      competitionRepository.findActive.mockResolvedValue([competition]);

      const payload = buildWebhookPayload('payment.failed', 'order_123');
      
      const result = await service.reconcileWebhook(validRawBody, validSignature, payload);

      expect(registeredTeam.paymentStatus).toBe('failed');
      expect(competition.save).toHaveBeenCalled();
      expect(result.processed).toBe(true);
    });

    it('returns ignored message for unknown event types', async () => {
      const payload = buildWebhookPayload('payment.refunded', 'order_123');
      
      const result = await service.reconcileWebhook(validRawBody, validSignature, payload);

      expect(result.processed).toBe(false);
      expect(result.message).toBe('Webhook event ignored');
      expect(competitionRepository.findActive).not.toHaveBeenCalled();
    });

    it('returns no matching order message when order not found', async () => {
      competitionRepository.findActive.mockResolvedValue([buildCompetition([])]);

      const payload = buildWebhookPayload('payment.captured', 'nonexistent_order');
      
      const result = await service.reconcileWebhook(validRawBody, validSignature, payload);

      expect(result.processed).toBe(false);
      expect(result.message).toBe('No matching order found');
    });

    it('throws AuthenticationError for invalid signature', async () => {
      const invalidSignature = 'invalid_signature';
      const payload = buildWebhookPayload('payment.captured', 'order_123');

      await expect(
        service.reconcileWebhook(validRawBody, invalidSignature, payload)
      ).rejects.toThrow(AuthenticationError);
      await expect(
        service.reconcileWebhook(validRawBody, invalidSignature, payload)
      ).rejects.toThrow('Invalid Razorpay webhook signature');
    });

    it('handles missing competition repository gracefully', async () => {
      const serviceWithoutRepo = new PaymentService(config, logger, transactionRepository, null);
      const payload = buildWebhookPayload('payment.captured', 'order_123');

      const result = await serviceWithoutRepo.reconcileWebhook(validRawBody, validSignature, payload);

      expect(result.processed).toBe(false);
      expect(result.message).toBe('No matching order found');
    });

    it('creates transaction record when repository is available', async () => {
      const registeredTeam = buildRegisteredTeam({ paymentOrderId: 'order_123' });
      const competition = buildCompetition([registeredTeam]);
      competitionRepository.findActive.mockResolvedValue([competition]);

      const payload = buildWebhookPayload('payment.captured', 'order_123');
      
      await service.reconcileWebhook(validRawBody, validSignature, payload);

      expect(transactionRepository.create).toHaveBeenCalledWith({
        source: 'razorpay',
        type: 'payment.captured',
        paymentStatus: 'completed',
        rawPayload: payload
      });
    });
  });
});