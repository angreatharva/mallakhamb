/**
 * How far has a meet actually got?
 *
 *   node scripts/meetStatus.js
 *   node scripts/meetStatus.js --place=Mumbai
 *   node scripts/meetStatus.js --incomplete    # only what still needs work
 *
 * The scoring run takes hours and drives a browser, so it fails for reasons that
 * have nothing to do with the product — a laptop suspending mid-run reports
 * `ERR_NETWORK_IO_SUSPENDED` and a test that apparently took 5.9 hours. Reading
 * the Playwright output to work out what actually landed is guesswork.
 *
 * This asks the database instead. It reports, per category, how many athletes
 * are entered, how many the Senior Judge has finalized, and whether the Scorer
 * has locked the sheet — the two gates a result passes before it is published.
 *
 * The distinction matters when deciding what to re-run: a category with every
 * athlete finalized but nothing locked needs only the Scorer's pass, not the
 * whole panel again.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const Competition = require('../src/models/Competition');
const Score = require('../src/models/Score');
const { resolveFeeWindow } = require('../src/config/payment.config');

/** @param {string[]} argv */
function parseArgs(argv) {
  const flag = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    place: flag('place'),
    incompleteOnly: argv.includes('--incomplete'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`\nDatabase: ${mongoose.connection.name}\n`);

  const query = { isDeleted: { $ne: true } };
  if (args.place) query.place = args.place;
  const competitions = await Competition.find(query).lean();

  if (competitions.length === 0) {
    console.log('  No competitions found.');
    await mongoose.disconnect();
    return;
  }

  for (const competition of competitions) {
    const entered = (competition.registeredTeams || []).filter((rt) => rt.isActive !== false);
    const submitted = entered.filter((rt) => rt.isSubmitted === true);
    const athletes = entered.reduce((sum, rt) => sum + (rt.players || []).length, 0);

    console.log(`${competition.name} — ${competition.place} ${competition.year}  [${competition.status}]`);
    console.log(`  teams entered: ${entered.length}   submitted (and payable): ${submitted.length}`
      + `   athletes: ${athletes}`);

    /*
     * What a coach would be charged if they paid right now.
     *
     * The manual payment step is where a seeded meet most often stalls, and
     * "registration has not opened yet" from the UI is otherwise indistinguishable
     * from a broken page. Resolved through the same helper the server charges
     * with, so this cannot quietly disagree with it.
     */
    const feeWindow = resolveFeeWindow(competition);
    const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '—');
    const phaseLine = {
      not_open: `  fees: NOT OPEN until ${day(feeWindow.opensAt)} — a coach cannot pay yet`,
      regular: `  fees: base only (₹${competition.playerFee ?? '—'}/athlete)`
        + (feeWindow.dueBy ? `, until ${day(feeWindow.dueBy)}` : ''),
      late: `  fees: LATE — +₹${feeWindow.lateFeePerPlayer}/athlete on top of the base,`
        + ` until ${day(feeWindow.closesAt)}`,
      closed: `  fees: CLOSED since ${day(feeWindow.closesAt)} — no further payment is accepted`,
    }[feeWindow.phase];
    console.log(phaseLine);

    if (submitted.length < entered.length) {
      // The single most common reason a judge sees nothing: entry is not the
      // same as submission, and only a submitted team reaches a panel.
      console.log(`  ! ${entered.length - submitted.length} team(s) entered but NOT submitted — `
        + 'a judge cannot see them until the coach submits and pays.');
    }

    const scores = await Score.find({ competition: competition._id })
      .select('gender ageGroup competitionType isLocked playerScores.isFinalized')
      .lean();

    if (scores.length === 0) {
      console.log('  no scoring has started\n');
      continue;
    }

    const byCategory = new Map();
    for (const score of scores) {
      const key = `${score.competitionType} | ${score.gender} ${score.ageGroup}`;
      const row = byCategory.get(key) || { rows: 0, finalized: 0, docs: 0, locked: 0 };
      row.docs += 1;
      if (score.isLocked) row.locked += 1;
      for (const playerScore of score.playerScores || []) {
        row.rows += 1;
        if (playerScore.isFinalized) row.finalized += 1;
      }
      byCategory.set(key, row);
    }

    const rows = [...byCategory.entries()]
      .map(([category, value]) => ({
        category,
        ...value,
        // Judged = the Senior Judge has signed off every athlete.
        // Published = the Scorer has also locked every sheet.
        judged: value.rows > 0 && value.finalized === value.rows,
        published: value.rows > 0 && value.finalized === value.rows && value.locked === value.docs,
      }))
      .sort((a, b) => a.category.localeCompare(b.category));

    const shown = args.incompleteOnly ? rows.filter((r) => !r.published) : rows;

    if (shown.length) {
      console.log(`\n  ${'category'.padEnd(36)}${'athletes'.padStart(9)}${'judged'.padStart(8)}${'locked'.padStart(8)}   state`);
      console.log(`  ${'-'.repeat(76)}`);
      for (const row of shown) {
        const state = row.published ? 'published'
          : row.judged ? 'JUDGED — needs the Scorer to lock'
            : row.finalized === 0 ? 'NOT STARTED'
              : `PARTIAL — ${row.rows - row.finalized} athlete(s) left`;
        console.log(
          `  ${row.category.padEnd(36)}${String(row.rows).padStart(9)}`
          + `${String(row.finalized).padStart(8)}${`${row.locked}/${row.docs}`.padStart(8)}   ${state}`
        );
      }
    }

    const incomplete = rows.filter((r) => !r.published);
    console.log(`\n  ${rows.length - incomplete.length}/${rows.length} categories published.`);

    if (incomplete.length) {
      console.log('\n  Re-run just what is unfinished (Web/):');
      for (const row of incomplete) {
        // `--grep` takes a regex; `·` and `|` are literal in the test titles, so
        // the category is rebuilt in the shape score-all.spec.js names them.
        const [type, rest] = row.category.split(' | ');
        console.log(`    npx playwright test e2e/score-all.spec.js --workers=1 --grep "${type} . ${rest}"`);
      }
    }
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`\nFailed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
