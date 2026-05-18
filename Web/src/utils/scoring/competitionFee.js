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
