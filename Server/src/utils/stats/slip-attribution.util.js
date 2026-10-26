/**
 * Slip Attribution
 *
 * Which JudgeAccount wrote a slip. A slip names a SEAT (`judgeRole: 'J2'`); the
 * person is the account seated there. New slips carry `judgeAccountId`
 * ('recorded') from the moment they are submitted. Older slips do not, and are
 * resolved from the seat assignment ('inferred') — first frozen by migration
 * 013, and at read time for anything the migration could not place.
 *
 * Inferred authorship is a best guess (a seat may have changed hands), so the
 * fairness views show it but never FLAG a judge on it.
 */

const { apparatusKey } = require('../../config/cop-rules');
const { SEAT_BY_ROLE } = require('../scoring/slip-breakdown.util');

const ANY_APPARATUS = '*';

const idOf = (value) => (value && value._id ? String(value._id) : value ? String(value) : '');

/**
 * The lookup key of one panel seat. A seat saved before panels were
 * per-apparatus has no apparatus and covers all of them.
 */
function seatKey({ competition, gender, ageGroup, apparatus, judgeType }) {
  const app = apparatus ? apparatusKey(apparatus) : ANY_APPARATUS;
  return [idOf(competition), gender || '', ageGroup || '', app, judgeType || ''].join('|');
}

/**
 * Index seat assignments (Judge documents) by seat key.
 * @param {Array<Object>} seats - Judge documents with `judgeAccount`
 * @returns {Map<string, string>} seat key → JudgeAccount id
 */
function buildSeatIndex(seats = []) {
  const index = new Map();
  for (const seat of seats || []) {
    const account = idOf(seat?.judgeAccount);
    if (!account) continue;
    index.set(seatKey(seat), account);
  }
  return index;
}

/**
 * The account seated for one slip, from the seat index.
 * @returns {string|null}
 */
function seatHolder(seatIndex, { competition, gender, ageGroup, apparatus, judgeRole }) {
  const judgeType = SEAT_BY_ROLE[judgeRole];
  if (!judgeType) return null;
  const exact = seatIndex.get(seatKey({ competition, gender, ageGroup, apparatus, judgeType }));
  if (exact) return exact;
  return seatIndex.get(seatKey({ competition, gender, ageGroup, apparatus: null, judgeType })) || null;
}

/**
 * Who wrote this slip, and how sure we are.
 *
 * @param {Object} params
 * @param {Object} params.doc - the Score document (competition, gender, ageGroup)
 * @param {Object} params.row - the playerScores row (apparatus)
 * @param {Object} params.slip - the judge slip
 * @param {Map<string,string>} [params.seatIndex]
 * @returns {{accountId: string|null, attribution: 'recorded'|'inferred'|null}}
 */
function resolveSlipAuthor({ doc, row, slip, seatIndex }) {
  if (slip?.judgeAccountId) {
    return {
      accountId: idOf(slip.judgeAccountId),
      attribution: slip.attribution === 'inferred' ? 'inferred' : 'recorded',
    };
  }
  if (!seatIndex) return { accountId: null, attribution: null };
  const accountId = seatHolder(seatIndex, {
    competition: doc.competition,
    gender: doc.gender,
    ageGroup: doc.ageGroup,
    apparatus: row.apparatus,
    judgeRole: slip?.judgeRole,
  });
  return { accountId, attribution: accountId ? 'inferred' : null };
}

module.exports = {
  ANY_APPARATUS,
  seatKey,
  buildSeatIndex,
  seatHolder,
  resolveSlipAuthor,
};
