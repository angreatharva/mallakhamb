jest.mock('../models/Competition', () => ({
  findOne: jest.fn(),
}));

const crypto = require('crypto');
const Competition = require('../models/Competition');
const { reconcileRazorpayWebhook } = require('./paymentController');

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('paymentController webhook reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_123';
  });

  const buildPayload = (event) => ({
    event,
    payload: {
      payment: {
        entity: {
          id: 'pay_123',
          order_id: 'order_123',
          amount: 150000,
        },
      },
    },
  });

  const sign = (body) =>
    crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

  test('marks payment as failed on payment.failed', async () => {
    const registeredTeam = {
      paymentOrderId: 'order_123',
      paymentStatus: 'pending',
      isSubmitted: false,
    };
    const competition = {
      registeredTeams: [registeredTeam],
      save: jest.fn().mockResolvedValue(true),
    };
    Competition.findOne.mockResolvedValue(competition);

    const payload = buildPayload('payment.failed');
    const rawBody = JSON.stringify(payload);
    const req = {
      body: payload,
      rawBody,
      headers: { 'x-razorpay-signature': sign(rawBody) },
    };
    const res = buildRes();

    await reconcileRazorpayWebhook(req, res);

    expect(registeredTeam.paymentStatus).toBe('failed');
    expect(competition.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejects invalid webhook signature', async () => {
    const payload = buildPayload('payment.captured');
    const req = {
      body: payload,
      rawBody: JSON.stringify(payload),
      headers: { 'x-razorpay-signature': 'invalid' },
    };
    const res = buildRes();

    await reconcileRazorpayWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid webhook signature' })
    );
  });
});
