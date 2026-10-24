// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Check that a seeded database is actually complete, and say so check by check.
 *
 *   node scripts/verifySeed.js
 *   node scripts/verifySeed.js --quiet    # only the failures and the verdict
 *
 * `setupAll.js` runs this at the end, so a run answers "did it work?" rather
 * than "did every command exit zero?". Those are different questions and the
 * gap between them is where this project's worst bugs have lived: a competition
 * chooser that scoped writes to the wrong meet passed sixty browser tests while
 * leaving four meets' squads empty, and the only thing that would have caught
 * it was counting rows afterwards.
 *
 * WHY THESE ARE INVARIANTS AND NOT TOTALS
 *
 * Almost every check is a rule the fixture must obey — every entry is paid,
 * every seated panel has a chief — rather than a number to match. Numbers go
 * stale the moment a roster changes and then get "fixed" by editing the
 * expectation, which quietly turns a real regression into a passing test. The
 * few genuine totals are read from the committed seed files (`meets.json`,
 * `judges.json`), so they move when the fixture is deliberately changed and
 * never otherwise.
 *
 * Exits non-zero if anything failed, so it can gate a chain.
 */

const mongoose = require('mongoose');
const { allMeets, LEVELS } = require('./lib/meets');
const { allJudges } = require('./lib/judges');
const { readPlan, planForPlace, seatsFor } = require('./lib/panel-plan');
const { apparatusKey } = require('../src/config/cop-rules');
const { baseLoginId } = require('../src/utils/data/player-login-id.util');
const roster = require('./lib/roster');

const QUIET = process.argv.includes('--quiet');

/** Every category a meet runs, as the plan lists them. */
const CATEGORY_KEY = (c) => `${c.gender}/${c.ageGroup}`;

const results = [];

/**
 * Record one check.
 * @param {string} area - the step it belongs to, for grouping
 * @param {string} name
 * @param {boolean} ok
 * @param {string} [detail] - shown always on failure, and on pass when given
 */
const check = (area, name, ok, detail = '') => {
  results.push({ area, name, ok, detail });
};

/**
 * A rule over a collection, which FAILS when the collection is empty.
 *
 * "Every entry is paid" is true of no entries, and an empty database therefore
 * passed most of this file the first time it ran — twelve green checks against
 * nothing at all. Vacuous truth is exactly the wrong answer here, because the
 * question being asked is "is the fixture complete", and nothing is the most
 * incomplete a fixture can be.
 *
 * @param {string} area
 * @param {string} name
 * @param {Array} items - what the rule ranges over
 * @param {(item: any) => boolean} predicate
 * @param {(bad: Array) => string} [describe] - detail for the failures
 */
const checkEvery = (area, name, items, predicate, describe) => {
  if (!items.length) {
    check(area, name, false, 'nothing to check — the collection is empty');
    return;
  }
  const bad = items.filter((item) => !predicate(item));
  check(area, name, bad.length === 0, describe ? describe(bad) : `${bad.length} failed`);
};

