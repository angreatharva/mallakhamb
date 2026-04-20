/**
 * payment.controller.test.js
 *
 * Tests that the webhook controller delegates correctly to paymentService
 * and maps HTTP responses properly.
 * No crypto, DB, or Razorpay calls are made here — all service logic is mocked.
 */

jest.mock('../middleware/error.middleware', () => ({ asyncHandler: (fn) => fn }));

const createPaymentController = require('../controllers/payment.controller');

// ── helpers ───────────────────────────────────────────────────────────────────

const buildService = (overrides = {}) => ({
  reconcileWebhook: jest.fn(),
  ...overrides,
});

const buildContainer = (svc) => ({
  resolve: (n) => (n === 'paymentService' ? svc : { info: jest.fn(), error: jest.fn() }),
});

const res = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};
const next = () => jest.fn();

const buildWebhookReq = ({
  event = 'payment.captured',
  orderId = 'order_123',
  signature = 'valid_sig',
} = {}) => {
  const body = {
    event,
    payload: {
      payment: {
        entity: { id: 'pay_123', order_id: orderId, amount: 150000 },
      },
    },
  };
  return {
    body,
    rawBody: JSON.stringify(body),
    headers: { 'x-razorpay-signature': signature },
  };
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('payment.controller', () => {
  let svc, ctrl;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = buildService();
    ctrl = createPaymentController(buildContainer(svc));
  });

  describe('reconcileRazorpayWebhook', () => {
    it('passes rawBody, signature, and parsed body to service', async () => {
      svc.reconcileWebhook.mockResolvedValue(undefined);

      const req = buildWebhookReq({ event: 'payment.captured', signature: 'valid_sig' });
      const r = res();
      const n = next();

      await ctrl.reconcileRazorpayWebhook(req, r, n);

      expect(svc.reconcileWebhook).toHaveBeenCalledWith(
        req.rawBody,
        'valid_sig',
        req.body
      );
      expect(r.status).toHaveBeenCalledWith(200);
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Webhook processed successfully.' })
      );
      expect(n).not.toHaveBeenCalled();
    });

    it('returns 200 for payment.failed event when service resolves', async () => {
      svc.reconcileWebhook.mockResolvedValue(undefined);

      const req = buildWebhookReq({ event: 'payment.failed' });
      const r = res();

      await ctrl.reconcileRazorpayWebhook(req, r, next());

      expect(r.status).toHaveBeenCalledWith(200);
    });

    it('calls next(error) when service rejects for invalid signature', async () => {
      const error = new Error('Invalid webhook signature');
      error.statusCode = 400;
      svc.reconcileWebhook.mockRejectedValue(error);

      const req = buildWebhookReq({ signature: 'bad_sig' });
      const r = res();
      const n = next();

      await ctrl.reconcileRazorpayWebhook(req, r, n);

      expect(n).toHaveBeenCalledWith(error);
      expect(r.json).not.toHaveBeenCalled();
    });

    it('calls next(error) for missing payload', async () => {
      const error = new Error('Invalid webhook payload');
      svc.reconcileWebhook.mockRejectedValue(error);

      const req = buildWebhookReq();
      req.body = {};
      const r = res();
      const n = next();

      await ctrl.reconcileRazorpayWebhook(req, r, n);

      expect(n).toHaveBeenCalledWith(error);
    });

    it('calls next(error) on unexpected service failure', async () => {
      const error = new Error('Database connection lost');
      svc.reconcileWebhook.mockRejectedValue(error);

      const req = buildWebhookReq();
      const r = res();
      const n = next();

      await ctrl.reconcileRazorpayWebhook(req, r, n);

      expect(n).toHaveBeenCalledWith(error);
    });

    it('extracts signature from correct header', async () => {
      svc.reconcileWebhook.mockResolvedValue(undefined);

      const req = buildWebhookReq({ signature: 'sha256_abc' });
      const r = res();

      await ctrl.reconcileRazorpayWebhook(req, r, next());

      expect(svc.reconcileWebhook).toHaveBeenCalledWith(
        expect.any(String),
        'sha256_abc',
        expect.any(Object)
      );
    });
  });
});
