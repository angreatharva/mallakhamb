/**
 * Judge the whole meet through the API instead of a browser.
 *
 *   node scripts/seedScores.js --all                    # ALL TWELVE MEETS
 *   node scripts/seedScores.js                          # the default meet only
 *   node scripts/seedScores.js --place=Delhi            # one named meet
 *   node scripts/seedScores.js --type=competition_2
 *   node scripts/seedScores.js --gender=Male --age=Under14
 *   node scripts/seedScores.js --dry-run                # plan only, no writes
 *   node scripts/seedScores.js --no-lock                # judge, leave unlocked
 *
 * WITHOUT `--all` THIS DOES ONE MEET. A meet is the unit everything here works
 * in — the panel sizes, the seats and the categories all belong to one — but
 * the seeded database has twelve, so the bare command leaves eleven reading
 * "no scoring has started" while reporting success. Use `--all` unless you mean
 * one.
 *
 * `npm --prefix Web run seed:scores` does the same job through Playwright and
 * takes SEVEN HOURS, most of it waiting for a browser to paint a score sheet
 * nobody is looking at. This posts the same slips to the same endpoints in
 * minutes.
 *
 * WHAT IT DOES *NOT* REPLACE
 *
 * The UI spec proves the SCREENS work: that a tolerance breach actually blocks
 * Final Submit, that the alert names the right judge, that the override dialog
 * saves. None of that is testable from here, and this script asserts none of
 * it. Keep running the UI spec when the scoring UI changes; run this when you
 * want a database with realistic scores in it.
 *
 * WHAT IT DOES REPRODUCE
 *
 * Every state the panel can reach, in the same proportions and by the same
 * route — the slips are posted wrong first and then corrected, exactly as they
 * are on screen, rather than the settled numbers being written directly:
 *
 *   clean     every slip agrees; nothing to resolve
 *   mismatch  Judge 1 records a different routine (a checklist item unmet),
 *             then the chief corrects that slip
 *   tolerance evaluators mark 1.00 below the chief (COP §3.4), so the panel is
 *             outside tolerance and scores the base; the chief re-marks them
 *   both      both at once
 *
 * Then the Scorer walks all five time-deduction bands and locks the sheet.
 *
 * The constants, the scenario rotation and the panel sizes are the SAME sources
 * the UI spec reads — `scripts/seed/panel-plan.json` and the COP tables in
 * `src/config/cop-rules.js` — because two seeders that disagree about the panel
 * size produce two different databases and only one of them is right.
 *
 * PREREQUISITES: the API running, panels seated, and teams submitted AND paid.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');

const {
  getDifficultyRequirement,
  getCombinationChecklist,
  getTimeDeduction,
  POINT_CEILINGS,
} = require('../src/config/cop-rules');
const { calculateIndividualScore } = require('../src/utils/scoring/calculation.util');

const API = (process.env.SEED_API_URL || 'http://127.0.0.1:5000/api').replace(/\/$/, '');
const PLAN_PATH = path.join(__dirname, 'seed', 'panel-plan.json');
const CAPTURE_PATH = path.join(__dirname, 'seed', 'registrations.generated.json');

/** Evaluation seats in slot order. The Scorer is not one of them. */
const EVALUATION_SEATS = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
const CHIEF = 'Senior Judge';
const SCORER = 'Scorer';

/** Execution marks: 3.80 difficulty + 1.60 combination + execution = total. */
const EVAL_MARK = 3.0; // -> 8.40
const CHIEF_MARK = 4.0; // -> 9.40

/** One checklist item judged unmet, which is how two slips describe different routines. */
const ITEM_UNMET = 7;

/** COP §3.5, walked in order so every band is exercised. */
const TIME_BANDS = ['85', '92', '95', '98', '105'];

const TYPES = [
  { slug: 'competition_1', display: 'Competition I' },
  { slug: 'competition_2', display: 'Competition II' },
];

// ---------------------------------------------------------------------------
// The plan for one athlete — mirrors score-all.spec.js
// ---------------------------------------------------------------------------

/** The evaluators on a panel of N: everyone but the chief. */
const evaluatorSeats = (size) => EVALUATION_SEATS.slice(1, size);

/**
 * Rotated by position so a category meets every state it can rather than one of
 * them fifteen times. A 3-seat panel has no chief to measure against and
 * therefore no tolerance concept, so it alternates between the two that exist.
 */
