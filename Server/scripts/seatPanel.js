// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Seat ONE judging panel through the real admin API.
 *
 *   SEED_ADMIN_PASSWORD=... node scripts/seatPanel.js \
 *     --gender=Female --ageGroup=Above16 --place=Mumbai \
 *     --seat="Senior Judge=ravi.g@gmail.com" --seat="Judge 1=vinayak.d@gmail.com" \
 *     --seat="Judge 2=yatin.n@gmail.com" --seat="Scorer=preetesh.g@gmail.com"
 *
 * The repair tool. `seatPanels.js` stands a whole meet up from the frozen plan
 * and is what you want nine times out of ten; this is for the tenth — one
 * category, seats named on the command line, no plan involved.
 *
 * Deliberately goes through POST /admin/judges/bulk rather than writing Judge
 * documents directly. That endpoint is where the rules live — the required
 * seats, the one-person-one-seat check, the competition scoping — and a script
 * that wrote the documents itself would be free to create a panel the app would
 * have refused.
 *
 * Requires the API to be running, and an admin account (scripts/createAdmin.js).
 */

const { SLOT_NO, call, signInAsAdmin, findCompetition, resolveSeatAccounts } = require('./lib/admin-api');

function parseArgs(argv) {
  const value = (name) => {
    const found = argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : undefined;
  };

  const seats = argv
    .filter((a) => a.startsWith('--seat='))
    .map((a) => {
      const [judgeType, email] = a.slice('--seat='.length).split('=');
      if (!judgeType || !email) throw new Error(`Bad --seat="${a}"; expected "Judge 1=someone@example.com"`);
      if (!(judgeType in SLOT_NO)) {
        throw new Error(`Unknown seat "${judgeType}". Known: ${Object.keys(SLOT_NO).join(', ')}`);
      }
      return [judgeType.trim(), email.trim().toLowerCase()];
    });

  if (seats.length === 0) throw new Error('No --seat= given; nothing to seat.');

  return {
    gender: value('gender'),
    ageGroup: value('ageGroup'),
    competitionType: value('competitionType') || 'competition_1',
    place: value('place'),
    apparatus: value('apparatus') || null,
    seats: Object.fromEntries(seats),
  };
}

async function seatPanel() {
  const { gender, ageGroup, competitionType, place, apparatus, seats } = parseArgs(process.argv.slice(2));

  const csrfToken = await signInAsAdmin('seatPanel.js --gender=… --seat=…');

  const competition = await findCompetition(place);
  console.log(`🏆 ${competition.name} — ${competition.place}`);

  const accountId = await resolveSeatAccounts(seats);
  const judges = Object.keys(seats).map((judgeType) => ({
    judgeNo: SLOT_NO[judgeType],
    judgeType,
    judgeAccount: accountId[judgeType],
  }));

  // The admin routes run behind validateCompetitionContext, which reads the
  // meet from the token, the X-Competition-Id header, or the body. An admin
  // signing in through the UI picks one; a script has to say which.
  const result = await call('/admin/judges/bulk', {
    method: 'POST',
    csrfToken,
    competitionId: competition._id,
    body: {
      gender,
      ageGroup,
      competitionTypes: [competitionType],
      apparatus,
      competition: competition._id,
      judges,
    },
  });

  const { created = [], updated = [], errors = [] } = result.data || {};
  console.log(`\n📋 ${gender} ${ageGroup} · ${competitionType}${apparatus ? ` · ${apparatus}` : ''}`);
  console.table(Object.entries(seats).map(([judgeType, email]) => ({ seat: judgeType, judge: email })));
  console.log(`${created.length} created, ${updated.length} updated, ${errors.length} failed`);
  if (errors.length > 0) {
    console.table(errors);
    process.exit(1);
  }
  console.log('\nRecord it into the seed so it can be rebuilt elsewhere:');
  console.log('  npm --prefix Server run seed:capture');
}

seatPanel().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