async function verify() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const competitions = await db.collection('competitions')
    .find({ isDeleted: { $ne: true } })
    .project({ place: 1, level: 1, registeredTeams: 1 })
    .toArray();
  const teams = await db.collection('teams').find({}).project({ name: 1, coach: 1 }).toArray();
  const coaches = await db.collection('coaches').find({}).project({ email: 1 }).toArray();
  const players = await db.collection('players').find({})
    .project({ email: 1, team: 1, loginId: 1, emailType: 1, registeredByCoach: 1, firstName: 1, lastName: 1, dateOfBirth: 1 })
    .toArray();
  const deskForms = await db.collection('walkinregistrations').find({ status: { $ne: 'cancelled' } })
    .project({ competition: 1, team: 1, status: 1, rows: 1 })
    .toArray();
  const rosterCoaches = await roster.allCoaches();
  const rosterPlayers = await roster.allPlayers();
  const judgeAccounts = await db.collection('judges').find({}).project({ email: 1 }).toArray();
  const assignments = await db.collection('judgeassignments').find({})
    .project({ competition: 1, gender: 1, ageGroup: 1, judgeType: 1, judgeAccount: 1 })
    .toArray();
  const scores = await db.collection('scores').find({})
    .project({ competition: 1, gender: 1, ageGroup: 1, competitionType: 1, isLocked: 1, lockedApparatus: 1, 'playerScores.isFinalized': 1, 'playerScores.apparatus': 1, 'playerScores.playerId': 1 })
    .toArray();

  const byId = Object.fromEntries(competitions.map((c) => [String(c._id), c]));

  // ── competitions ───────────────────────────────────────────────────────────
  const expectedMeets = allMeets();
  check('competitions', `${expectedMeets.length} meets exist`,
    competitions.length === expectedMeets.length,
    `found ${competitions.length}`);

  const missing = expectedMeets.filter((m) => !competitions.some((c) => c.place === m.place));
  check('competitions', 'every meet in meets.json was created',
    missing.length === 0,
    missing.map((m) => m.place).join(', '));

  for (const level of LEVELS) {
    const want = expectedMeets.filter((m) => m.level === level).length;
    const got = competitions.filter((c) => c.level === level).length;
    check('competitions', `${level}: ${want} meet(s)`, got === want, `found ${got}`);
  }

  // ── people ─────────────────────────────────────────────────────────────────
  checkEvery('accounts', 'every team has a coach', teams, (t) => t.coach,
    (bad) => `${bad.length} orphaned: ${bad.map((t) => t.name).join(', ')}`);
  check('accounts', 'one team per coach',
    teams.length > 0 && new Set(teams.map((t) => String(t.coach))).size === teams.length,
    `${teams.length} team(s), ${new Set(teams.map((t) => String(t.coach))).size} distinct coach(es)`);
  check('accounts', 'coaches and teams match in number',
    coaches.length > 0 && coaches.length === teams.length,
    `${coaches.length} coach(es), ${teams.length} team(s)`);

  checkEvery('accounts', 'every athlete is on a team', players, (p) => p.team,
    (bad) => `${bad.length} teamless: ${bad.slice(0, 5).map((p) => p.email || p.loginId).join(', ')}`);

  // Every account has a Player ID — the one login a child without an email has —
  // and it is the one their name and date of birth give (no `.2`: the seed has no
  // two children sharing both, so a suffix means somebody was registered twice).
  checkEvery('accounts', 'every athlete has their own Player ID', players,
    (p) => p.loginId && p.loginId === baseLoginId(p.firstName, p.lastName, p.dateOfBirth),
    (bad) => `${bad.length}: ${bad.slice(0, 5).map((p) => `${p.loginId || 'none'} (${p.firstName} ${p.lastName})`).join(', ')}`);

  // The no-email kinds, counted against the roster: own email, a guardian's, none,
  // and registered by the coach (who is the contact of record).
  const kindOf = (p) => (p.registeredByCoach ? 'coach' : (p.emailType || 'self'));
  const rosterKindOf = (p) => (p.registeredBy === 'coach' ? 'coach' : p.emailType);
  const deskPlayerIds = new Set(deskForms.flatMap((f) => (f.rows || []).map((r) => String(r.player || ''))).filter(Boolean));
  const seasonPlayers = players.filter((p) => !deskPlayerIds.has(String(p._id)));
  for (const kind of ['self', 'guardian', 'none', 'coach']) {
    const want = rosterPlayers.filter((p) => rosterKindOf(p) === kind).length;
    const got = seasonPlayers.filter((p) => kindOf(p) === kind).length;
    check('accounts', `${kind} accounts: ${want}`, got === want, `found ${got}`);
  }
  checkEvery('accounts', 'no-email accounts hold no email, guardian ones the guardian\'s',
    players.filter((p) => p.emailType && p.emailType !== 'self'),
    (p) => (p.emailType === 'none' ? !p.email : Boolean(p.email)),
    (bad) => `${bad.length}: ${bad.slice(0, 5).map((p) => p.loginId).join(', ')}`);

  const expectedJudges = allJudges();
  check('accounts', `${expectedJudges.length} judge accounts exist`,
    judgeAccounts.length === expectedJudges.length,
    `found ${judgeAccounts.length}`);
  const missingJudges = expectedJudges.filter(
    (j) => !judgeAccounts.some((a) => String(a.email).toLowerCase() === j.email)
  );
  check('accounts', 'every judge in judges.json registered',
    missingJudges.length === 0,
    missingJudges.map((j) => j.email).join(', '));

  // ── entries and squads ─────────────────────────────────────────────────────
  const entries = competitions.flatMap((c) =>
    (c.registeredTeams || []).map((r) => ({ ...r, place: c.place })));

  checkEvery('entries', 'every meet has teams entered', competitions,
    (c) => (c.registeredTeams || []).length > 0,
    (bad) => `empty: ${bad.map((c) => c.place).join(', ')}`);

  /*
   * Exactly the roster's teams at each meet's level — plus any team the walk-in
   * desk entered there. This was "every meet has the same number of teams",
   * which a desk entry breaks for the right reason; naming the teams is the
   * stronger check anyway (a team in the wrong level's meet had the right count).
   */
  const teamName = new Map(teams.map((t) => [String(t._id), t.name]));
  const wrongField = [];
  for (const competition of competitions) {
    const want = new Set(rosterCoaches.filter((c) => c.level === competition.level).map((c) => c.teamName));
    for (const form of deskForms) {
      if (String(form.competition) === String(competition._id)) want.add(teamName.get(String(form.team)));
    }
    const got = new Set((competition.registeredTeams || []).map((r) => teamName.get(String(r.team))));
    const missingTeams = [...want].filter((t) => !got.has(t));
    const extraTeams = [...got].filter((t) => !want.has(t));
    if (missingTeams.length || extraTeams.length) {
      wrongField.push(`${competition.place}: ${missingTeams.length ? `missing ${missingTeams.join(', ')}` : ''}`
        + `${extraTeams.length ? ` unexpected ${extraTeams.join(', ')}` : ''}`);
    }
  }
  check('entries', 'every meet has its level\'s roster teams (+ desk entries)',
    competitions.length > 0 && wrongField.length === 0,
    wrongField.slice(0, 4).join(' | '));

  checkEvery('entries', 'every entry has a squad', entries,
    (e) => (e.players || []).length > 0,
    (bad) => `${bad.length} empty: ${bad.slice(0, 6).map((e) => e.place).join(', ')}`);

  checkEvery('entries', 'every entry is final-submitted', entries, (e) => e.isSubmitted,
    (bad) => `${bad.length} outstanding: ${bad.slice(0, 6).map((e) => e.place).join(', ')}`);

  checkEvery('entries', 'every entry is paid', entries,
    (e) => e.paymentStatus === 'completed',
    (bad) => `${bad.length} outstanding: ${bad.slice(0, 6).map((e) => e.place).join(', ')}`);

  // ── walk-in desk ───────────────────────────────────────────────────────────
  //
  // Only when the desk step ran: it is skipped where no OCR sidecar answers, and
  // a season without it is complete. When it did run, the form is paid, every
  // row became an entered player, and those players sit in that meet's entry —
  // where the scoring checks below then hold them to the same bar as everyone.
  if (deskForms.length > 0) {
    checkEvery('walk-in', 'every desk form is paid', deskForms, (f) => f.status === 'paid',
      (bad) => `${bad.length}: ${bad.map((f) => f.status).join(', ')}`);
    const rows = deskForms.flatMap((f) => (f.rows || []).map((r) => ({ ...r, form: f })));
    checkEvery('walk-in', 'every desk row is a registered, entered player', rows,
      (r) => r.player && r.entered && r.loginId,
      (bad) => `${bad.length} unfinished`);
    checkEvery('walk-in', 'every desk player is in that meet\'s squad', rows, (r) => {
      const meet = byId[String(r.form.competition)];
      const entry = (meet?.registeredTeams || []).find((t) => String(t.team) === String(r.form.team));
      return (entry?.players || []).some((e) => String(e.player) === String(r.player));
    }, (bad) => `${bad.length} missing: ${bad.slice(0, 5).map((r) => r.loginId).join(', ')}`);
    checkEvery('walk-in', 'desk players were registered by the coach, with no email',
      players.filter((p) => deskPlayerIds.has(String(p._id))),
      (p) => p.registeredByCoach && p.emailType === 'none' && !p.email,
      (bad) => `${bad.length}: ${bad.slice(0, 5).map((p) => p.loginId).join(', ')}`);
  }

  // ── panels ─────────────────────────────────────────────────────────────────
  const plan = readPlan();
  let panelProblems = [];
  let seatedPanels = 0;

  for (const competition of competitions) {
    let meetPlan;
    try {
      meetPlan = planForPlace(plan, competition.place);
    } catch {
      panelProblems.push(`${competition.place}: no plan`);
      continue;
    }

    for (const panel of meetPlan.panels) {
      const want = seatsFor(panel.size);
      const seated = assignments.filter((a) =>
        String(a.competition) === String(competition._id)
        && a.gender === panel.gender
        && a.ageGroup === panel.ageGroup
        && a.judgeAccount);
      const heldSeats = new Set(seated.map((a) => a.judgeType));
      const absent = want.filter((s) => !heldSeats.has(s));

      if (absent.length) {
        panelProblems.push(`${competition.place} ${CATEGORY_KEY(panel)}: missing ${absent.join(', ')}`);
      } else {
        seatedPanels += 1;
      }
    }
  }

  check('panels', 'every planned panel is fully seated',
    seatedPanels > 0 && panelProblems.length === 0,
    panelProblems.length ? panelProblems.slice(0, 6).join(' | ') : 'no panels seated at all');
  check('panels', 'panels seated', seatedPanels > 0, `${seatedPanels} seated`);

  // ── scoring ────────────────────────────────────────────────────────────────
  //
  // "Published" is the same two gates the public results apply
  // (public.service.js): every athlete's row finalized, AND locked. Locked is
  // per apparatus now — the Scorer's Save & Lock records the apparatus in
  // `lockedApparatus` and deliberately no longer sets `isLocked`, which stays
  // the admin's whole-sheet freeze. Checking `isLocked` alone reported every
  // properly published category as unpublished (found by the nightly e2e run,
  // deploy/oci/PLAN.md O14). One gate without the other is a category that
  // looks judged and is not.
  const byCategory = new Map();
  for (const score of scores) {
    const key = `${score.competition}|${score.gender}|${score.ageGroup}|${score.competitionType}`;
    const row = byCategory.get(key) || { rows: 0, finalized: 0, locked: 0, competition: score.competition };
    const lockedHere = new Set((score.lockedApparatus || []).map(apparatusKey));
    for (const entry of score.playerScores || []) {
      row.rows += 1;
      if (entry.isFinalized) row.finalized += 1;
      if (score.isLocked || lockedHere.has(apparatusKey(entry.apparatus))) row.locked += 1;
    }
    byCategory.set(key, row);
  }

  /*
   * A score whose competition is GONE, named as that rather than as an id.
   *
   * This used to print the raw ObjectId — the fallback below — which reads as a
   * meet the reporter could not be bothered to look up, when it is really a
   * category that cannot be reached from any meet. It is debris, and it has a
   * specific cause: a scoring write already in flight when the database was
   * dropped lands afterwards and re-creates its `scores` document, pointing at
   * a competition, team and player that no longer exist. The count then reads
   * one category too MANY while a real category is missing, which is a
   * confusing way to be told nothing was skipped.
   */
  const orphaned = [];

  const unpublished = [];
  for (const [key, row] of byCategory) {
    const published = row.rows > 0 && row.finalized === row.rows && row.locked === row.rows;
    const meet = byId[String(row.competition)];
    const category = key.split('|').slice(1).join(' ');
    if (!meet) orphaned.push(`${category} (competition ${row.competition})`);
    if (!published) {
      unpublished.push(`${meet?.place || row.competition} ${category}`);
    }
  }

  const expectedCategories = competitions.length * plan.panels.length * plan.competitionTypes.length;
  check('scores', `every category judged — ${expectedCategories} expected`,
    expectedCategories > 0 && byCategory.size === expectedCategories,
    orphaned.length
      ? `found ${byCategory.size}, of which ${orphaned.length} belong to no meet — `
        + `left over from a run that raced a --drop: ${orphaned.slice(0, 3).join(' | ')}`
      : `found ${byCategory.size}`);
  check('scores', 'every category published (all finalized, sheet locked)',
    byCategory.size > 0 && unpublished.length === 0,
    unpublished.length
      ? `${unpublished.length} unpublished: ${unpublished.slice(0, 6).join(' | ')}`
      : 'nothing has been scored at all');

  /*
   * Squads rotate (support/roster.js squadAt): a generated team fields one of
   * its athletes per category at each meet, so every meet has team members it
   * must NOT judge. Nobody may be scored at a meet whose squad does not hold
   * them — and everyone on the roster plays somewhere.
   */
  const entered = new Map(competitions.map((c) => [String(c._id),
    new Set((c.registeredTeams || []).flatMap((r) => (r.players || []).map((e) => String(e.player))))]));
  const judgedOutside = scores.flatMap((score) => (score.playerScores || [])
    .filter((row) => !entered.get(String(score.competition))?.has(String(row.playerId)))
    .map((row) => `${byId[String(score.competition)]?.place || score.competition}: ${row.playerId}`));
  check('scores', 'nobody judged at a meet they are not entered in',
    scores.length > 0 && judgedOutside.length === 0,
    `${judgedOutside.length}: ${judgedOutside.slice(0, 4).join(' | ')}`);
  const enteredAnywhere = new Set([...entered.values()].flatMap((set) => [...set]));
  checkEvery('entries', 'every athlete is in some meet\'s squad', players,
    (p) => enteredAnywhere.has(String(p._id)),
    (bad) => `${bad.length} never entered: ${bad.slice(0, 5).map((p) => p.loginId).join(', ')}`);

  const meetsWithScores = new Set([...byCategory.values()].map((r) => String(r.competition)));
  checkEvery('scores', 'no meet left unjudged', competitions,
    (c) => meetsWithScores.has(String(c._id)),
    (bad) => `${bad.length} unjudged: ${bad.map((c) => c.place).join(', ')}`);

  await mongoose.disconnect();

  return {
    competitions: competitions.length,
    coaches: coaches.length,
    teams: teams.length,
    players: players.length,
    deskPlayers: deskPlayerIds.size,
    judges: judgeAccounts.length,
    entries: entries.length,
    squadPlaces: entries.reduce((n, e) => n + (e.players || []).length, 0),
    panelSeats: assignments.filter((a) => a.judgeAccount).length,
    categories: byCategory.size,
  };
}

