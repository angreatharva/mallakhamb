/**
 * Payment Configuration
 *
 * Amounts are always derived from each competition's `playerFee` (per player, INR).
 * There is no global base fee or default player rate.
 *
 * A competition may also define a registration window (`registrationOpenDate`,
 * `feeDueDate`, `lateFee` on `models/Competition.js`). `resolveFeeWindow` below
 * is the SINGLE place that turns those three fields plus an instant into a
 * phase; `Web/src/utils/scoring/competitionFee.js` mirrors it for the browser so
 * the coach is quoted what the server will charge. The mirror is deliberate —
 * same reasoning as the COP tables — but the two must move together.
 */

const crypto = require('crypto');

const { ValidationError } = require('../errors');
const { apparatusList } = require('../utils/data/apparatus.util');
const { toDate, startOfUtcDay, endOfUtcDay } = require('../utils/data/day-boundary.util');

const PAYMENT_CONFIG = {
  CURRENCY: 'INR',
  PROVIDER: 'razorpay',
};

/**
 * What the discount code takes off. One code, all of it.
 *
 * A partial discount would still need a Razorpay order and would leave the
 * whole verify/amount-match path intact. 100% does not: there is no such thing
 * as a ₹0 order, so redeeming skips the gateway entirely and submits the team
 * directly. Changing this number is therefore not a one-line change — see
 * `coach.service.redeemDiscountAndSubmit`.
 */
const DISCOUNT_PERCENT = 100;

/**
 * Does the submitted code match the configured one?
 *
 * Compared as SHA-256 digests so the comparison is constant time and both sides
 * are always the same length — `timingSafeEqual` throws on a length mismatch,
 * and guarding that by comparing lengths first leaks the length.
 *
 * Two refusals before any comparison, both of which would otherwise hand out
 * free entry: the feature being off, and an empty expected code (an unset
 * `DISCOUNT_CODE` would match an empty submission). `config-manager` already
 * refuses to boot in that state; this is the second lock on the same door.
 *
 * @param {unknown} submitted - what the coach typed
 * @param {{enabled: boolean, code: string}} discountConfig
 * @returns {boolean}
 */
