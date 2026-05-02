/**
 * payment.service.property.test.js
 *
 * Property-based tests for PaymentService using fast-check.
 * Feature: old-config-migration, Property 12 & 13
 */

const fc = require('fast-check');
const crypto = require('crypto');
const PaymentService = require('./payment.service');

// ── helpers ───────────────────────────────────────────────────────────────────

const buildConfig = (secret = 'test_secret_key') => ({
  get: jest.fn((key) => {
    if (key === 'razorpay.keySecret') return secret;
    return null;
  })
});

const buildLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
});

const buildCompetitionRepository = () => ({
  findActive: jest.fn().mockResolvedValue([])
});

// ── property tests ────────────────────────────────────────────────────────────

describe('PaymentService Property Tests', () => {
  describe('Property 12: HMAC webhook signature verification is consistent', () => {
    it('HMAC verification should be consistent - valid signatures return true, tampered signatures return false', () => {
      fc.assert(
        fc.property(
          fc.string(), // random body
          fc.string({ minLength: 8, maxLength: 64 }), // random secret
          (body, secret) => {
            const config = buildConfig(secret);
            const logger = buildLogger();
            const service = new PaymentService(config, logger);

            // Compute HMAC for the body with the secret
            const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
            
            // Verify that the computed signature validates against itself
            const validResult = service.verifySignature(body, computed);
            expect(validResult).toBe(true);

            // Verify that a tampered signature fails validation
            const tamperedSignature = computed + 'x';
            const invalidResult = service.verifySignature(body, tamperedSignature);
            expect(invalidResult).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('HMAC verification should handle empty bodies consistently', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 64 }), // random secret
          (secret) => {
            const config = buildConfig(secret);
            const logger = buildLogger();
            const service = new PaymentService(config, logger);

            const emptyBody = '';
            const computed = crypto.createHmac('sha256', secret).update(emptyBody).digest('hex');
            
            const result = service.verifySignature(emptyBody, computed);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 13: Unknown webhook event types are always ignored', () => {
    it('should ignore all event types except payment.captured and payment.failed', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(s => s !== 'payment.captured' && s !== 'payment.failed'), // random event type excluding known ones
          fc.string(), // random order ID
          async (eventType, orderId) => {
            const config = buildConfig();
            const logger = buildLogger();
            const competitionRepository = buildCompetitionRepository();
            const service = new PaymentService(config, logger, null, competitionRepository);

            const payload = {
              event: eventType,
              payload: {
                payment: {
                  entity: {
                    id: 'pay_123',
                    order_id: orderId,
                    amount: 150000
                  }
                }
              }
            };

            const rawBody = JSON.stringify(payload);
            const secret = 'test_secret_key';
            const validSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

            const result = await service.reconcileWebhook(rawBody, validSignature, payload);

            expect(result.processed).toBe(false);
            expect(result.message).toBe('Webhook event ignored');
            
            // Verify that findActive was not called since we ignore unknown events
            expect(competitionRepository.findActive).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases in event type strings', async () => {
      const edgeCaseEvents = [
        '', // empty string
        'payment.', // incomplete
        'payment.captured.extra', // extra suffix
        'PAYMENT.CAPTURED', // wrong case
        'payment.captured ', // trailing space
        ' payment.captured', // leading space
        'payment\tcaptured', // tab character
        'payment\ncaptured', // newline character
      ];

      for (const eventType of edgeCaseEvents) {
        const config = buildConfig();
        const logger = buildLogger();
        const competitionRepository = buildCompetitionRepository();
        const service = new PaymentService(config, logger, null, competitionRepository);

        const payload = {
          event: eventType,
          payload: {
            payment: {
              entity: {
                id: 'pay_123',
                order_id: 'order_123',
                amount: 150000
              }
            }
          }
        };

        const rawBody = JSON.stringify(payload);
        const secret = 'test_secret_key';
        const validSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

        const result = await service.reconcileWebhook(rawBody, validSignature, payload);

        expect(result.processed).toBe(false);
        expect(result.message).toBe('Webhook event ignored');
      }
    });
  });
});