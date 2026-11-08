/**
 * The judge's seats at a meet, and the stored judge that goes with them.
 *
 * WHY THIS EXISTS (bug 2026-11-08). Both doors into a meet (the competition
 * chooser and the dashboard's meet switch) used to swap the token first and
 * learn the seats from a SECOND request. On slow venue data that request was
 * late or dropped, the phone saved an empty seat list with no role, and the
 * Senior Judge then saw no other judge's marks and "Edit my score" opened a
 * blank slip. It hit some iPhones and Androids and not others: timing, not
 * the browser.
 *
 * The rules, in order:
 *   1. The switch answer itself carries the seats (`assignments`): one answer,
 *      so the token and the seats can never disagree.
 *   2. An older server without them: fetch the list, with one retry.
 *   3. Still nothing: the seats already known (never an empty list over them).
 *
 * The server stays the authority either way: it resolves every scoring
 * request's seat itself, and the slip reads its seat off the panel
 * (useJudgePanelData). The stored list is a convenience, so it must never be
 * the thing that decides a judge has no seat.
 */
import { idOf } from './judgeCategoryOptions';

const atMeet = (seats, competitionId) => (Array.isArray(seats) ? seats : [])
  .filter((seat) => idOf(seat.competition) === String(competitionId))
  // Flattened to an id, the shape login stores and resolveJudgeSeat reads.
  .map((seat) => ({ ...seat, competition: String(competitionId) }));

/**
 * @param {object} args
 * @param {object} args.switchResult - `data.data` of PUT /judge/competition/:id/set
 * @param {string} args.competitionId
 * @param {object[]} [args.knownSeats] - seats already held on the device
 * @param {Function} [args.fetchAssignments] - judgeAPI.getAssignments
 * @returns {Promise<object[]>} this meet's seats
 */
export async function seatsForMeet({ switchResult, competitionId, knownSeats = [], fetchAssignments }) {
  const carried = atMeet(switchResult?.assignments, competitionId);
  if (carried.length > 0) return carried;

  if (fetchAssignments) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchAssignments();
        const fetched = atMeet(response?.data?.data, competitionId);
        if (fetched.length > 0) return fetched;
      } catch {
        // Retried once, then the known seats below.
      }
    }
  }
  return atMeet(knownSeats, competitionId);
}

/**
 * The stored judge for a meet: the account fields kept, the seat fields
 * re-derived from this meet's seats.
 * @param {object} user - the stored judge
 * @param {string} competitionId
 * @param {object[]} seats - from seatsForMeet
 */
export function judgeAtMeet(user, competitionId, seats) {
  const primary = seats[0] || null;
  return {
    ...(user || {}),
    competition: String(competitionId),
    judgeType: primary?.judgeType ?? null,
    judgeNo: primary?.judgeNo ?? null,
    gender: primary?.gender ?? null,
    ageGroup: primary?.ageGroup ?? null,
    competitionTypes: primary?.competitionTypes || [],
    allAssignments: seats,
  };
}