function report(totals) {
  const failed = results.filter((r) => !r.ok);
  const width = Math.max(...results.map((r) => r.name.length)) + 2;

  console.log(`\n${'='.repeat(72)}`);
  console.log('SEED VERIFICATION');
  console.log('='.repeat(72));

  let area = null;
  for (const result of results) {
    if (QUIET && result.ok) continue;
    if (result.area !== area) {
      area = result.area;
      console.log(`\n  ${area}`);
    }
    const mark = result.ok ? 'PASS' : 'FAIL';
    const detail = !result.ok && result.detail ? `  — ${result.detail}` : '';
    console.log(`    [${mark}] ${result.name.padEnd(width)}${detail}`);
  }

  if (totals) {
    console.log('\n  totals');
    for (const [key, value] of Object.entries(totals)) {
      console.log(`    ${String(key).padEnd(14)} ${value}`);
    }
  }

  console.log(`\n${'-'.repeat(72)}`);
  if (failed.length === 0) {
    console.log(`${results.length}/${results.length} checks passed — the seed is complete.`);
  } else {
    console.log(`${results.length - failed.length}/${results.length} checks passed, ${failed.length} FAILED:`);
    for (const f of failed) console.log(`  ✗ ${f.area}: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  console.log('-'.repeat(72));

  return failed.length;
}

if (require.main === module) {
  verify()
    .then((totals) => {
      const failures = report(totals);
      process.exit(failures === 0 ? 0 : 1);
    })
    .catch(async (error) => {
      console.error(`\nVerification could not run: ${error.message}`);
      try { await mongoose.disconnect(); } catch { /* already down */ }
      process.exit(1);
    });
}

module.exports = { verify, report };
