/**
 * A Razorpay payment pays for the registration it was ORDERED for, once
 * (security audit 2026-10-31, M5).
 *
 * The coach's verify-and-submit checked the signature, the payment status,
 * the order id and the amount — but never which registration the order was
 * created for, and never whether the payment had already paid for one. A
 * captured payment could be presented again to submit a second registration
 * of the same price. The unique index on transactions fired only after the
 * registration was already marked paid, and its error was swallowed.
 *
 * Real CoachService and repositories over an in-memory MongoDB; only the
 * Razorpay SDK is replaced. The legitimate payment is checked first, so a
 * refusal below cannot come from a path that refuses everything.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

const KEY_SECRET = 'test_razorpay_key_secret_for_binding';
const mockRazorpayState = { payments: new Map(), orders: new Map() };

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  payments: { fetch: async (id) => mockRazorpayState.payments.get(id) },
  orders: { fetch: async (id) => mockRazorpayState.orders.get(id) },
})));

let coachService;

const col = (name) => mongoose.connection.collection(name);
const oid = () => new mongoose.Types.ObjectId();
const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_binding';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  const { bootstrap } = require('../../src/infrastructure/bootstrap');
  coachService = bootstrap().container.resolve('coachService');
});

afterAll(() => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

beforeEach(() => {
  mockRazorpayState.payments.clear();
  mockRazorpayState.orders.clear();
});

/** One coach with the same two-athlete team entered (unpaid) at two meets. */
async function seed() {
  const ids = { coach: oid(), team: oid(), meetA: oid(), meetB: oid(), p1: oid(), p2: oid() };
  const entry = () => ({
    _id: oid(), team: ids.team, coach: ids.coach, isActive: true, isSubmitted: false, paymentStatus: 'pending',
    players: [
      { player: ids.p1, ageGroup: 'Under14', gender: 'Male' },
      { player: ids.p2, ageGroup: 'Under14', gender: 'Male' },
    ],
  });
  const meet = (id) => ({
    _id: id, name: `Meet ${id}`, place: 'Pune', year: 2026, level: 'district', status: 'upcoming',
    startDate: new Date(Date.now() + 20 * 86400000), endDate: new Date(Date.now() + 21 * 86400000),
    playerFee: 100, competitionTypes: ['competition_1'], isDeleted: false, registeredTeams: [entry()],
  });
  await col('competitions').insertMany([meet(ids.meetA), meet(ids.meetB)]);
  await col('teams').insertOne({ _id: ids.team, name: 'Binding Team', coach: ids.coach, isActive: true });
  await col('coaches').insertOne({ _id: ids.coach, firstName: 'Pay', lastName: 'Coach', email: 'pay.coach@example.com', isActive: true });
  return ids;
}

/** A captured payment of `amount` paise against an order whose notes we wrote. */
function payment({ orderId, paymentId, amount, notes }) {
  mockRazorpayState.orders.set(orderId, { id: orderId, notes });
  mockRazorpayState.payments.set(paymentId, {
    id: paymentId, order_id: orderId, amount, status: 'captured', method: 'upi',
    created_at: Math.floor(Date.now() / 1000),
  });
  return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) };
}

const entryAt = async (meetId) => (await col('competitions').findOne({ _id: meetId })).registeredTeams[0];

describe('verifyTeamPaymentAndSubmit binds a payment to its registration', () => {
  it('accepts the payment for the registration it was ordered for', async () => {
    const ids = await seed();
    const payload = payment({
      orderId: 'order_A1', paymentId: 'pay_A1', amount: 20000,
      notes: { coachId: String(ids.coach), competitionId: String(ids.meetA), teamId: String(ids.team) },
    });

    const result = await coachService.verifyTeamPaymentAndSubmit(ids.coach, ids.meetA, payload);

    expect(result).toBeTruthy();
    const entry = await entryAt(ids.meetA);
    expect(entry.isSubmitted).toBe(true);
    expect(entry.paymentId).toBe('pay_A1');
  });

  it('refuses a payment whose order was made for another meet', async () => {
    const ids = await seed();
    const payload = payment({
      orderId: 'order_A2', paymentId: 'pay_A2', amount: 20000,
      notes: { coachId: String(ids.coach), competitionId: String(ids.meetA), teamId: String(ids.team) },
    });

    await expect(coachService.verifyTeamPaymentAndSubmit(ids.coach, ids.meetB, payload))
      .rejects.toThrow(/different registration/);
    expect((await entryAt(ids.meetB)).isSubmitted).toBe(false);
  });

  it('refuses a payment whose order was made for another coach', async () => {
    const ids = await seed();
    const payload = payment({
      orderId: 'order_A3', paymentId: 'pay_A3', amount: 20000,
      notes: { coachId: String(oid()), competitionId: String(ids.meetA), teamId: String(ids.team) },
    });

    await expect(coachService.verifyTeamPaymentAndSubmit(ids.coach, ids.meetA, payload))
      .rejects.toThrow(/different registration/);
    expect((await entryAt(ids.meetA)).isSubmitted).toBe(false);
  });

  it('refuses a payment that has already paid for a registration', async () => {
    const ids = await seed();
    const notesA = { coachId: String(ids.coach), competitionId: String(ids.meetA), teamId: String(ids.team) };
    const first = payment({ orderId: 'order_A4', paymentId: 'pay_A4', amount: 20000, notes: notesA });
    await coachService.verifyTeamPaymentAndSubmit(ids.coach, ids.meetA, first);
    expect((await entryAt(ids.meetA)).isSubmitted).toBe(true);

    // The same captured payment, now presented against an order that names
    // meet B (the strongest form of the replay: notes alone would pass).
    mockRazorpayState.orders.set('order_A4', { id: 'order_A4', notes: { ...notesA, competitionId: String(ids.meetB) } });

    await expect(coachService.verifyTeamPaymentAndSubmit(ids.coach, ids.meetB, first))
      .rejects.toThrow(/already been used/);
    expect((await entryAt(ids.meetB)).isSubmitted).toBe(false);
  });
});
