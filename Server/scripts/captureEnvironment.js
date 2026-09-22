// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

require('../src/models/Team');
require('../src/models/Coach');
require('../src/models/Player');
require('../src/models/JudgeAccount');
const Competition = require('../src/models/Competition');
const Judge = require('../src/models/Judge');

/**
 * Record the parts of a competition environment that no form ever posts as one
 * payload: the meets themselves, which teams entered them, who is in each
 * squad, and who sits on each judging panel.
 *
 *   npm --prefix Server run seed:capture
 *   npm --prefix Server run seed -- --commit      # replay it elsewhere
 *
 * Accounts alone are not a competition. `Web/e2e/register-*.spec.js` records
 * players, coaches, judges and teams; replaying only those gives you a database
 * full of people with nothing to judge — no meet, no entries, no age groups, no
 * panels. Everything this file adds is what turns that into an environment
 * somebody can actually score in.
 *
 * ── Why this one reads the DATABASE, when the rest of the seed replays forms ──
 *
 * The house rule (see Web/e2e/README.md) is that the seed replays what the UI
 * actually sent, because a seeder that restates fields by hand drifts silently
 * the moment a form changes. That rule still holds — and it is exactly why this
 * file does not restate anything either. It copies documents the app itself
 * wrote, verbatim, rather than describing what it thinks they contain.
 *
 * Capturing these four from forms is not available in the way it is for
 * registration:
 *
 *   - a panel is seated once and then refused ("Judges already exist. Use Judge
 *     List to edit"), so a capturing run cannot re-seat an existing panel, and
 *     every panel in a working environment is by definition already seated;
 *   - a squad is built one player at a time across a drag-and-drop dashboard,
 *     so the "payload" is dozens of separate posts;
 *   - a competition is created by an organiser, not by a repeatable flow.
 *
 * ── What does not travel ──
 *
 * ObjectIds mean nothing in the database this is replayed into, so every
 * reference is written as the natural key the app already uses to talk about
 * that thing: a competition is {name, place, year}, a team is its name, a
 * person is their email. That is the same trade the memberships section makes
 * (see Web/e2e/support/browser.js captureMembership), for the same reason.
 *
 * `createdBy` is dropped for the same reason and not replaced: it points at
 * whichever admin happened to create the meet, and inventing one on replay
 * would be a lie about who did.
 */

const CAPTURE_PATH = path.join(__dirname, 'seed', 'registrations.generated.json');

/** The sections this script owns. Everything else in the file is left alone. */
const SECTIONS = ['competitions', 'entries', 'squads', 'panels'];

/** How a competition is named across databases. */
const competitionKey = (competition) => ({
  name: competition.name,
  place: competition.place,
  year: competition.year,
});

/** Fields that belong to one database rather than to the competition. */
const NOT_PORTABLE = ['_id', '__v', 'createdAt', 'updatedAt', 'registeredTeams', 'createdBy'];

