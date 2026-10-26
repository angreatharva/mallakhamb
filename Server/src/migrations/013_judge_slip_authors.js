/**
 * 013 — Who wrote each judge slip.
 *
 * A slip names a seat (`judgeRole: 'J2'`), not a person, and seats change hands
 * between meets. From this release every slip is stamped with the JudgeAccount
 * that submitted it ('recorded'). This back-fills the slips written before
 * that, from the seat assignments as they stand today, and marks them
 * 'inferred' — so the authorship is frozen now, before seats are re-assigned
 * and the guess gets worse. The Judge fairness views show inferred marks but
 * never flag a judge on them.
 *
 * Writes address each slip by its own `_id` through arrayFilters, never by
 * array position, so a panel scoring while this runs cannot have a stamp land
 * on the wrong athlete. Only slips with no author are touched; a re-run is a
 * no-op.
 */

const mongoose = require('mongoose');
const Score = require('../models/Score');
const Judge = require('../models/Judge');
const { buildSeatIndex, seatHolder } = require('../utils/stats/slip-attribution.util');

const BATCH = 500;

async function up() {
  const seats = await Judge.collection
    .find({ judgeAccount: { $type: 'objectId' } }, {
      projection: { competition: 1, gender: 1, ageGroup: 1, apparatus: 1, judgeType: 1, judgeAccount: 1 },
    })
    .toArray();
  const seatIndex = buildSeatIndex(seats);
  if (seatIndex.size === 0) return;

  const cursor = Score.collection.find(
    { 'playerScores.judgeSlips': { $elemMatch: { $or: [{ judgeAccountId: null }, { judgeAccountId: { $exists: false } }] } } },
    { projection: { competition: 1, gender: 1, ageGroup: 1, 'playerScores._id': 1, 'playerScores.apparatus': 1, 'playerScores.judgeSlips._id': 1, 'playerScores.judgeSlips.judgeRole': 1, 'playerScores.judgeSlips.judgeAccountId': 1 } }
  );

  let writes = [];
  const flush = async () => {
    if (writes.length) await Score.collection.bulkWrite(writes, { ordered: false });
    writes = [];
  };

  for await (const doc of cursor) {
    for (const row of doc.playerScores || []) {
      for (const slip of row.judgeSlips || []) {
        if (slip.judgeAccountId || !slip._id || !row._id) continue;
        const author = seatHolder(seatIndex, {
          competition: doc.competition,
          gender: doc.gender,
          ageGroup: doc.ageGroup,
          apparatus: row.apparatus,
          judgeRole: slip.judgeRole,
        });
        if (!author) continue;
        writes.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                'playerScores.$[p].judgeSlips.$[s].judgeAccountId': new mongoose.Types.ObjectId(author),
                'playerScores.$[p].judgeSlips.$[s].attribution': 'inferred',
              },
            },
            arrayFilters: [{ 'p._id': row._id }, { 's._id': slip._id, 's.judgeAccountId': null }],
          },
        });
        if (writes.length >= BATCH) await flush();
      }
    }
  }
  await flush();
}

/** Remove the inferred authors; recorded ones were written by the app and stay. */
async function down() {
  await Score.collection.updateMany(
    { 'playerScores.judgeSlips.attribution': 'inferred' },
    {
      $set: {
        'playerScores.$[].judgeSlips.$[s].judgeAccountId': null,
        'playerScores.$[].judgeSlips.$[s].attribution': null,
      },
    },
    { arrayFilters: [{ 's.attribution': 'inferred' }] }
  );
}

module.exports = { up, down };
