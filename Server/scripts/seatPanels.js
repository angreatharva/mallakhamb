// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Seat every panel the meet needs, from the frozen plan, through the admin API.
 *
 *   SEED_ADMIN_PASSWORD=... node scripts/seatPanels.js
 *   SEED_ADMIN_PASSWORD=... node scripts/seatPanels.js --place=Mumbai --dry-run
 *   SEED_ADMIN_PASSWORD=... node scripts/seatPanels.js --only=Male/Under10
 *
 * The sizes come from `scripts/seed/panel-plan.json`, drawn once by
 * `planPanels.js`. Nothing here decides one — that separation is the point.
 * This is the non-browser path; `Web/e2e/seat-panels.spec.js` does the same job
 * through the admin screen, from the same plan.
 *
 * `seatPanel.js` seats ONE category from the command line and stays the right
 * tool for repairing a single panel by hand.
 *
 * WHAT A "COMPETITION II PANEL" ACTUALLY IS — the thing worth reading twice.
 *
 * There is no such document. Judge's unique indexes are
 * `{gender, ageGroup, judgeNo, competition}` and
 * `{gender, ageGroup, judgeType, competition}`, and NEITHER includes
 * `competitionTypes`. One meet therefore holds exactly one panel per
 * (gender, ageGroup) no matter how many competition types run on it, and
 * seating a "second panel" for Competition II collides with the first.
 *
 * `competitionTypes` is an array for this reason, and admin.service merges it
 * on update rather than replacing it. So Competition II is enabled by seating
 * the SAME seats again with `competition_2`, which turns `['competition_1']`
 * into `['competition_1', 'competition_2']`.
 *
 * Scores stay separate regardless: a Score document's identity is
 * `{teamId, gender, ageGroup, competition, competitionType}`, so one panel
 * judging both types writes two documents per team.
 *
 * IDEMPOTENT, AND IT SHRINKS AS WELL AS GROWS. A seat the plan wants is
 * created or updated in place; an evaluation seat the plan does NOT want — a
 * Judge 4 left over from when this category was a 5 — is vacated. Seating
 * alone would have made a re-plan a one-way ratchet upward, and a panel one
 * seat too wide is not a visible failure: it scores by the wrong method and
 * produces a believable number.
 *
 * Requires the API to be running, and an admin account (scripts/createAdmin.js).
 */

const {
  SLOT_NO,
  REQUIRED_SEATS,
  call,
  signInAsAdmin,
  findCompetition,
  resolveSeatAccounts,
} = require('./lib/admin-api');
const { readPlan, planForPlace, seatsFor } = require('./lib/panel-plan');

function parseArgs(argv) {
  const value = (name) => {
    const found = argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : undefined;
  };
  return {
    place: value('place'),
    only: value('only'), // e.g. --only=Male/Under10
    dryRun: argv.includes('--dry-run'),
  };
}

/**
 * Seats currently staffed in one category, by seat name.
 *
 * Asked without a competitionTypes filter on purpose: the question is "who is
 * physically in this slot", and a seat carrying only `competition_1` is still
 * occupying the slot a `competition_2` seating would collide with.
 *
 * @returns {Promise<Map<string, {id: string, accountId: string, types: string[]}>>}
 */
async function seatedIn(competition, { gender, ageGroup }) {
  const query = new URLSearchParams({ gender, ageGroup, competition: competition._id });
  const response = await call(`/admin/judges?${query}`, { competitionId: competition._id });
  // `data` is the seat array itself, not an envelope around one.
  const rows = response.data || [];

  const staffed = new Map();
  for (const row of rows) {
    const accountId = row.judgeAccount?._id || row.judgeAccount;
    if (!accountId) continue; // an empty slot occupies nothing
    staffed.set(row.judgeType, {
      id: row._id,
      accountId: String(accountId),
      types: row.competitionTypes || [],
    });
  }
  return staffed;
}

/**
 * Empty a seat the plan no longer wants.
 *
 * The same call the admin screen's Remove button makes. It empties the slot
 * rather than deleting the document — the slot is part of the panel's layout,
 * and the next plan may want somebody back in it.
 */
const vacate = (judgeId, csrfToken, competitionId) =>
  call(`/admin/judges/${judgeId}`, { method: 'DELETE', csrfToken, competitionId });

/**
 * Seat every panel at ONE meet.
 *
 * @param {Object} meetPlan - one entry from the plan's `meets`
 * @param {Object} plan - the whole plan, for competitionTypes and provenance
 * @param {string} csrfToken
 * @param {{only: string|null, dryRun: boolean}} options
 * @returns {Promise<number>} how many panels failed
 */
