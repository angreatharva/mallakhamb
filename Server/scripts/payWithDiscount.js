#!/usr/bin/env node
/**
 * Final-submit and pay every seeded team, using the discount code.
 *
 *   node scripts/payWithDiscount.js                 # every registered team — 60 across 12 meets
 *   node scripts/payWithDiscount.js --level=state   # one level's 15
 *   node scripts/payWithDiscount.js --place=Mumbai  # one meet's 5
 *   node scripts/payWithDiscount.js --dry-run       # say what it would do
 *
 * THE GAP THIS CLOSES
 *
 * `setupAll.js` stops before payment and says so plainly: a team reaches a
 * judge only once the coach has final-submitted AND paid, the payment goes
 * through Razorpay, and no script should forge a signature — it would either be
 * rejected or prove the verification is not doing its job. That left the last
 * step of a full-meet seed to be done by hand, one coach at a time — sixty of
 * them across the twelve meets — before `seed:scores` could run at all.
 *
 * But a 100%-off discount code is not a forged payment. It is a shipped
 * product path — `POST /api/coaches/payments/discount/redeem`, which
 * `coach.service.redeemDiscountAndSubmit` handles by pricing the entry,
 * confirming the code, and marking the registration submitted and paid WITHOUT
 * creating a Razorpay order, precisely because there is nothing to charge. This
 * drives that endpoint, as each coach, over HTTP, through CSRF and the
 * competition context — the same request the browser makes.
 *
 * So it verifies rather than fakes: if submission or the discount path breaks,
 * this fails, where writing `paymentStatus: 'completed'` straight into Mongo
 * would happily paper over it.
 *
 * PREREQUISITES
 *
 *   - the API running          (npm --prefix Server start)
 *   - DISCOUNT_CODE_ENABLED=true and DISCOUNT_CODE set in .env
 *   - squads built             (npm --prefix Server run setup)
 *
 * Coach passwords follow the seed convention `<FirstName>@2026`
 * (Web/e2e/support/people.js `passwordFor`), so this only works against seeded
 * accounts — which is the only place it should ever be pointed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { ApiClient, DEFAULT_BASE } = require('./perf/lib/client');

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const DRY_RUN = argv.includes('--dry-run');
const PLACE = arg('place');
const LEVEL = arg('level');
const BASE_URL = arg('base') || process.env.PERF_BASE_URL || DEFAULT_BASE;

/** The seed convention. @param {string} firstName */
const passwordFor = (firstName) => `${firstName}@2026`;

async function main() {
  const code = process.env.DISCOUNT_CODE;
  if (process.env.DISCOUNT_CODE_ENABLED !== 'true' || !code) {
    console.error('DISCOUNT_CODE_ENABLED must be true and DISCOUNT_CODE must be set in .env.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  /*
   * Every entry at every meet unless narrowed. Sixty of them across the twelve
   * seeded meets, which is why `--level=` exists alongside `--place=`: paying a
   * level at a time is the same granularity the squad building uses.
   */
  const query = {
    isDeleted: { $ne: true },
    ...(PLACE ? { place: PLACE } : {}),
    ...(LEVEL ? { level: LEVEL } : {}),
  };
  const competitions = await db.collection('competitions')
    .find(query, { projection: { name: 1, place: 1, level: 1, registeredTeams: 1 } })
    .toArray();

  if (competitions.length === 0) {
    console.error(
      `No competitions matched${PLACE ? ` place="${PLACE}"` : ''}${LEVEL ? ` level="${LEVEL}"` : ''}.`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  /** One row per (competition, coach) that still needs submitting. */
  const work = [];
  for (const competition of competitions) {
    for (const registration of competition.registeredTeams || []) {
      const coach = await db.collection('coaches').findOne(
        { _id: registration.coach },
        { projection: { firstName: 1, lastName: 1, email: 1 } }
      );
      if (!coach) continue;

      work.push({
        competitionId: String(competition._id),
        place: competition.place,
        coach,
        athletes: (registration.players || []).length,
        alreadyDone: registration.isSubmitted === true && registration.paymentStatus === 'completed',
      });
    }
  }

  await mongoose.disconnect();

  if (work.length === 0) {
    console.log('No registered teams found. Run `npm run setup` first.');
    return;
  }

  console.log(`\nDiscount submission — ${BASE_URL}`);
  console.log(`  ${work.length} registration(s)${PLACE ? ` at ${PLACE}` : ''}\n`);

  let submitted = 0;
  let skipped = 0;
  const failures = [];

  for (const item of work) {
    const who = `${item.coach.firstName} ${item.coach.lastName}`.padEnd(18);
    const where = `${item.place}`.padEnd(8);

    if (item.alreadyDone) {
      console.log(`  skip   ${who} ${where} already submitted and paid`);
      skipped += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  would  ${who} ${where} submit ${item.athletes} athlete(s)`);
      continue;
    }

    const client = new ApiClient({ baseUrl: BASE_URL, label: item.coach.email });

    const login = await client.login('/api/coaches/login', {
      email: item.coach.email,
      password: passwordFor(item.coach.firstName),
    });
    if (!login.ok) {
      failures.push({ who, step: 'login', detail: login.body?.error?.message || login.status });
      console.log(`  FAIL   ${who} ${where} login ${login.status}`);
      continue;
    }

    // The endpoint runs behind validateCompetitionContext, which reads the meet
    // from the token, this header, the body or the query. A browser has picked
    // one; a script has to say which.
    client.competitionId = item.competitionId;

    const redeemed = await client.post(
      '/api/coaches/payments/discount/redeem',
      { discountCode: code }
    );

    if (!redeemed.ok) {
      failures.push({
        who,
        step: 'redeem',
        detail: redeemed.body?.error?.message || redeemed.body?.message || redeemed.status,
      });
      console.log(`  FAIL   ${who} ${where} redeem ${redeemed.status} — `
        + `${redeemed.body?.error?.message || redeemed.body?.message || ''}`);
      continue;
    }

    const paid = redeemed.body?.data;
    console.log(`  ok     ${who} ${where} ${item.athletes} athlete(s), `
      + `₹${paid?.originalAmount ?? '?'} waived`);
    submitted += 1;
  }

  console.log(`\n${DRY_RUN ? 'Would submit' : 'Submitted'}: ${submitted}`
    + `  ·  skipped: ${skipped}  ·  failed: ${failures.length}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  ${f.who} ${f.step}: ${f.detail}`));
    process.exit(1);
  }

  if (!DRY_RUN && submitted > 0) {
    console.log('\nNEXT — Part 2, the judging:\n  npm --prefix Server run seed:scores');
  }
}

main().catch(async (error) => {
  console.error('\nFailed:', error.message);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
