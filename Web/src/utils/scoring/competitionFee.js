/**
 * Fee maths, mirroring `Server/src/config/payment.config.js`.
 *
 * The mirror is deliberate — the coach must be quoted a total before any
 * request is made, and the server is the one that charges it — but the two
 * files have to move together, exactly like the COP tables. A drift here means
 * a coach agrees to one number and Razorpay asks for another, which the server
 * then rejects as an amount mismatch AFTER their money has moved.
 */

/** The four states a competition's fee window can be in at a given instant. */
export const FEE_PHASE = {
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
 * The last millisecond of the calendar day a date falls on.
 *
 * UTC, because that is how the dates are stored — an `<input type="date">`
 * sends `YYYY-MM-DD`, which is read as UTC midnight on both stacks. Using the
 * browser's local day here would move the deadline for anyone not on UTC, and
 * the server would disagree.
 *
 * @param {Date} date @returns {Date}
 */
function endOfUtcDay(date) {
  const end = new Date(date.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/** @param {Date} date @returns {Date} */
function startOfUtcDay(date) {
  const start = new Date(date.getTime());
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/**
 * Which fee phase a payment made at `at` falls into.
 *
 * A missing date disables its own edge and nothing else, so a competition
 * created before this feature reads as permanently `regular`.
 *
 * @param {Object} competition
 * @param {Date} [at]
 * @returns {{
 *   phase: string, isLate: boolean, canPay: boolean, lateFeePerPlayer: number,
 *   opensAt: Date | null, dueBy: Date | null, closesAt: Date | null
 * }}
 */
export function resolveFeeWindow(competition, at = new Date()) {
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
 * @param {Object} competition @param {Date} [at] @returns {number} INR
 */
export function getLateFeePerPlayer(competition, at = new Date()) {
  return resolveFeeWindow(competition, at).lateFeePerPlayer;
}

/**
 * A fee-window date as a plain readable day, for labels.
 * @param {unknown} value @returns {string}
 */
export function formatFeeWindowDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  // Read back in UTC so the label names the day that was picked, not the day it
  // happens to be where the browser is standing.
  return date.toLocaleDateString(undefined, {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Per-player fee stored on each competition document (INR, no separate base fee).
 * @param {unknown} competitionLike - object with optional `playerFee`
 * @returns {number | null} rupees, or null if missing/invalid
 */
export function getCompetitionPlayerFeeRupees(competitionLike) {
  if (competitionLike == null) return null;
  if (!Object.prototype.hasOwnProperty.call(competitionLike, 'playerFee')) return null;
  const raw = competitionLike.playerFee;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Calculate fee for a single player based on their selected apparatuses.
 * @param {Object} player - The player registration object
 * @param {Object} competition - The competition document
 * @returns {number} INR
 */
export function calculatePlayerFee(player, competition) {
  const baseFee = getCompetitionPlayerFeeRupees(competition) || 0;
  
  if (!competition) return baseFee;

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
  const uniqueApparatuses = new Set(selectedApparatuses);
  
  for (const app of uniqueApparatuses) {
    let appFees = competition.apparatusFees;
    
    if (appFees && appFees[app] !== undefined && appFees[app] !== null) {
      const addonFee = Number(appFees[app]);
      if (Number.isFinite(addonFee)) {
        totalFee += addonFee;
      }
    }
  }
  
  return totalFee;
}

/**
 * Total for team submission, including the per-player late fee when `at` falls
 * after the competition's fee deadline.
 *
 * The late fee is charged PER PLAYER, beside the base fee and apparatus add-ons
 * it belongs to — a 70-athlete squad paying late owes 70 penalties, not one.
 *
 * @param {Array} players - Array of players registered
 * @param {Object} competition - The competition object
 * @param {Date} [at] - when the payment is being made; decides the fee phase
 * @returns {number} Total INR
 */
export function calculateTeamPaymentAmount(players, competition, at = new Date()) {
  if (!players || !Array.isArray(players) || players.length === 0) return 0;

  const lateFee = getLateFeePerPlayer(competition, at);

  let total = 0;
  for (const player of players) {
    total += calculatePlayerFee(player, competition) + lateFee;
  }
  return total;
}