function isDiscountCodeValid(submitted, discountConfig) {
  if (!discountConfig || discountConfig.enabled !== true) return false;

  const expected = String(discountConfig.code ?? '');
  const given = String(submitted ?? '');
  if (expected.length === 0 || given.length === 0) return false;

  const digest = (value) => crypto.createHash('sha256').update(value, 'utf8').digest();
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

/**
 * Price a team submission with a discount code applied.
 *
 * Returns the breakdown rather than just a number, because the coach is shown
 * what was taken off and the transaction records it.
 *
 * @param {number} amount - what the entry costs before any discount, INR
 * @param {unknown} submittedCode
 * @param {{enabled: boolean, code: string}} discountConfig
 * @returns {{applied: boolean, percent: number, originalAmount: number, discountAmount: number, payableAmount: number}}
 */
function applyDiscountCode(amount, submittedCode, discountConfig) {
  const originalAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;

  if (!isDiscountCodeValid(submittedCode, discountConfig)) {
    return {
      applied: false,
      percent: 0,
      originalAmount,
      discountAmount: 0,
      payableAmount: originalAmount,
    };
  }

  const discountAmount = (originalAmount * DISCOUNT_PERCENT) / 100;
  return {
    applied: true,
    percent: DISCOUNT_PERCENT,
    originalAmount,
    discountAmount,
    payableAmount: originalAmount - discountAmount,
  };
}

/**
 * Refuse a discount that will not be honoured.
 *
 * @param {unknown} submittedCode
 * @param {{enabled: boolean, code: string}} discountConfig
 * @throws {ValidationError}
 */
function assertDiscountCodeValid(submittedCode, discountConfig) {
  if (!discountConfig || discountConfig.enabled !== true) {
    throw new ValidationError('Discount codes are not being accepted for this event');
  }
  if (!isDiscountCodeValid(submittedCode, discountConfig)) {
    // Deliberately the same message whether the code is wrong, blank or the
    // configured one is unset — the response should not narrow a guess.
    throw new ValidationError('That discount code is not valid');
  }
}

/**
 * The four states a competition's fee window can be in at a given instant.
 *
 * `NOT_OPEN` and `CLOSED` block a coach from paying at all; `LATE` is the only
 * one that adds money.
 */
const FEE_PHASE = {
  NOT_OPEN: 'not_open',
  REGULAR: 'regular',
  LATE: 'late',
  CLOSED: 'closed',
};

/*
 * `toDate`, `endOfUtcDay` and `startOfUtcDay` used to be defined here. They now
 * live in `utils/data/day-boundary.util`, because the competition LOCK closes
 * at the same instant as the fee window (23:59 UTC on `endDate`) and the two
 * must not be able to drift apart — see that module's header.
 */

/**
 * Which fee phase a payment made at `at` falls into.
 *
 * A missing date disables its own edge and nothing else: no
 * `registrationOpenDate` means payment was always open, no `feeDueDate` means a
 * late fee is never charged, no `endDate` means the window never closes. That
 * is what keeps every competition created before this feature behaving exactly
 * as it did.
 *
 * @param {Object} competition - competition document (or plain object)
 * @param {Date} [at] - the instant to judge, defaults to now
 * @returns {{
 *   phase: string,
 *   isLate: boolean,
 *   canPay: boolean,
 *   lateFeePerPlayer: number,
 *   opensAt: Date | null,
 *   dueBy: Date | null,
 *   closesAt: Date | null
 * }}
 */
function resolveFeeWindow(competition, at = new Date()) {
  const now = toDate(at) || new Date();

  const openDate = toDate(competition?.registrationOpenDate);
  const dueDate = toDate(competition?.feeDueDate);
  const endDate = toDate(competition?.endDate);

  const opensAt = openDate ? startOfUtcDay(openDate) : null;
  const dueBy = dueDate ? endOfUtcDay(dueDate) : null;
  const closesAt = endDate ? endOfUtcDay(endDate) : null;

  const rawLateFee = Number(competition?.lateFee);
  const lateFee = Number.isFinite(rawLateFee) && rawLateFee > 0 ? rawLateFee : 0;

  const base = { opensAt, dueBy, closesAt };

  if (opensAt && now < opensAt) {
    return { ...base, phase: FEE_PHASE.NOT_OPEN, isLate: false, canPay: false, lateFeePerPlayer: 0 };
  }
  if (closesAt && now > closesAt) {
    return { ...base, phase: FEE_PHASE.CLOSED, isLate: false, canPay: false, lateFeePerPlayer: 0 };
  }
  if (dueBy && now > dueBy) {
    return { ...base, phase: FEE_PHASE.LATE, isLate: true, canPay: true, lateFeePerPlayer: lateFee };
  }
  return { ...base, phase: FEE_PHASE.REGULAR, isLate: false, canPay: true, lateFeePerPlayer: 0 };
}

/**
 * The per-player late fee in force at `at`, or 0.
 * @param {Object} competition
 * @param {Date} [at]
 * @returns {number} INR
 */
function getLateFeePerPlayer(competition, at = new Date()) {
  return resolveFeeWindow(competition, at).lateFeePerPlayer;
}

/**
 * Refuse a payment attempted outside the window.
 *
 * Called on the ORDER-CREATION path only. The superadmin's add-a-player flow
 * deliberately does not call it: that is the administrative override, and an
 * override that the calendar can veto is not one. It still pays the late fee.
 *
 * @param {Object} competition
 * @param {Date} [at]
 * @throws {ValidationError} if the window is not open
 */
function assertPaymentWindowOpen(competition, at = new Date()) {
  const window = resolveFeeWindow(competition, at);
  if (window.canPay) return window;

  const day = (date) => date.toISOString().slice(0, 10);

  if (window.phase === FEE_PHASE.NOT_OPEN) {
    throw new ValidationError(
      `Registration for this competition opens on ${day(window.opensAt)}. Payment is not accepted yet.`
    );
  }
  throw new ValidationError(
    `Registration for this competition closed at the end of ${day(window.closesAt)}. Payment is no longer accepted.`
  );
}

function requireCompetitionPlayerFeePerPlayer(competitionPlayerFee) {
  if (competitionPlayerFee === null || competitionPlayerFee === undefined || competitionPlayerFee === '') {
    throw new ValidationError(
      'This competition does not have a valid per-player fee. Set it when creating or editing the competition.'
    );
  }
  const n = typeof competitionPlayerFee === 'number' ? competitionPlayerFee : Number(competitionPlayerFee);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(
      'This competition does not have a valid per-player fee. Set it when creating or editing the competition.'
    );
  }
  return n;
}

