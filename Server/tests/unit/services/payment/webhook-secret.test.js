/**
 * F4 (deploy/COMMON.md C1.3): Razorpay signs webhook bodies with the secret
 * typed into its Webhooks settings, not with the API key secret. The server
 * used to verify webhooks with the key secret only.
 */
const crypto = require('crypto');
const PaymentService = require('../../../../src/services/payment/payment.service');

const BODY = JSON.stringify({ event: 'payment.captured' });
const sign = (secret) => crypto.createHmac('sha256', secret).update(BODY).digest('hex');
const logger = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });
const service = (values, log = logger()) => new PaymentService({ get: (path) => values[path] }, log);

describe('PaymentService.verifySignature — which secret', () => {
  it('accepts a body signed with RAZORPAY_WEBHOOK_SECRET when it is set', () => {
    const s = service({ 'razorpay.webhookSecret': 'whsec', 'razorpay.keySecret': 'keysec' });
    expect(s.verifySignature(BODY, sign('whsec'))).toBe(true);
  });

  it('rejects a body signed with the key secret once a webhook secret is set', () => {
    const s = service({ 'razorpay.webhookSecret': 'whsec', 'razorpay.keySecret': 'keysec' });
    expect(s.verifySignature(BODY, sign('keysec'))).toBe(false);
  });

  it('falls back to the key secret when no webhook secret is set, and warns once', () => {
    const log = logger();
    const s = service({ 'razorpay.keySecret': 'keysec' }, log);
    expect(s.verifySignature(BODY, sign('keysec'))).toBe(true);
    expect(s.verifySignature(BODY, sign('keysec'))).toBe(true);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0][0]).toMatch(/RAZORPAY_WEBHOOK_SECRET is not set/);
  });

  it('does not warn when the webhook secret is set', () => {
    const log = logger();
    service({ 'razorpay.webhookSecret': 'whsec' }, log).verifySignature(BODY, sign('whsec'));
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('still refuses when neither secret is configured', () => {
    expect(() => service({}).verifySignature(BODY, 'x')).toThrow(/not configured/);
  });

  it('reads RAZORPAY_WEBHOOK_SECRET into razorpay.webhookSecret', () => {
    const saved = { ...process.env };
    process.env = { ...saved, MONGODB_URI: 'mongodb://localhost:27017/x', JWT_SECRET: 'x'.repeat(40), RAZORPAY_WEBHOOK_SECRET: 'whsec', NODE_ENV: 'test' };
    try {
      const ConfigManager = require('../../../../src/config/config-manager').constructor;
      expect(new ConfigManager().load().razorpay.webhookSecret).toBe('whsec');
    } finally {
      process.env = saved;
    }
  });
});