const scenarioFor = (size, index) => (size >= 4
  ? ['clean', 'mismatch', 'tolerance', 'both'][index % 4]
  : ['clean', 'mismatch'][index % 2]);

/**
 * The combination section, as a slip records it.
 *
 * `unmet` is a list of checklist ids the judge marked as not achieved; each
 * costs its own penalty out of the 1.60. That is how two judges describe
 * different routines for the same performance.
 *
 * @param {string} apparatus
 * @param {number[]} unmet
 */
function combinationFor(apparatus, unmet) {
  const checklist = getCombinationChecklist(apparatus);
  const checked = {};
  let penalties = 0;
  for (const item of checklist) {
    const met = !unmet.includes(item.id);
    checked[item.id] = met;
    if (!met) penalties += item.penalty;
  }
  return {
    checked,
    total: Math.max(0, Number((POINT_CEILINGS.combination - penalties).toFixed(2))),
  };
}

/**
 * One judge's slip, in the shape the client posts.
 *
 * @param {string} competitionType
 * @param {string} apparatus
 * @param {number} execution
 * @param {number[]} unmet
 */
function buildSlip(competitionType, apparatus, execution, unmet = []) {
  const mix = getDifficultyRequirement(competitionType);
  const difficulty = {
    aClass: mix.A,
    bClass: mix.B,
    cClass: mix.C,
    total: POINT_CEILINGS.difficulty,
  };
  const combination = combinationFor(apparatus, unmet);
  const score = Number((difficulty.total + combination.total + execution).toFixed(2));

  return {
    score,
    breakdown: { difficulty, combination, execution, bonus: 0 },
  };
}

/**
 * What the panel does to one athlete, and what it must end up storing.
 *
 * Final scores are only ever 8.40 or 9.40. Every resolution ends with every
 * slip carrying the same marks, so the number is identical at all three panel
 * sizes even though the three averaging methods are not — which is what makes a
 * wrong panel size show up as a wrong number rather than a plausible one.
 */
function planFor(scenario, size) {
  const breaches = scenario === 'tolerance' || scenario === 'both';
  const mismatches = scenario === 'mismatch' || scenario === 'both';

  return {
    scenario,
    chiefExecution: breaches ? CHIEF_MARK : EVAL_MARK,
    evaluatorExecution: EVAL_MARK,
    mismatchSeat: mismatches ? 'Judge 1' : null,
    // The chief's corrections, as he would make them from Panel Review.
    fixes: evaluatorSeats(size)
      .map((seat) => ({
        seat,
        unmet: [],
        execution: breaches ? CHIEF_MARK : EVAL_MARK,
        needed: (mismatches && seat === 'Judge 1') || breaches,
      }))
      .filter((fix) => fix.needed),
    expectedFinal: breaches ? 9.40 : 8.40,
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * CSRF state for the one request that needs it.
 *
 * Every authenticated call here carries `Authorization: Bearer`, which the CSRF
 * middleware exempts — a cross-site attacker cannot set headers. But LOGIN has
 * no token yet, so it is a plain cookie-less POST and gets a flat 403 "CSRF
 * token missing".
 *
 * So the token is fetched once, and its cookie kept alongside it: the check is
 * double-submit, and the header alone proves nothing without the cookie it is
 * being compared against.
 */
const csrf = { token: null, cookie: null };

async function ensureCsrf() {
  if (csrf.token) return;
  const response = await fetch(`${API}/csrf-token`);
  const setCookie = response.headers.getSetCookie?.() || [];
  const jar = setCookie.map((raw) => raw.split(';')[0]).join('; ');
  const body = await response.json().catch(() => ({}));
  csrf.token = body?.csrfToken || body?.data?.csrfToken || null;
  csrf.cookie = jar || null;
  if (!csrf.token) throw new Error('GET /csrf-token returned no token');
}

/**
 * One call. Authenticated calls ride the Bearer exemption; the rest carry the
 * CSRF pair.
 */
async function call(pathname, { method = 'GET', body, token, competitionId } = {}) {
  const isWrite = method !== 'GET';
  if (isWrite && !token) await ensureCsrf();

  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(competitionId ? { 'X-Competition-Id': competitionId } : {}),
      ...(isWrite && !token && csrf.token
        ? { 'X-CSRF-Token': csrf.token, Cookie: csrf.cookie }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 300) }; }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || text.slice(0, 200);
    throw new Error(`${method} ${pathname} -> ${response.status}: ${detail}`);
  }
  return payload?.data !== undefined ? payload.data : payload;
}

