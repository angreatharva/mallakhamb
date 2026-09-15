// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Seat every panel the meet needs, from the frozen plan, through the admin API.
 *
 *   SEED_ADMIN_PASSWORD=... node scripts/seatPanels.js
 *   SEED_ADMIN_PASSWORD=... node scripts/seatPanels.js --place=Mumbai --dry-run
 *   SEED_ADMIN_PASSWORD=... node scripts/seatPanels.js --only=Male/Under10
 *   SEED_ADMIN_PASSWORD=... node scripts/seatPanels.js --apparatus="Rope Mallakhamb"
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
 * `{gender, ageGroup, apparatus, judgeNo, competition}` and
 * `{gender, ageGroup, apparatus, judgeType, competition}`, and NEITHER includes
 * `competitionTypes`. One meet therefore holds one panel per
 * (gender, ageGroup, APPARATUS) no matter how many competition types run on it,
 * and seating a "second panel" for Competition II collides with the first.
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
 * APPARATUS IS THE OTHER AXIS, AND IT IS NOT LIKE COMPETITION TYPE.
 *
 * It IS in both unique keys, so Pole and Rope in one category are two separate
 * panels — seated in full, one pass each, not merged into an array on one seat.
 * That is what makes a category with three apparatus three times the seats.
 *
 * WHICH apparatus is not this script's decision and is not in the plan: it is
 * read from the MEET's `apparatusConfig` for each competition type, so seeding
 * follows whatever the competition was created to run. `--apparatus=` narrows
 * it for a repair run.
 *
 * The plan's SIZE is per category and applies to every apparatus in it. A meet
 * wanting Pole judged by three and Rope by five is legal — nothing here or in
 * the schema forbids it — but it is not something to draw at random, so
 * `seatPanel.js` is the tool for it.
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
const { readPlan, seatsFor } = require('./lib/panel-plan');

function parseArgs(argv) {
  const value = (name) => {
    const found = argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : undefined;
  };
  return {
    place: value('place'),
    only: value('only'), // e.g. --only=Male/Under10
    apparatus: value('apparatus'), // e.g. --apparatus="Rope Mallakhamb"
    dryRun: argv.includes('--dry-run'),
  };
}

/**
 * The apparatus the meet runs for one competition type.
 *
 * Read from the competition rather than from the plan or a constant: a panel
 * seated for an apparatus the meet does not run can never judge anybody, and a
 * meet that runs one this script did not know about goes unstaffed.
 *
 * `apparatusConfig` arrives from the API as a plain object keyed by
 * competition-type slug. A meet declaring none is a real state — a competition
 * created before the field was filled in — and the seats it wants are the
 * legacy category-wide ones, which `null` still means.
 *
 * @param {Object} competition
 * @param {string} competitionType
 * @param {string} [only] - `--apparatus=`, narrowing to one
 * @returns {Array<string|null>} one entry per panel to seat
 */
function apparatusFor(competition, competitionType, only) {
  const configured = competition.apparatusConfig?.[competitionType];
  const list = Array.isArray(configured) ? configured.filter(Boolean) : [];

  if (list.length === 0) return [null];

  if (only) {
    if (!list.includes(only)) {
      throw new Error(
        `--apparatus="${only}" is not run by this meet for ${competitionType}. ` +
        `It runs: ${list.join(', ')}`
      );
    }
    return [only];
  }

  return list;
}

/**
 * Seats currently standing in the way of ONE panel.
 *
 * Asked without a competitionTypes filter on purpose: the question is "who is
 * physically in this slot", and a seat carrying only `competition_1` is still
 * occupying the slot a `competition_2` seating would collide with.
 *
 * Asked WITH an apparatus filter for the opposite reason. Apparatus is in the
 * unique keys, so the Pole and Rope seats are different slots that do not
 * collide, and folding them together would have this vacate one to make room
 * for the other.
 *
 * A LIST, not a map keyed by seat name, because the server answers an apparatus
 * filter with that apparatus's seats PLUS any legacy category-wide ones — so
 * "Senior Judge" legitimately comes back twice while a meet is part-way through
 * being re-seated, and a map would silently discard one of them.
 *
 * `null` apparatus means the meet declares none, so there is one panel per
 * category and no filter to apply.
 *
 * @returns {Promise<Array<{id: string, judgeType: string, accountId: string, types: string[], apparatus: string|null}>>}
 */
