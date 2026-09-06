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

const { ValidationError } = require('../errors');

const PAYMENT_CONFIG = {
  CURRENCY: 'INR',
  PROVIDER: 'razorpay',
};

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

/** @param {unknown} value @returns {Date | null} */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The last millisecond of the calendar day a date falls on — "23:59 on the End
 * Date", to the letter.
 *
 * UTC, because that is how these dates are STORED: an `<input type="date">`
 * sends `YYYY-MM-DD`, which both `express-validator`'s `.toDate()` and `new
 * Date()` read as UTC midnight, and the seed script writes `Date.UTC(...)`
 * outright. Reading the day back in any other zone would shift the boundary off
 * the day the super admin actually picked.
 *
 * @param {Date} date
 * @returns {Date}
 */
function endOfUtcDay(date) {
  const end = new Date(date.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/** Midnight opening the calendar day a date falls on. @param {Date} date @returns {Date} */
function startOfUtcDay(date) {
  const start = new Date(date.getTime());
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

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
  
  // Standardize the player's selected apparatuses into a flat array
  let selectedApparatuses = [];
  if (typeof player?.apparatus === 'string') {
    selectedApparatuses.push(player.apparatus);
  } else if (Array.isArray(player?.apparatus)) {
    selectedApparatuses = player.apparatus;
  } else if (player?.apparatus && typeof player.apparatus === 'object') {
    Object.values(player.apparatus).forEach(apps => {
      if (Array.isArray(apps)) selectedApparatuses.push(...apps);
      else if (typeof apps === 'string') selectedApparatuses.push(apps);
    });
  }
  
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
  calculateTeamPaymentAmount,
  calculatePlayerAdditionAmount,
  calculatePlayerFee,
  resolveFeeWindow,
  getLateFeePerPlayer,
  assertPaymentWindowOpen,
  getPaymentConfig,
};