/** Sign in every seat once, and hold the tokens. */
async function signInSeats(meetPlan, capture, competitionId) {
  const passwords = new Map(
    (capture.registrations || [])
      .filter((r) => r.role === 'judge')
      .map((r) => [String(r.payload.email).toLowerCase(), r.payload.password])
  );

  const tokens = {};
  // THIS meet's seats. Every meet deals its own six from the judge pool, and
  // signing in the wrong six gets slips refused — they hold no seat here.
  for (const [seat, email] of Object.entries(meetPlan.seats)) {
    const password = passwords.get(String(email).toLowerCase());
    if (!password) {
      throw new Error(
        `The plan seats ${email} as ${seat}, but that judge is not in `
        + `${path.basename(CAPTURE_PATH)} — so this script has no password for them.`
      );
    }
    const result = await call('/judge/login', { method: 'POST', body: { email, password } });
    const token = result?.token;
    if (!token) throw new Error(`No token returned when signing in ${email} as ${seat}`);

    /*
     * Bind the session to the meet, as the picker does — AND KEEP THE TOKEN IT
     * RETURNS.
     *
     * The re-scoped token used to be thrown away and the login one kept, which
     * worked only for as long as every judge sat at exactly one meet: login
     * picks a judge's meet silently, and with one seat that is always the right
     * one. Once judges hold seats at several, login picks whichever comes first
     * and the slip is posted against THAT meet's panel — so the server answers
     * 403 "Only a panel judge or an admin can submit a judge slip", naming a
     * permission problem for what is really a session pointed at the wrong
     * competition.
     */
    const scoped = await call(`/judge/competition/${competitionId}/set`, {
      method: 'PUT', body: {}, token,
    });
    tokens[seat] = scoped?.token || token;
  }
  return tokens;
}

/** The apparatus an entry is registered for, in this competition type. */
function apparatusOf(entry, competitionType) {
  const value = entry?.apparatus;
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value[competitionType] || [];
  return [];
}

/**
 * Every squad place in a category — ONE PER APPARATUS.
 *
 * Somebody entered for Pole, Hanging and Rope is judged three times and earns
 * three scores. Collapsing them to one athlete is how a previous version of the
 * UI spec silently left two thirds of SGAM-A's Above18 places at zero.
 */
function placesFrom(teams, gender, ageGroup, competitionType) {
  const places = [];
  for (const team of teams || []) {
    for (const entry of team.players || []) {
      if (entry.gender !== gender || entry.ageGroup !== ageGroup) continue;
      if (!entry.player?._id) continue;

      const registered = apparatusOf(entry, competitionType);
      const on = registered.length > 0 ? registered : ['Pole Mallakhamb'];

      for (const apparatus of on) {
        places.push({
          teamId: team._id,
          teamName: team.name,
          playerId: entry.player._id,
          playerName: `${entry.player.firstName || ''} ${entry.player.lastName || ''}`.trim(),
          apparatus,
          isFinalized: !!entry.isFinalized,
        });
      }
    }
  }
  // Sorted so the scenario rotation is stable between runs.
  return places.sort((a, b) =>
    a.teamName.localeCompare(b.teamName)
    || a.playerName.localeCompare(b.playerName)
    || a.apparatus.localeCompare(b.apparatus));
}

module.exports = {
  buildSlip, combinationFor, planFor, scenarioFor, evaluatorSeats, placesFrom, apparatusOf,
  EVAL_MARK, CHIEF_MARK, ITEM_UNMET, TIME_BANDS,
};

// ---------------------------------------------------------------------------