/**
 * Total for team submission: sums the calculated fee for each player based on
 * their apparatuses, plus the per-player late fee if `at` falls after the
 * competition's `feeDueDate`.
 *
 * The late fee is PER PLAYER, like the base fee and the apparatus add-ons it
 * sits beside — a 70-athlete squad paying late owes 70 penalties, not one.
 *
 * @param {Array} players - The players array from registeredTeam
 * @param {Object} competition - The competition document
 * @param {Date} [at] - when the payment is being made; decides the fee phase
 * @returns {number} Total INR
 */
function calculateTeamPaymentAmount(players, competition, at = new Date()) {
  if (!players || !Array.isArray(players) || players.length === 0) return 0;

  const lateFee = getLateFeePerPlayer(competition, at);

  let total = 0;
  for (const player of players) {
    total += calculatePlayerFee(player, competition) + lateFee;
  }
  return total;
}

/**
 * Calculate fee for a single player based on their selected apparatuses.
 * @param {Object} player - The player registration object
 * @param {Object} competition - The competition document
 * @returns {number} INR
 */
function calculatePlayerFee(player, competition) {
  const baseFee = requireCompetitionPlayerFeePerPlayer(competition.playerFee);

  // The Mixed `apparatus` field has three shapes; reading it lives in one
  // place, shared with the roster filter — see utils/data/apparatus.util.
  // No competitionType here on purpose: the fee covers every apparatus the
  // athlete is entered for, in any category.
  const selectedApparatuses = apparatusList(player?.apparatus);

  if (selectedApparatuses.length === 0) {
    return baseFee;
  }
  
  let totalFee = baseFee;
  // Use a Set to avoid double-charging if the same apparatus is selected across different competition types
  const uniqueApparatuses = new Set(selectedApparatuses);
  
  for (const app of uniqueApparatuses) {
    let addonFee = null;
    // Check if there is an apparatus-specific fee mapping. Map can be plain object or Mongoose Map.
    let appFees = competition.apparatusFees;
    if (appFees && typeof appFees.get === 'function') {
      const specificFee = appFees.get(app);
      if (specificFee !== undefined && specificFee !== null) addonFee = Number(specificFee);
    } else if (appFees && appFees[app] !== undefined && appFees[app] !== null) {
      addonFee = Number(appFees[app]);
    }
    
    if (addonFee !== null && !isNaN(addonFee)) {
      totalFee += addonFee;
    }
  }
  
  return totalFee;
}

/**
 * Single player addition fee, including the late fee when one is in force.
 *
 * A superadmin adding an athlete after the deadline pays the same penalty a
 * coach would; charging one and not the other would mean the way a player was
 * entered changed the price of entering them.
 *
 * @param {Object} player
 * @param {Object} competition
 * @param {Date} [at] - when the payment is being made; decides the fee phase
 * @returns {number} INR
 */
function calculatePlayerAdditionAmount(player, competition, at = new Date()) {
  return calculatePlayerFee(player, competition) + getLateFeePerPlayer(competition, at);
}

/**
 * Get payment configuration
 * @returns {Object} Payment configuration object
 */
function getPaymentConfig() {
  return { ...PAYMENT_CONFIG };
}

module.exports = {
  PAYMENT_CONFIG,
  FEE_PHASE,
  DISCOUNT_PERCENT,
  isDiscountCodeValid,
  applyDiscountCode,
  assertDiscountCodeValid,
  calculateTeamPaymentAmount,
  calculatePlayerAdditionAmount,
  calculatePlayerFee,
  resolveFeeWindow,
  getLateFeePerPlayer,
  assertPaymentWindowOpen,
  getPaymentConfig,
};