async function captureEnvironment() {
  const fileArg = process.argv.slice(2).find((a) => a.startsWith('--file='));
  const file = fileArg ? path.resolve(fileArg.slice('--file='.length)) : CAPTURE_PATH;

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found. Check Server/.env');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected — reading, nothing will be written to the database');

  const competitions = await Competition.find({ isDeleted: { $ne: true } })
    .populate('registeredTeams.team', 'name')
    .populate('registeredTeams.coach', 'email')
    .populate('registeredTeams.players.player', 'email firstName lastName')
    .lean();

  const captured = { competitions: [], entries: [], squads: [], panels: [] };

  for (const competition of competitions) {
    const where = competitionKey(competition);

    const portable = { ...competition };
    for (const field of NOT_PORTABLE) delete portable[field];
    captured.competitions.push(portable);

    for (const entry of competition.registeredTeams || []) {
      // A registration whose team or coach has been deleted describes nothing
      // that can be replayed, and silently writing half of it would produce an
      // entry pointing at nobody.
      if (!entry.team?.name || !entry.coach?.email) {
        console.warn(`⚠️  Skipping an entry in ${where.name} ${where.place} — its team or coach is gone`);
        continue;
      }

      captured.entries.push({
        competition: where,
        teamName: entry.team.name,
        coachEmail: String(entry.coach.email).toLowerCase(),
        isSubmitted: entry.isSubmitted === true,
        paymentStatus: entry.paymentStatus || 'pending',
      });

      for (const member of entry.players || []) {
        if (!member.player?.email) {
          console.warn(`⚠️  Skipping a squad member of ${entry.team.name} — the player is gone`);
          continue;
        }
        captured.squads.push({
          competition: where,
          teamName: entry.team.name,
          playerEmail: String(member.player.email).toLowerCase(),
          gender: member.gender,
          ageGroup: member.ageGroup,
          // Mixed in the schema: a bare apparatus name on some rows, a map of
          // competition type → list on others. Copied as found rather than
          // normalised, because normalising here is exactly the kind of
          // restating this file exists to avoid.
          apparatus: member.apparatus ?? {},
        });
      }
    }
  }

  const seats = await Judge.find({})
    .populate('judgeAccount', 'email')
    .lean();
  const competitionById = new Map(competitions.map((c) => [String(c._id), c]));

  for (const seat of seats) {
    const competition = competitionById.get(String(seat.competition));
    if (!competition) {
      console.warn(`⚠️  Skipping seat ${seat.judgeType} — its competition is gone`);
      continue;
    }
    captured.panels.push({
      competition: competitionKey(competition),
      gender: seat.gender,
      ageGroup: seat.ageGroup,
      competitionTypes: seat.competitionTypes || [],
      apparatus: seat.apparatus ?? null,
      judgeNo: seat.judgeNo,
      judgeType: seat.judgeType,
      // Null is a real state, not missing data: a seat can exist with nobody in
      // it, and the panel is a different thing when it does.
      judgeEmail: seat.judgeAccount?.email ? String(seat.judgeAccount.email).toLowerCase() : null,
    });
  }

  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    console.log(`\n📄 No capture at ${path.basename(file)} yet — starting one.`);
    console.log('   Accounts come from the UI run: npm --prefix Web run seed:ui');
  }

  const merged = { ...existing, ...captured, capturedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(`\n📄 ${path.basename(file)}`);
  console.table(SECTIONS.map((section) => ({ section, recorded: captured[section].length })));

  /*
   * Filled seats and empty ones, counted apart.
   *
   * A slot an organiser vacated keeps its document — the slot is part of the
   * panel's layout, and the next plan may want somebody back in it — so the row
   * count is not the panel size. Printing only the total said "Female Above16:
   * 6 seats" about a three-judge panel with two slots standing empty.
   */
  const panelSummary = {};
  for (const seat of captured.panels) {
    // Keyed by apparatus too, because that is what a panel IS now: a category
    // running Pole and Rope holds two, staffed separately and free to be
    // different sizes. Grouping them together printed one 10-seat panel where
    // the meet has a 5 and a 5.
    const key = `${seat.competition.place} · ${seat.gender} ${seat.ageGroup}`
      + `${seat.apparatus ? ` · ${seat.apparatus}` : ''}`;
    const tally = panelSummary[key] || (panelSummary[key] = { filled: 0, empty: 0 });
    if (seat.judgeEmail) tally.filled += 1;
    else tally.empty += 1;
  }
  if (Object.keys(panelSummary).length > 0) {
    console.log('\nPanels:');
    console.table(Object.entries(panelSummary).map(([category, { filled, empty }]) => ({
      category,
      seated: filled,
      'empty slots': empty,
    })));
  }

  const untouched = Object.keys(existing).filter((k) => !SECTIONS.includes(k) && k !== 'capturedAt');
  if (untouched.length > 0) {
    console.log(`\nLeft as they were: ${untouched.join(', ')}`);
  } else {
    console.log('\n⚠️  This capture has no accounts in it. Replaying it would find no');
    console.log('   coaches to own the teams and no judges to seat:');
    console.log('     npm --prefix Web run seed:ui');
  }

  await mongoose.disconnect();
}

captureEnvironment().catch(async (error) => {
  console.error('❌ Capture failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