/** @param {string[]} argv */
function parseArgs(argv) {
  /*
   * LAST occurrence wins, which is the usual CLI convention and is what lets
   * `--all` append its own `--place=` per meet and have it beat one the caller
   * typed. Taking the first would silently score the same meet twelve times.
   */
  const flag = (name) => {
    const hit = argv.findLast((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    place: flag('place'),
    type: flag('type'),
    gender: flag('gender'),
    age: flag('age'),
    dryRun: argv.includes('--dry-run'),
    lock: !argv.includes('--no-lock'),
  };
}

/**
 * Judge ONE meet.
 *
 * @param {string[]} [extraArgv] - appended to the command line, so `--all` can
 *   drive this per meet. Later flags win, which is what lets it override
 *   `--place`.
 */
async function main(extraArgv = []) {
  const args = parseArgs([...process.argv.slice(2), ...extraArgv]);

  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!fs.existsSync(CAPTURE_PATH)) {
    throw new Error(`No capture at ${CAPTURE_PATH} — this script reads the judges' passwords from it.`);
  }
  const capture = JSON.parse(fs.readFileSync(CAPTURE_PATH, 'utf8'));
  const place = args.place || plan.place;

  /*
   * THIS MEET'S plan, not the file's default one.
   *
   * The plan holds an entry per meet and repeats the default meet's panels and
   * seats at the top level for the consumers that only ever work on one. This
   * script takes `--place`, so it is not one of them — reading the top level
   * here would score whatever meet was asked for using the DEFAULT meet's panel
   * sizes and sign in as the DEFAULT meet's judges.
   *
   * Both halves are quiet failures. The judges hold no seat at the meet, so
   * their slips are refused; and a category seated with four judges but scored
   * as a five averages by drop-high-low instead of copying the chief into the
   * vacant slot, which produces a believable number rather than an error. That
   * is the exact failure the plan is a committed file to prevent.
   */
  const meetPlan = (plan.meets || []).find((m) => m.place === place);
  if (!meetPlan) {
    throw new Error(
      `No panel plan for "${place}". Planned: ${(plan.meets || []).map((m) => m.place).join(', ')}.\n`
      + 'Redraw after adding a meet: npm --prefix Server run seed:panels:plan -- --force'
    );
  }

  // The meet, found the way everything else finds it.
  const competitions = await call('/public/competitions');
  const competition = (competitions || []).find((c) => c.place === place);
  if (!competition) {
    throw new Error(`No competition at "${place}". Seen: ${(competitions || []).map((c) => c.place).join(', ')}`);
  }
  const competitionId = competition._id;

  console.log(`\n  meet     ${competition.name} — ${place} [${meetPlan.level}]`);
  console.log(`  api      ${API}`);
  console.log(`  panels   ${meetPlan.panels.length} (plan drawn ${plan.generatedAt?.slice(0, 10) || 'unknown'})`);
  console.log(`  mode     ${args.dryRun ? 'DRY RUN — nothing is written' : 'writing'}\n`);

  const tokens = args.dryRun ? {} : await signInSeats(meetPlan, capture, competitionId);

  const types = TYPES.filter((t) => !args.type || t.slug === args.type);
  const panels = meetPlan.panels.filter((p) =>
    (!args.gender || p.gender === args.gender) && (!args.age || p.ageGroup === args.age));

  let slips = 0;
  let finalized = 0;
  let skipped = 0;
  const problems = [];

  for (const type of types) {
    for (const panel of panels) {
      const label = `${type.display} · ${panel.gender} ${panel.ageGroup} · ${panel.size}-judge`;

      const teams = await call(
        `/public/submitted-teams?competitionId=${competitionId}&gender=${panel.gender}`
        + `&ageGroup=${panel.ageGroup}&competitionType=${type.slug}`,
        { token: tokens[CHIEF] }
      );
      const places = placesFrom(teams, panel.gender, panel.ageGroup, type.slug);

      if (places.length === 0) {
        console.log(`  ${label.padEnd(48)} no squad places — skipped`);
        continue;
      }

      const evaluators = evaluatorSeats(panel.size);
      let scoredHere = 0;
      let doneHere = 0;

      for (const [index, spot] of places.entries()) {
        if (spot.isFinalized) { doneHere += 1; skipped += 1; continue; }

        const scenario = scenarioFor(panel.size, index);
        const athletePlan = planFor(scenario, panel.size);

        if (args.dryRun) { scoredHere += 1; continue; }

        const base = {
          competition: competitionId,
          teamId: spot.teamId,
          gender: panel.gender,
          ageGroup: panel.ageGroup,
          competitionType: type.slug,
          apparatus: spot.apparatus,
          playerId: spot.playerId,
          playerName: spot.playerName,
          panelSize: panel.size,
        };

        // 1. Every evaluator marks the routine as they saw it.
        for (const seat of evaluators) {
          const unmet = seat === athletePlan.mismatchSeat ? [ITEM_UNMET] : [];
          const slip = buildSlip(type.slug, spot.apparatus, athletePlan.evaluatorExecution, unmet);
          await call('/judge/scores/save', {
            method: 'POST', token: tokens[seat], competitionId,
            body: { ...base, ...slip },
          });
          slips += 1;
        }

        // 2. The chief marks it too.
        const chiefSlip = buildSlip(type.slug, spot.apparatus, athletePlan.chiefExecution, []);
        await call('/judge/scores/save', {
          method: 'POST', token: tokens[CHIEF], competitionId,
          body: { ...base, ...chiefSlip },
        });
        slips += 1;

        // 3. The chief resolves whatever blocks him, seat by seat. This is the
        //    override path — the authority comes from his own assignment, and
        //    `judgeType` names whose slip he is correcting.
        for (const fix of athletePlan.fixes) {
          const corrected = buildSlip(type.slug, spot.apparatus, fix.execution, fix.unmet);
          await call('/judge/scores/save', {
            method: 'POST', token: tokens[CHIEF], competitionId,
            body: { ...base, ...corrected, judgeType: fix.seat, overrideBySenior: true },
          });
          slips += 1;
        }

        // 4. Final Submit — only the Senior Judge may, and it locks this
        //    athlete's result against further judge edits.
        await call('/judge/scores/save', {
          method: 'POST', token: tokens[CHIEF], competitionId,
          body: { ...base, ...chiefSlip, isFinalSubmit: true },
        });
        finalized += 1;
        scoredHere += 1;
      }

      console.log(
        `  ${label.padEnd(48)} ${String(scoredHere).padStart(3)} scored`
        + `${doneHere ? `, ${doneHere} already finalized` : ''}`
      );

      // 5. The Scorer records the clock and locks the sheet.
      if (!args.dryRun && args.lock && scoredHere + doneHere > 0) {
        const problem = await runScorer({
          competitionId, panel, type, places, tokens, plan,
        });
        if (problem) problems.push(`${label}: ${problem}`);
      }
    }
  }

  console.log(`\n  ${slips} slip(s), ${finalized} athlete(s) finalized`
    + `${skipped ? `, ${skipped} already done` : ''}`);

  /*
   * Check what was actually stored.
   *
   * A seeder that writes the wrong numbers quietly is worse than one that
   * fails: the database looks judged, and every ranking built on it is wrong.
   * Every final must be one of the two the design produces (8.40 clean/resolved
   * mismatch, 9.40 resolved tolerance) less the Scorer's time deduction — so
   * the whole meet has ten legal values and anything else is a defect.
   */
  if (!args.dryRun) {
    const legal = new Set();
    for (const base of [8.40, 9.40]) {
      for (const seconds of TIME_BANDS) {
        legal.add(Number((base - getTimeDeduction(Number(seconds) - 90)).toFixed(2)));
      }
    }

    const bad = [];
    for (const type of types) {
      for (const panel of panels) {
        const teams = await call(
          `/public/submitted-teams?competitionId=${competitionId}&gender=${panel.gender}`
          + `&ageGroup=${panel.ageGroup}&competitionType=${type.slug}`,
          { token: tokens[CHIEF] }
        );
        for (const team of teams || []) {
          for (const entry of team.players || []) {
            if (entry.gender !== panel.gender || entry.ageGroup !== panel.ageGroup) continue;
            if (!entry.isFinalized) continue;
            const value = Number(entry.finalScore);
            if (!legal.has(Number(value.toFixed(2)))) {
              bad.push(`${type.display} ${panel.gender} ${panel.ageGroup} `
                + `${entry.player?.firstName} ${entry.player?.lastName}: ${value}`);
            }
          }
        }
      }
    }

    if (bad.length === 0) {
      console.log(`  every stored final is one of: ${[...legal].sort((a, b) => a - b).join(', ')}`);
    } else {
      console.log(`\n  ${bad.length} UNEXPECTED final score(s):`);
      bad.slice(0, 10).forEach((b) => console.log(`    ${b}`));
      process.exitCode = 1;
    }
  }

  if (problems.length) {
    console.log('\n  Problems:');
    problems.forEach((p) => console.log(`    ${p}`));
  }

  if (!args.dryRun) {
    console.log('\n  Check the result with:  npm --prefix Server run meet:status');
  }
}

/**
 * Judge EVERY planned meet, one after another.
 *
 * `main` does one meet, because a meet is the unit everything else here works
 * in — the panel sizes, the seats and the categories all belong to one. But the
 * seeded database has twelve, and "run it twelve times with a different
 * --place" is a footgun rather than an interface: the obvious command scored
 * one meet, reported success, and left eleven reading "no scoring has started"
 * on the status board.
 *
 * Sequential on purpose. Each meet signs in six judges and posts a few hundred
 * slips, and the API is one Node process — running them at once would queue on
 * the same thread and only make each one look slow.
 *
 * One meet failing does not stop the rest; the exit code still reports it.
 */
async function scoreEveryMeet() {
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const places = (plan.meets || []).map((m) => m.place);

  if (places.length === 0) {
    throw new Error(
      `${PLAN_PATH} has no per-meet plans, so --all has nothing to iterate.\n`
      + 'Redraw it: npm --prefix Server run seed:panels:plan -- --force'
    );
  }

  console.log(`\n  Scoring ${places.length} meet(s): ${places.join(', ')}`);

  const failed = [];
  for (const place of places) {
    try {
      await main([`--place=${place}`]);
    } catch (error) {
      failed.push(place);
      console.error(`\n  ${place} FAILED: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scored ${places.length - failed.length} of ${places.length} meet(s)`);
  if (failed.length) {
    console.log(`Failed: ${failed.join(', ')}`);
    console.log('Re-run just those with:  node scripts/seedScores.js --place=<place>');
    process.exitCode = 1;
  }
}

/**
 * The Scorer's pass over one category: a time for every athlete, cycling the
 * five deduction bands, then the lock that publishes the sheet.
 *
 * The averages are computed with the SERVER's own calculation util rather than
 * restated here — the client computes them too, and a second implementation in
 * a seeder is a third opinion nobody asked for.
 */
async function runScorer({ competitionId, panel, type, places, tokens }) {
  const byTeam = new Map();
  for (const spot of places) {
    if (!byTeam.has(spot.teamId)) byTeam.set(spot.teamId, []);
    byTeam.get(spot.teamId).push(spot);
  }

  for (const [teamId, teamPlaces] of byTeam) {
    // Read back what the panel actually stored, so the Scorer works from the
    // marks rather than from what this script believes it wrote.
    const stored = await call(
      `/judge/scores/team?gender=${panel.gender}&ageGroup=${panel.ageGroup}`
      + `&competitionType=${type.slug}`,
      { token: tokens[SCORER], competitionId }
    );
    const team = (stored || []).find((t) => String(t._id) === String(teamId));
    if (!team) return `no stored scores for team ${teamId}`;

    /*
     * A locked sheet refuses every write, including this one — so re-running
     * the seeder over a finished meet used to fail with "Scores are locked and
     * cannot be modified" AFTER correctly reporting that it had nothing to
     * score.
     *
     * Skipping here rather than upstream keeps the case the seeder exists for:
     * a category where every athlete is finalized but the Scorer never got to
     * lock it (which is exactly what a mid-run interruption leaves behind).
     * That sheet is unlocked, so it still gets its pass.
     */
    if (team.scoreMetadata?.isLocked) continue;

    const playerScores = (team.scores || []).map((row, index) => {
      const seconds = Number(TIME_BANDS[index % TIME_BANDS.length]);
      const deduction = getTimeDeduction(seconds - 90);
      const computed = calculateIndividualScore(row.judgeScores, panel.size);
      const average = computed.averageMarks;

      return {
        playerId: row.playerId,
        playerName: row.playerName,
        apparatus: row.apparatus,
        time: String(seconds),
        judgeScores: row.judgeScores,
        executionAverage: computed.executionAverage,
        baseScore: computed.baseScore,
        baseScoreApplied: computed.baseScoreApplied,
        toleranceUsed: computed.toleranceUsed,
        averageMarks: average,
        deduction,
        otherDeduction: 0,
        finalScore: Math.max(0, Number((average - deduction).toFixed(2))),
      };
    });

    if (playerScores.length === 0) continue;

    await call('/judge/scores/save', {
      method: 'POST', token: tokens[SCORER], competitionId,
      body: {
        competition: competitionId,
        teamId,
        gender: panel.gender,
        ageGroup: panel.ageGroup,
        competitionType: type.slug,
        timeKeeper: 'Seeded Timekeeper',
        scorer: 'Seeded Scorer',
        remarks: 'Seeded by scripts/seedScores.js',
        isLocked: true,
        playerScores,
      },
    });
  }

  return null;
}

if (require.main === module) {
  const run = process.argv.includes('--all') ? scoreEveryMeet() : main();
  run.catch((error) => {
    console.error(`\nScoring seed failed: ${error.message}`);
    process.exit(1);
  });
}
