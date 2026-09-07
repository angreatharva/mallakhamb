/**
 * The Razorpay primitives, in one place.
 *
 * Two flows take money: a coach submitting a squad
 * (`CoachService.createTeamPaymentOrder` / `verifyTeamPaymentAndSubmit`) and a
 * super admin adding a single athlete
 * (`SuperAdminService.createPlayerPaymentOrder` / `verifyPaymentAndAddPlayer`).
 * They had ~60 identical lines of signature verification and ~33 of order
 * creation between them, including two copies of the HMAC comparison.
 *
 * A signature check is a security control. Two copies of one is one that will
 * eventually be fixed in only one place — so the crypto, the client
 * construction, the receipt scheme and the paid-at reading live here.
 *
 * What deliberately does NOT live here: the orchestration. Each caller keeps
 * its own logging, its own error wording and its own decisions — the coach path
 * records a FAILED transaction before rejecting a failed payment and the super
 * admin path does not, and that difference is intentional.
 *
 * @module services/payment/razorpay.gateway
 */

const crypto = require('crypto');

const { ValidationError } = require('../../errors');

/** Every amount this system charges is in Indian rupees. */
const RAZORPAY_CURRENCY = 'INR';

/**
 * Razorpay payment states that mean the money is ours.
 *
 * `authorized` counts as well as `captured`: an authorized payment is held and
 * will be captured, and refusing an entry at that point would reject a coach
 * who has in fact paid.
 */
const SUCCESSFUL_PAYMENT_STATUSES = Object.freeze(['captured', 'authorized']);

/**
 * Razorpay credentials from config, or a refusal.
 *
 * @param {Object} config - ConfigManager
 * @param {string} errorMessage - what to tell the caller if they are missing;
 *   the order path and the verify path word this differently on purpose
 * @returns {{keyId: string, keySecret: string}}
 * @throws {ValidationError}
 */
function razorpayCredentials(config, errorMessage) {
  const keyId = config?.get('razorpay.keyId') || '';
  const keySecret = config?.get('razorpay.keySecret') || '';

  if (!keyId || !keySecret) {
    throw new ValidationError(errorMessage);
  }

  return { keyId, keySecret };
}

/**
 * A configured Razorpay client.
 *
 * `require`d lazily, as both call sites already did — the SDK is only needed on
 * the two payment paths and pulling it in at module load would cost every
 * process that never takes money.
 *
 * @param {Object} config - ConfigManager
 * @param {string} [errorMessage]
 * @returns {import('razorpay')}
 * @throws {ValidationError} when credentials are not configured
 */
function razorpayClient(config, errorMessage = 'Razorpay credentials are not configured') {
  const { keyId, keySecret } = razorpayCredentials(config, errorMessage);
  const Razorpay = require('razorpay');
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * A Razorpay receipt reference for a team.
 *
 * Razorpay caps `receipt` at 40 characters, which a Mongo ObjectId plus a
 * millisecond timestamp would exceed — hence the last eight characters of each.
 *
 * @param {*} teamId
 * @returns {string}
 */
function buildReceipt(teamId) {
  const shortTeamId = String(teamId).slice(-8);
  const timestamp = Date.now().toString().slice(-8);
  return `rcpt_${shortTeamId}_${timestamp}`;
}

/**
 * Does this signature prove Razorpay produced this order/payment pair?
 *
 * HMAC-SHA256 over `order_id|payment_id`, compared in constant time. The length
 * guard is required because `timingSafeEqual` THROWS on a length mismatch
 * rather than returning false.
 *
 * Returns a boolean rather than throwing so each caller can log its own context
 * before rejecting.
 *
 * @param {Object} config - ConfigManager
 * @param {Object} payment
 * @param {string} payment.orderId - razorpay_order_id
 * @param {string} payment.paymentId - razorpay_payment_id
 * @param {string} payment.signature - razorpay_signature
 * @returns {boolean}
 * @throws {ValidationError} when the key secret is not configured
 */
function verifyPaymentSignature(config, { orderId, paymentId, signature }) {
  const keySecret = config?.get('razorpay.keySecret') || '';
  if (!keySecret) {
    throw new ValidationError('Payment verification failed: Configuration error');
  }

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(signature ?? ''));

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Ask Razorpay what actually happened to a payment.
 *
 * The client's claim that a payment succeeded is not evidence; this is. A
 * failure to reach Razorpay is a refusal, never an assumption of success.
 *
 * @param {Object} config - ConfigManager
 * @param {string} paymentId
 * @returns {Promise<Object>} the payment entity
 * @throws {ValidationError}
 */
async function fetchPaymentDetails(config, paymentId) {
  const razorpay = razorpayClient(config, 'Payment verification failed: Configuration error');
  try {
    return await razorpay.payments.fetch(paymentId);
  } catch (error) {
    throw new ValidationError('Payment verification failed: Unable to verify payment status');
  }
}

/**
 * @param {Object} paymentDetails
 * @returns {boolean}
 */
function isPaymentSuccessful(paymentDetails) {
  return SUCCESSFUL_PAYMENT_STATUSES.includes(paymentDetails?.status);
}

/**
 * WHEN the coach actually paid, according to Razorpay.
 *
 * Theirs, not ours, and it matters: the late-fee window is priced against this
 * instant. Using `new Date()` would price a payment by when the callback
 * happened to be handled, which on a slow retry is a different day.
 *
 * @param {Object} paymentDetails
 * @returns {Date} falls back to now when Razorpay sent no usable timestamp
 */
function paidAtFrom(paymentDetails) {
  const createdAt = Number(paymentDetails?.created_at);
  return Number.isFinite(createdAt) ? new Date(createdAt * 1000) : new Date();
}

module.exports = {
  RAZORPAY_CURRENCY,
  SUCCESSFUL_PAYMENT_STATUSES,
  razorpayCredentials,
  razorpayClient,
  buildReceipt,
  verifyPaymentSignature,
  fetchPaymentDetails,
  isPaymentSuccessful,
  paidAtFrom,
};