async function seatedIn(competition, { gender, ageGroup }, apparatus = null) {
  const query = new URLSearchParams({ gender, ageGroup, competition: competition._id });
  if (apparatus) query.set('apparatus', apparatus);
  const response = await call(`/admin/judges?${query}`, { competitionId: competition._id });
  // `data` is the seat array itself, not an envelope around one.
  const rows = response.data || [];

  return rows
    .filter((row) => row.judgeAccount) // an empty slot occupies nothing
    .map((row) => ({
      id: row._id,
      judgeType: row.judgeType,
      accountId: String(row.judgeAccount?._id || row.judgeAccount),
      types: row.competitionTypes || [],
      apparatus: row.apparatus || null,
    }));
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

async function seatAll() {
  const { place, only, apparatus: apparatusOnly, dryRun } = parseArgs(process.argv.slice(2));
  const plan = readPlan();
  const meetPlace = place || plan.place;

  for (const seat of REQUIRED_SEATS) {
    if (!plan.seats[seat]) throw new Error(`The plan is missing the required seat "${seat}"`);
  }

  const csrfToken = await signInAsAdmin('seatPanels.js');

  const competition = await findCompetition(meetPlace);
  console.log(`🏆 ${competition.name} — ${competition.place} ${competition.year}`);
  console.log(`📋 Plan drawn ${plan.generatedAt} (seed ${plan.seed})\n`);

  const accountId = await resolveSeatAccounts(plan.seats);
  for (const [seat, email] of Object.entries(plan.seats)) {
    console.log(`   ${seat.padEnd(13)} ${email}`);
  }
  console.log();

  const wanted = only
    ? plan.panels.filter((p) => `${p.gender}/${p.ageGroup}` === only)
    : plan.panels;
  if (wanted.length === 0) throw new Error(`--only=${only} matched no panel in the plan`);

  /*
   * Which apparatus a panel is needed for, per competition type.
   *
   * Per type because a meet may run Competition I on Pole alone and
   * Competition III on all three; the union is every panel to seat in a
   * category, and each one is then widened only for the types that run it.
   *
   * A property of the MEET, not of the category, so it is resolved once.
   */
  const apparatusByType = new Map(
    plan.competitionTypes.map((ct) => [ct, apparatusFor(competition, ct, apparatusOnly)])
  );
  const panelApparatus = [...new Set([...apparatusByType.values()].flat())];
  console.log(
    `🤸 Apparatus: ${panelApparatus.map((a) => a || '(none declared — one panel per category)').join(', ')}\n`
  );

  const summary = [];
  let failed = 0;

  for (const panel of wanted) {
    const categoryLabel = `${panel.gender} ${panel.ageGroup}`;
    const seats = seatsFor(panel.size);
    const judges = seats.map((judgeType) => ({
      judgeNo: SLOT_NO[judgeType],
      judgeType,
      judgeAccount: accountId[judgeType],
    }));

    for (const apparatus of panelApparatus) {
      // `null` is the meet-declares-none case: one panel for the whole
      // category, which is what a seat with no apparatus has always meant.
      const label = apparatus ? `${categoryLabel} · ${apparatus}` : categoryLabel;

      if (dryRun) {
        summary.push({ panel: label, seats: panel.size, result: 'dry-run' });
        continue;
      }

      try {
        // ── Vacate what the plan no longer wants, before seating ────────────
        //
        // First, because a shrink that ran afterwards could undo the seating it
        // was supposed to follow, and because a person moved between seats needs
        // their old one empty before the one-person-one-seat check will let them
        // take the new one.
        const staffed = await seatedIn(competition, panel, apparatus);
        let vacated = 0;
        for (const seat of staffed) {
          /*
           * Two reasons to empty a seat, and the second is an upgrade path.
           *
           * 1. The plan no longer wants this role — a Judge 4 left over from
           *    when the category was drawn as a 5.
           * 2. It is a LEGACY category-wide seat (`apparatus: null`) and we are
           *    seating a named panel over the top of it. It has to go BEFORE the
           *    named seat is written, not after: it covers every apparatus, so
           *    `assertNotAlreadyOnPanel` sees the same person already on this
           *    panel and refuses the new seat outright. Left in place it would
           *    also be a second row for one role, and the panel size is a count
           *    of rows.
           */
          const supplanted = !!apparatus && !seat.apparatus;
          if (seats.includes(seat.judgeType) && !supplanted) continue;
          await vacate(seat.id, csrfToken, competition._id);
          vacated += 1;
          console.log(
            `   − ${label}: vacated ${seat.judgeType}` +
            `${supplanted ? ' (category-wide seat, superseded)' : ''}`
          );
        }

        // ── Seat the plan, once per competition type ────────────────────────
        //
        // The passes write the SAME seats; each after the first only widens
        // `competitionTypes`. See the header on why that is one panel, not two.
        let created = 0;
        let updated = 0;
        for (const [competitionType, list] of apparatusByType) {
          if (!list.includes(apparatus)) continue;

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
              // The panel's own apparatus, from the meet's `apparatusConfig`.
              // It is part of the seat's identity — Pole and Rope here are two
              // panels, not one panel with two labels.
              apparatus,
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
  }

  console.log('\n📋 Panels');
  console.table(summary);

  // Counted per PANEL, not per category: one category running three apparatus
  // is three panels of that size, and the totals should say so.
  const bySize = wanted.reduce(
    (acc, p) => ({ ...acc, [p.size]: (acc[p.size] || 0) + panelApparatus.length }),
    {}
  );
  console.log(`Panel sizes: ${Object.entries(bySize).sort().map(([s, n]) => `${n}×${s}-judge`).join(', ')}`);

  if (failed > 0) process.exit(1);

  console.log('\nRecord it into the seed so it can be rebuilt elsewhere:');
  console.log('  npm --prefix Server run seed:capture');
}

seatAll().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
