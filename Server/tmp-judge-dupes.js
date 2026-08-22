/**
 * TEMPORARY read-only diagnostic. Writes nothing. Delete after running.
 *
 * Migration 001 failed building the unique index {username, competition} on
 * judges. This shows whether the colliding documents are DISTINCT ASSIGNMENTS
 * (one person judging several categories in one meet — legitimate, and the
 * index is wrong) or genuine accidental duplicates (the data is wrong).
 */

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const judges = mongoose.connection.db.collection('judges');

  const groups = await judges
    .aggregate([
      { $match: { username: { $nin: [null, ''] } } },
      {
        $group: {
          _id: { username: '$username', competition: '$competition' },
          n: { $sum: 1 },
          docs: {
            $push: {
              gender: '$gender',
              ageGroup: '$ageGroup',
              judgeNo: '$judgeNo',
              judgeType: '$judgeType',
              isActive: '$isActive',
            },
          },
        },
      },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();

  const total = await judges.countDocuments();
  console.log('\n=== judges collection ===');
  console.log('total documents:', total);
  console.log('colliding (username, competition) groups:', groups.length);

  let allDistinct = true;
  for (const g of groups.slice(0, 15)) {
    console.log(`\n  ${g._id.username}  x${g.n}   competition=${g._id.competition}`);
    const seen = new Set();
    for (const d of g.docs) {
      const slot = `${d.gender}|${d.ageGroup}|${d.judgeNo}|${d.judgeType}`;
      if (seen.has(slot)) allDistinct = false;
      seen.add(slot);
      console.log(
        `      ${String(d.gender).padEnd(7)} ${String(d.ageGroup).padEnd(9)} judgeNo=${String(d.judgeNo).padEnd(3)} ${String(d.judgeType).padEnd(14)} active=${d.isActive}`,
      );
    }
  }

  console.log('\n=== verdict ===');
  if (groups.length === 0) {
    console.log('No collisions. Something else changed since the failed run.');
  } else if (allDistinct) {
    console.log('Every collision is a DISTINCT assignment slot.');
    console.log('=> one person judging several categories in one meet.');
    console.log('=> the {username, competition} unique index is wrong, not the data.');
  } else {
    console.log('At least one collision repeats the SAME assignment slot.');
    console.log('=> genuine duplicate records exist; the data needs cleaning too.');
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error('failed:', e.message);
  process.exit(1);
});
