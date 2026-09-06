/**
 * Razorpay webhook reconciliation.
 *
 * `reconcileWebhook` could not complete for its entire existence, and failed in
 * three independent ways at once:
 *
 *   1. it loaded competitions through `findActive()` — which is `.lean()`, like
 *      every BaseRepository read — and then called `competition.save()` on the
 *      result, so every delivery ended in a TypeError and a 500;
 *   2. the Transaction it wrote used `source: 'razorpay'` and
 *      `type: <the event name>`, neither of which is in those fields' enums, and
 *      omitted the required `competition` — so even with (1) fixed it would have
 *      thrown a ValidationError;
 *   3. it stored Razorpay's `amount` unconverted, in paise, beside figures the
 *      rest of the app records in rupees.
 *
 * A webhook is the reconciliation path — it is what corrects the record when the
 * browser never came back from checkout — so a coach could pay, close the tab,
 * and stay unregistered with nothing anywhere reporting a problem.
 */

const crypto = require('crypto');

const PaymentService = require('../../src/services/payment/payment.service');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const TransactionRepository = require('../../src/repositories/transaction.repository');

const Competition = require('../../models/Competition');
const Team = require('../../models/Team');
const Coach = require('../../models/Coach');
const Transaction = require('../../models/Transaction');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

const WEBHOOK_SECRET = 'test-razorpay-secret';
const ORDER_ID = 'order_TESTWEBHOOK01';

const config = {
  get: (path) => (path === 'razorpay.keySecret' ? WEBHOOK_SECRET : undefined),
};

/** Razorpay reports amounts in paise. */
const capturedEvent = (orderId, paise) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_TEST01', order_id: orderId, amount: paise } } },
});

const failedEvent = (orderId) => ({
  event: 'payment.failed',
  payload: { payment: { entity: { id: 'pay_TEST02', order_id: orderId, amount: 250000 } } },
});

const sign = (body) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

let paymentService;
let competitionId;
let teamId;
let coachId;

beforeEach(async () => {
  paymentService = new PaymentService(
    config,
    noopLogger,
    new TransactionRepository(noopLogger),
    new CompetitionRepository(noopLogger)
  );

  const coach = await Coach.create({
    firstName: 'Webhook', lastName: 'Coach',
    email: 'webhook-coach@example.com',
    password: 'CoachSecret1',
  });
  coachId = coach._id;

  const team = await Team.create({ name: 'Webhook Team', coach: coach._id });
  teamId = team._id;

  const competition = await Competition.create({
    name: 'Webhook Meet',
    level: 'state',
    place: 'Pune',
    year: 2026,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-03'),
    playerFee: 500,
    competitionTypes: ['competition_1'],
    registeredTeams: [{
      team: team._id,
      coach: coach._id,
      players: [],
      isSubmitted: false,
      paymentStatus: 'pending',
      paymentOrderId: ORDER_ID,
    }],
  });
  competitionId = competition._id;
});

/** Post a signed webhook the way the controller does. */
const deliver = (payload) => {
  const raw = JSON.stringify(payload);
  return paymentService.reconcileWebhook(raw, sign(raw), payload);
};

