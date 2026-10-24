/**
 * The seed roster, read from the browser suite's own copy of it.
 *
 * ONE ROSTER READ BY BOTH STACKS, the same seam as `meets.js` and
 * `panel-plan.js` beside it — and for a sharper reason than either. The API
 * chain and the UI chain exist to be compared: if they seeded different people,
 * "the API path produced a different database" would mean nothing, because it
 * always would.
 *
 * The roster lives in `Web/e2e/support/` rather than here because that is where
 * it was written and where the conventions that generate it are enforced
 * (`people.js` derives every email and password and refuses a colliding pair on
 * import). Copying it to this side would give the fixture two definitions and
 * one of them would quietly go stale.
 *
 * THE MODULE SYSTEMS DO NOT MATCH, and that is the only complication. `Web/` is
 * ESM (`"type": "module"`), `Server/scripts` is CommonJS, and a `require` of an
 * ESM file throws `ERR_REQUIRE_ESM`. `import()` bridges it — it works from CJS
 * and returns a promise — so everything here is async. The roster files import
 * nothing but node builtins and each other, so there is no Playwright to drag
 * in behind them.
 *
 * @module scripts/lib/roster
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { meetsAtLevel } = require('./meets');

const SUPPORT = path.join(__dirname, '..', '..', '..', 'Web', 'e2e', 'support');

/**
 * Import one of the browser suite's support modules.
 *
 * The file URL is not optional on Windows: `import('D:\\...')` is read as a
 * package specifier with a drive letter for a scheme, and fails as
 * `ERR_UNSUPPORTED_ESM_URL_SCHEME` — which reads like the file is unsupported
 * rather than the path spelling.
 *
 * @param {string} file - e.g. 'roster.js'
 */
async function load(file) {
  const url = pathToFileURL(path.join(SUPPORT, file)).href;
  try {
    return await import(url);
  } catch (error) {
    throw new Error(
      `Could not read the seed roster at ${path.join(SUPPORT, file)}: ${error.message}\n`
      + 'It is committed with the browser suite — the API chain reads the same file the '
      + 'browser chain does, so that both seed the same people.'
    );
  }
}

/**
 * Every coach, with the team they own and the level that team competes at.
 *
 * `ONLY=<name>` narrows it, exactly as it does on the browser side — the
 * filtering is the roster module's own, not a second implementation of it.
 *
 * @returns {Promise<Array<{firstName: string, lastName: string, email: string,
 *   password: string, phone: string, teamName: string, teamDescription?: string,
 *   level: string}>>}
 */
async function coaches() {
  const { selectedCoaches } = await load('coach-roster.js');
  return selectedCoaches();
}

/**
 * Every athlete, with the team they join and the category they are entered in.
 *
 * `ONLY=`, `TEAM=` and `AGE_GROUP=` narrow it, through the roster module's own
 * `selectedRoster`.
 *
 * @returns {Promise<Array<{firstName: string, lastName: string, email: string,
 *   password: string, phone: string, gender: string, dateOfBirth: string,
 *   teamName: string, ageGroup: string, apparatus: string[]}>>}
 */
async function players() {
  const { selectedRoster } = await load('roster.js');
  return selectedRoster();
}

/**
 * Every judge in the pool the panel plan seats from.
 *
 * @returns {Promise<Array<{firstName: string, lastName: string, email: string,
 *   password: string, phone: string, stateUnit: string, certificationLevel: string}>>}
 */
/** Every coach, ignoring ONLY= — for finding a team's coach from a player. */
async function allCoaches() {
  const { COACH_ROSTER } = await load('coach-roster.js');
  return COACH_ROSTER;
}

/** The default password a coach gives the children they register (people.js). */
async function playerDefaultPasswordFor(coach) {
  const { playerDefaultPasswordFor: derive } = await load('people.js');
  return derive(coach);
}

/** Who a team enters at the n-th meet of its level (roster.js squadAt: generated squads rotate). */
async function squadAt(teamName, meetIndex, people) {
  const { squadAt: pick, ROSTER } = await load('roster.js');
  return pick(teamName, meetIndex, people || ROSTER);
}

/** Every athlete, ignoring ONLY= / TEAM= — what a whole season must contain. */
async function allPlayers() {
  const { ROSTER } = await load('roster.js');
  return ROSTER;
}

async function judges() {
  const { selectedJudges } = await load('judge-roster.js');
  return selectedJudges();
}

/**
 * The WHOLE judge pool, whatever `ONLY=` says.
 *
 * `judges()` above answers "who am I seeding this run", which is a narrowable
 * question. This one answers "who could be sitting on a panel", which is not:
 * the panel plan seats from the full pool, so a consumer that needs a seated
 * judge's credentials — `seedScores.js` signing in as six of them — must be
 * able to find any of the sixteen. Reading the narrowed list there would turn
 * an unrelated `ONLY=Rajesh` left in the environment into "that judge has no
 * password", naming the roster for what is really a filter.
 *
 * @returns {Promise<Array<{firstName: string, lastName: string, email: string,
 *   password: string, phone: string, stateUnit: string, certificationLevel: string}>>}
 */
async function allJudges() {
  const { JUDGE_ROSTER } = await load('judge-roster.js');
  return JUDGE_ROSTER;
}

/**
 * The meets one team enters: all three at its own level.
 *
 * Resolved from `lib/meets.js` rather than from the browser suite's copy of the
 * same question. Both read `seed/meets.json`, so the answer is identical; this
 * way the Server side needs no second file URL for something it already knows.
 *
 * @param {{level: string}} coach
 * @returns {Array<{place: string, level: string, startDate: string}>}
 */
const meetsForCoach = (coach) => meetsAtLevel(coach.level);

/**
 * Narrow a coach's meets the way the browser suite's `LEVEL=` and `PLACE=` do.
 *
 * Same variable names on purpose: `LEVEL=state npm --prefix Server run
 * setup:api -- --only=squads` should mean what it means on the other side.
 *
 * @param {{level: string}} coach
 */
function selectedMeetsForCoach(coach) {
  const { LEVEL, PLACE } = process.env;
  let meets = meetsForCoach(coach);
  if (LEVEL) meets = meets.filter((m) => m.level === LEVEL);
  if (PLACE) meets = meets.filter((m) => m.place === PLACE);
  return meets;
}

module.exports = {
  coaches, allCoaches, players, allPlayers, squadAt, judges, allJudges, playerDefaultPasswordFor, meetsForCoach, selectedMeetsForCoach,
};
