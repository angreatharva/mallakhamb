/**
 * Panel seats — every `Judge.judgeType`, with the seat number each one takes.
 *
 * Read by the Judge model (enum) and the admin validators, which each used to
 * spell the list out. The web client's Manage Judges slots
 * (Web/src/pages/admin/AdminJudges.jsx) and the seed's SLOT_NO
 * (scripts/lib/admin-api.js) use the same numbers.
 *
 * Only the first five EVALUATE (see utils/scoring/judge-slip.util). The other
 * two record for the panel and are never counted in its size:
 *   Scorer       — fills the score sheet and locks it.
 *   Time Keeper  — times each performance; the stopped time is relayed to the
 *                  Scorer's sheet over the scoring room (socket `time_record`).
 *
 * The Time Keeper is seat 7, not 6. It was seat 6 once, with the Scorer on 7;
 * when it was removed the Scorer moved to 6, and the Judge model still
 * normalises a legacy Scorer on 7 back to 6. Seat 7 keeps the two apart.
 *
 * @module config/judge-seats
 */

const SEAT_NO = Object.freeze({
  'Senior Judge': 1,
  'Judge 1': 2,
  'Judge 2': 3,
  'Judge 3': 4,
  'Judge 4': 5,
  Scorer: 6,
  'Time Keeper': 7,
});

/** Every seat type, in seat order. */
const JUDGE_SEAT_TYPES = Object.freeze(Object.keys(SEAT_NO));

/** The highest seat number a panel can hold. */
const MAX_SEAT_NO = Math.max(...Object.values(SEAT_NO));

module.exports = { SEAT_NO, JUDGE_SEAT_TYPES, MAX_SEAT_NO };