describe('reconcileWebhook', () => {
  test('a captured payment marks the registration paid', async () => {
    const result = await deliver(capturedEvent(ORDER_ID, 250000));

    expect(result.processed).toBe(true);

    const competition = await Competition.findById(competitionId).lean();
    const registration = competition.registeredTeams[0];

    expect(registration.paymentStatus).toBe('completed');
    expect(registration.paymentGateway).toBe('razorpay');
    expect(registration.paymentId).toBe('pay_TEST01');
    expect(registration.paymentVerifiedAt).toBeInstanceOf(Date);
  });

  test('the amount is stored in rupees, not the paise Razorpay sends', async () => {
    await deliver(capturedEvent(ORDER_ID, 250000));

    const competition = await Competition.findById(competitionId).lean();
    expect(competition.registeredTeams[0].paymentAmount).toBe(2500);

    const transaction = await Transaction.findOne({ competition: competitionId }).lean();
    expect(transaction.amount).toBe(2500);
  });

  test('the Transaction it writes satisfies the schema', async () => {
    await deliver(capturedEvent(ORDER_ID, 250000));

    const transaction = await Transaction.findOne({ competition: competitionId }).lean();

    // Every one of these was wrong or missing before: `source` and `type` were
    // outside their enums and `competition` was absent, so the create threw.
    expect(transaction).toBeTruthy();
    expect(transaction.source).toBe('coach');
    expect(transaction.type).toBe('team_submission');
    expect(String(transaction.competition)).toBe(String(competitionId));
    expect(String(transaction.team)).toBe(String(teamId));
    expect(String(transaction.coach)).toBe(String(coachId));
    expect(transaction.paymentStatus).toBe('completed');
    expect(transaction.metadata.razorpay_order_id).toBe(ORDER_ID);
    expect(transaction.metadata.razorpay_event).toBe('payment.captured');
  });

  test('a failed payment marks the registration failed and pays nothing in', async () => {
    const result = await deliver(failedEvent(ORDER_ID));

    expect(result.processed).toBe(true);

    const competition = await Competition.findById(competitionId).lean();
    const registration = competition.registeredTeams[0];

    expect(registration.paymentStatus).toBe('failed');
    // A failure must not stamp verification, a payment id or an amount onto the
    // registration. None of the three has a schema default, so an untouched
    // field is absent rather than null.
    expect(registration.paymentVerifiedAt).toBeUndefined();
    expect(registration.paymentId).toBeUndefined();
    expect(registration.paymentAmount).toBeUndefined();
  });

  test('it never marks the registration submitted — only the coach does that', async () => {
    await deliver(capturedEvent(ORDER_ID, 250000));

    const competition = await Competition.findById(competitionId).lean();
    // `isSubmitted` is what puts a squad in front of a judge. Payment alone is
    // not entry: the coach still has to complete the submit step.
    expect(competition.registeredTeams[0].isSubmitted).toBe(false);
  });

  test('an unknown order id is reported, not thrown', async () => {
    const result = await deliver(capturedEvent('order_NOSUCHORDER', 250000));

    expect(result.processed).toBe(false);
    expect(result.message).toBe('No matching order found');
  });

  test('an unrecognised event is ignored without touching the registration', async () => {
    const result = await deliver({
      event: 'payment.authorized',
      payload: { payment: { entity: { id: 'pay_X', order_id: ORDER_ID, amount: 250000 } } },
    });

    expect(result.processed).toBe(false);

    const competition = await Competition.findById(competitionId).lean();
    expect(competition.registeredTeams[0].paymentStatus).toBe('pending');
  });

  test('a bad signature is rejected before anything is read or written', async () => {
    const payload = capturedEvent(ORDER_ID, 250000);
    const raw = JSON.stringify(payload);

    await expect(
      paymentService.reconcileWebhook(raw, sign('a different body'), payload)
    ).rejects.toThrow(/signature/i);

    const competition = await Competition.findById(competitionId).lean();
    expect(competition.registeredTeams[0].paymentStatus).toBe('pending');
  });

  test('it updates only the registration that placed the order', async () => {
    // A second squad on the same competition document, mid-checkout.
    const otherCoach = await Coach.create({
      firstName: 'Other', lastName: 'Coach',
      email: 'other-webhook-coach@example.com',
      password: 'CoachSecret1',
    });
    const otherTeam = await Team.create({ name: 'Other Team', coach: otherCoach._id });

    await Competition.updateOne(
      { _id: competitionId },
      {
        $push: {
          registeredTeams: {
            team: otherTeam._id,
            coach: otherCoach._id,
            players: [],
            isSubmitted: false,
            paymentStatus: 'pending',
            paymentOrderId: 'order_SOMEONEELSE',
          },
        },
      }
    );

    await deliver(capturedEvent(ORDER_ID, 250000));

    const competition = await Competition.findById(competitionId).lean();
    const mine = competition.registeredTeams.find((rt) => rt.paymentOrderId === ORDER_ID);
    const theirs = competition.registeredTeams.find((rt) => rt.paymentOrderId === 'order_SOMEONEELSE');

    expect(mine.paymentStatus).toBe('completed');
    // The whole-array rewrite this replaced would have carried a stale copy of
    // the neighbouring squad back over the top of it.
    expect(theirs.paymentStatus).toBe('pending');
  });
});
