jest.mock('../models/Coach', () => ({}));
jest.mock('../models/Team', () => ({}));
jest.mock('../models/Player', () => ({}));
jest.mock('../models/Transaction', () => ({ create: jest.fn() }));
jest.mock('../models/Competition', () => ({ findById: jest.fn() }));
jest.mock('../utils/tokenUtils', () => ({ generateToken: jest.fn() }));
jest.mock('../utils/razorpayService', () => ({
  getRazorpayInstance: jest.fn(),
  verifyRazorpaySignature: jest.fn(),
  isRazorpayConfigured: jest.fn(),
}));
jest.mock('mongoose', () => ({
  startSession: jest.fn(),
}));

const Competition = require('../models/Competition');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const {
  getRazorpayInstance,
  verifyRazorpaySignature,
  isRazorpayConfigured,
} = require('../utils/razorpayService');
const {
  createTeamPaymentOrder,
  verifyTeamPaymentAndSubmit,
} = require('./coachController');

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const buildCompetitionWithTeam = ({
  teamId = 'team1',
  coachId = 'coach1',
  players = [{ id: 1 }, { id: 2 }],
  orderId = null,
  isSubmitted = false,
} = {}) => {
  const registeredTeam = {
    _id: 'regTeam1',
    team: { _id: teamId, name: 'Warriors' },
    coach: { toString: () => coachId },
    players,
    isSubmitted,
    paymentOrderId: orderId,
    paymentStatus: 'pending',
  };

  const competition = {
    _id: 'comp1',
    registeredTeams: [registeredTeam],
    save: jest.fn().mockResolvedValue(true),
    populate: jest.fn().mockResolvedValue(true),
  };

  return { competition, registeredTeam };
};

const mockFindByIdPopulate = (competition) => {
  Competition.findById.mockReturnValue({
    populate: jest.fn().mockResolvedValue(competition),
  });
};

describe('coachController Razorpay flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  });

  test('createTeamPaymentOrder should create Razorpay order', async () => {
    isRazorpayConfigured.mockReturnValue(true);
    const { competition } = buildCompetitionWithTeam();
    mockFindByIdPopulate(competition);

    const ordersCreate = jest.fn().mockResolvedValue({
      id: 'order_123',
      currency: 'INR',
    });
    getRazorpayInstance.mockReturnValue({ orders: { create: ordersCreate } });

    const req = { competitionId: 'comp1', user: { _id: 'coach1' } };
    const res = buildRes();
    await createTeamPaymentOrder(req, res);

    expect(ordersCreate).toHaveBeenCalled();
    expect(competition.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Payment order created successfully',
        razorpayKeyId: 'rzp_test_key',
      })
    );
  });

  test('verifyTeamPaymentAndSubmit should verify signature and submit', async () => {
    verifyRazorpaySignature.mockReturnValue(true);
    const { competition } = buildCompetitionWithTeam({ orderId: 'order_123' });
    mockFindByIdPopulate(competition);

    const withTransaction = jest.fn(async (cb) => cb());
    const endSession = jest.fn().mockResolvedValue(true);
    mongoose.startSession.mockResolvedValue({ withTransaction, endSession });

    const req = {
      competitionId: 'comp1',
      user: { _id: 'coach1' },
      body: {
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'sig_123',
      },
    };
    const res = buildRes();
    await verifyTeamPaymentAndSubmit(req, res);

    expect(verifyRazorpaySignature).toHaveBeenCalled();
    expect(Transaction.create).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Team submitted successfully',
      })
    );
  });

  test('verifyTeamPaymentAndSubmit should reject invalid signature', async () => {
    verifyRazorpaySignature.mockReturnValue(false);
    const req = {
      competitionId: 'comp1',
      user: { _id: 'coach1' },
      body: {
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'bad_sig',
      },
    };
    const res = buildRes();
    await verifyTeamPaymentAndSubmit(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Payment signature verification failed' })
    );
  });
});