async function seatMeet(meetPlan, plan, csrfToken, { only, dryRun }) {
  for (const seat of REQUIRED_SEATS) {
    if (!meetPlan.seats[seat]) {
      throw new Error(`${meetPlan.place} is missing the required seat "${seat}"`);
    }
  }

  const competition = await findCompetition(meetPlan.place);
  console.log(`\n🏆 ${competition.name} — ${competition.place} ${competition.year} [${meetPlan.level}]`);

  const accountId = await resolveSeatAccounts(meetPlan.seats);
  for (const [seat, email] of Object.entries(meetPlan.seats)) {
    console.log(`   ${seat.padEnd(13)} ${email}`);
  }
  console.log();

  const wanted = only
    ? meetPlan.panels.filter((p) => `${p.gender}/${p.ageGroup}` === only)
    : meetPlan.panels;
  if (wanted.length === 0) throw new Error(`--only=${only} matched no panel in the plan`);

  const summary = [];
  let failed = 0;

  for (const panel of wanted) {
    const label = `${panel.gender} ${panel.ageGroup}`;
    const seats = seatsFor(panel.size);
    const judges = seats.map((judgeType) => ({
      judgeNo: SLOT_NO[judgeType],
      judgeType,
      judgeAccount: accountId[judgeType],
    }));

    if (dryRun) {
      summary.push({ panel: label, seats: panel.size, result: 'dry-run' });
      continue;
    }

    try {
      // ── Vacate what the plan no longer wants, before seating ──────────────
      //
      // First, because a shrink that ran afterwards could undo the seating it
      // was supposed to follow, and because a person moved between seats needs
      // their old one empty before the one-person-one-seat check will let them
      // take the new one.
      const staffed = await seatedIn(competition, panel);
      let vacated = 0;
      for (const [judgeType, seat] of staffed) {
        if (seats.includes(judgeType)) continue;
        await vacate(seat.id, csrfToken, competition._id);
        vacated += 1;
        console.log(`   − ${label}: vacated ${judgeType}`);
      }

      // ── Seat the plan, once per competition type ──────────────────────────
      //
      // The two passes write the SAME seats; the second only widens
      // `competitionTypes`. See the header on why that is one panel, not two.
      let created = 0;
      let updated = 0;
      for (const competitionType of plan.competitionTypes) {
        // The admin routes run behind validateCompetitionContext, which reads
        // the meet from the token, the X-Competition-Id header, or the body. An
        // admin signing in through the UI picks one; a script has to say which.
        const result = await call('/admin/judges/bulk', {
          method: 'POST',
          csrfToken,
          competitionId: competition._id,
          body: {
            gender: panel.gender,
            ageGroup: panel.ageGroup,
            competitionTypes: [competitionType],
            // One panel judges every apparatus in its category, and this is the
            // only shape a seat comes in — Manage Judges no longer asks for an
            // apparatus. The score sheet follows the ATHLETE's registration and
            // the judge picks what they are scoring on their own dashboard.
            apparatus: null,
            competition: competition._id,
            judges,
          },
        });

        const { created: made = [], updated: changed = [], errors = [] } = result.data || {};
        if (errors.length > 0) {
          console.error(`❌ ${label} · ${competitionType}`);
          console.table(errors.map((e) => ({ seat: e.judge?.judgeType, error: e.error })));
          throw new Error(`${errors.length} seat(s) refused`);
        }
        created += made.length;
        updated += changed.length;
      }

      summary.push({
        panel: label,
        seats: `${panel.size} + Scorer`,
        result: `${created} created, ${updated} updated${vacated ? `, ${vacated} vacated` : ''}`,
      });
      console.log(`✅ ${label} — ${panel.size} eval + Scorer`);
    } catch (error) {
      failed += 1;
      summary.push({ panel: label, seats: panel.size, result: `ERROR: ${error.message}` });
      console.error(`❌ ${label} — ${error.message}`);
    }
  }

  console.log(`\n📋 ${meetPlan.place} panels`);
  console.table(summary);

  const bySize = wanted.reduce((acc, p) => ({ ...acc, [p.size]: (acc[p.size] || 0) + 1 }), {});
  console.log(`Panel sizes: ${Object.entries(bySize).sort().map(([s, n]) => `${n}×${s}-judge`).join(', ')}`);

  return failed;
}

/**
 * Seat every planned meet, or just one with `--place=`.
 *
 * Signing in ONCE and reusing the token across all twelve: the admin routes
 * take the meet from the X-Competition-Id header rather than from the token's
 * claim, so one session seats them all. Signing in per meet would be twelve
 * bcrypt compares for nothing.
 *
 * One meet failing does not stop the others. Twelve meets is long enough that
 * aborting on the first failure would mean finding out about the second only
 * after fixing the first — the exit code still reports it.
 */
async function seatAll() {
  const { place, only, dryRun } = parseArgs(process.argv.slice(2));
  const plan = readPlan();

  const meets = place
    ? [planForPlace(plan, place)]
    : plan.meets;

  const csrfToken = await signInAsAdmin('seatPanels.js');

  console.log(`📋 Plan drawn ${plan.generatedAt} (seed ${plan.seed})`);
  console.log(`   Seating ${meets.length} meet(s): ${meets.map((m) => m.place).join(', ')}`);

  let failedPanels = 0;
  const failedMeets = [];

  for (const meetPlan of meets) {
    try {
      failedPanels += await seatMeet(meetPlan, plan, csrfToken, { only, dryRun });
    } catch (error) {
      failedMeets.push(meetPlan.place);
      console.error(`❌ ${meetPlan.place} — ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Seated ${meets.length - failedMeets.length} of ${meets.length} meet(s)`);
  if (failedMeets.length) console.log(`Failed: ${failedMeets.join(', ')}`);
  if (failedPanels) console.log(`${failedPanels} individual panel(s) refused`);

  if (failedPanels > 0 || failedMeets.length > 0) process.exit(1);

  console.log('\nRecord it into the seed so it can be rebuilt elsewhere:');
  console.log('  npm --prefix Server run seed:capture');
}

seatAll().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
