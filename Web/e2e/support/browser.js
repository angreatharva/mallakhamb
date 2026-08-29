import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

/** Plumbing shared by every flow, regardless of role. */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Where the captured registration payloads are written.
 *
 * This file is the contract between the two seeding paths: the UI run records
 * exactly what each form POSTed, and `Server/scripts/seedAccounts.js` replays
 * those payloads straight into the database. The seeder therefore cannot
 * invent a field the form does not send, or miss one it does — which is how
 * the old judge seeder drifted into writing a shape the app had stopped using.
 *
 * Three sections, in the order the seeder must apply them:
 *
 *   registrations  {role, payload}          the accounts
 *   teams          {coachEmail, payload}    the team each coach created
 *   memberships    {playerEmail, teamName}  which team each player joined
 *   entries        {teamName, competition}  which meet each team entered
 *   squads         {playerEmail, ageGroup}  each athlete's place in that entry
 *
 * The last two are written by `build-squads.spec.js`. `Server/scripts/
 * captureEnvironment.js` writes the same two sections by reading a working
 * database, for the parts of an environment no form posts in one go — a panel
 * being the obvious one.
 *
 * An account alone is not a usable database. Dropping `teams` and replaying
 * only registrations gives you coaches stuck on /coach/create-team and players
 * with nothing to join, which is exactly what the seeder used to produce.
 *
 * Not committed: it holds plaintext passwords, and it is a record of one
 * environment's state rather than source. Regenerate it by running the UI
 * specs.
 */
export const CAPTURE_PATH = resolve(HERE, '../../../Server/scripts/seed/registrations.generated.json');

/** The API origin, for reading back what the UI actually stored. */
export const API_BASE = process.env.E2E_API_URL || 'http://localhost:5000/api';

/**
 * Console noise to tolerate, so the error check stays a real signal rather than
 * a permanent red.
 *
 * Empty, and worth keeping that way. It previously held the "frame-ancestors is
 * ignored when delivered via <meta>" warning, which turned out to be a genuine
 * misconfiguration rather than noise — the directive was doing nothing. Moving
 * it to a real response header (vite.config.js, render.yaml) removed the
 * warning at its source. Suppressing an error is the wrong first instinct; find
 * out why it fires before adding to this list.
 */
const IGNORED_CONSOLE = [];

/** Outcomes of a registration submit, for either role. */
export const REGISTERED = 'registered';
export const ALREADY_EXISTS = 'already-exists';

/**
 * Collect genuine console errors for the lifetime of a test.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]} live array, appended to as errors arrive
 */
export const watchConsole = (page) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  return errors;
};

/**
 * Assert no console errors were seen.
 * @param {string[]} errors - the array from watchConsole
 */
export const expectNoConsoleErrors = (errors) => {
  expect(errors, `Console errors during the run:\n${errors.join('\n')}`).toEqual([]);
};

/**
 * Wipe the client-side session so the next page load is a true cold start.
 * The app keeps its token in obfuscated localStorage (secureStorage), so
 * clearing the whole store is the reliable way to sign out.
 * @param {import('@playwright/test').Page} page
 */
export const clearSession = async (page) => {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
};

/**
 * GET a JSON endpoint through the browser's cookie jar, with retries.
 *
 * page.request shares the browser context's cookies, so the httpOnly
 * access_token comes along — and it skips CORS, which a page-side fetch to the
 * API origin would otherwise have to satisfy.
 *
 * Retried because a long run reuses keep-alive sockets, and one the server has
 * already closed surfaces as ECONNRESET before any response exists. That is a
 * connection flake, not a verdict on the data.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path - e.g. '/players/profile'
 * @returns {Promise<any>} the `data` field of the response body
 */
export const apiGet = async (page, path) => {
  let response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await page.request.get(`${API_BASE}${path}`);
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await page.waitForTimeout(500 * attempt);
    }
  }

  expect(response.ok(), `GET ${path} returned ${response.status()}`).toBe(true);
  return (await response.json()).data;
};

/**
 * The meet's id, looked up by place.
 *
 * The three seeded meets share a name and a year and differ only by place, so
 * the place is the only thing that identifies one — and the SCREENS cannot tell
 * them apart either: the navbar's picker labels the current meet
 * "<name> <year>", which reads identically for all three. Anything that needs
 * to be sure which one it is on has to ask the API.
 *
 * @param {import('@playwright/test').Page} page - signed in as anyone
 * @param {string} place
 */
export const competitionIdFor = async (page, place) => {
  const competitions = await apiGet(page, '/public/competitions');
  const list = competitions?.competitions || competitions || [];
  const found = list.find((c) => c.place === place);
  expect(found, `No competition in ${place}. Known: ${list.map((c) => c.place).join(', ')}`).toBeTruthy();
  return found._id;
};

/** The shape of an empty capture, and the list of sections it holds. */
const EMPTY_CAPTURE = {
  capturedAt: null,
  registrations: [],
  teams: [],
  memberships: [],
  entries: [],
  squads: [],
};

/**
 * Read-modify-write one section of the capture file.
 *
 * Per event rather than buffered to the end: Playwright specs get interrupted,
 * and a run that seeded forty players before dying should still leave forty
 * usable rows behind.
 *
 * `dedupe` decides what counts as the same event, so re-running a spec updates
 * a row instead of appending a second one — the seeder replays the file
 * top-to-bottom and would otherwise write the same person twice.
 *
 * @param {'registrations'|'teams'|'memberships'} section
 * @param {Object} entry
 * @param {(existing: Object) => boolean} dedupe - true for rows `entry` replaces
 */
const capture = (section, entry, dedupe) => {
  let captured = EMPTY_CAPTURE;
  try {
    captured = { ...EMPTY_CAPTURE, ...JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) };
  } catch {
    // First capture of this environment — start a fresh file.
  }

  captured[section] = [...captured[section].filter((row) => !dedupe(row)), entry];
  captured.capturedAt = new Date().toISOString();

  mkdirSync(dirname(CAPTURE_PATH), { recursive: true });
  writeFileSync(CAPTURE_PATH, `${JSON.stringify(captured, null, 2)}
`);
};

/**
 * Record one successful registration, keyed by role and email.
 *
 * @param {string} role - 'player' | 'coach' | 'judge'
 * @param {Object} payload - the exact request body the form sent
 */
const captureRegistration = (role, payload) => {
  const email = String(payload.email || '').toLowerCase();
  capture(
    'registrations',
    { role, payload },
    (row) => row.role === role && String(row.payload.email).toLowerCase() === email
  );
};

/**
 * Record a team a coach created.
 *
 * An account on its own is not a usable seed: a coach with no team cannot be
 * signed in past /coach/create-team, and every player in roster.js joins a team
 * by name. Before this, `seedAccounts.js` restored the three coaches and no
 * teams, so a replayed database had nothing for seventy players to join.
 *
 * Keyed by the OWNER's email, not by team name — Team.name is unique per coach,
 * not globally, and the seeder needs to know whose team it is anyway.
 *
 * @param {string} coachEmail - the coach who owns it
 * @param {Object} payload - the request body POST /coaches/team sent
 */
export const captureTeam = (coachEmail, payload) => {
  const owner = String(coachEmail).toLowerCase();
  capture('teams', { coachEmail: owner, payload }, (row) => row.coachEmail === owner);
};

/**
 * Record a team entering a competition.
 *
 * Keyed by team name and the competition's {name, place, year}, for the reason
 * captureMembership gives: the request carries ObjectIds, and an ObjectId means
 * nothing in the database the seeder writes to.
 *
 * @param {string} coachEmail - the coach who owns the team
 * @param {string} teamName
 * @param {{name: string, place: string, year: number}} competition
 */
export const captureEntry = (coachEmail, teamName, competition) => {
  const owner = String(coachEmail).toLowerCase();
  capture(
    'entries',
    { competition, teamName, coachEmail: owner, isSubmitted: false, paymentStatus: 'pending' },
    (row) => row.teamName === teamName && row.competition?.place === competition.place
  );
};

/**
 * Record one athlete's place in a squad: which group, which apparatus.
 *
 * This is the row that decides what a judge sees. A team can be entered in a
 * competition and still show up as "no eligible players" on every panel,
 * because eligibility is this — gender, age group and apparatus — not team
 * membership.
 *
 * @param {string} playerEmail
 * @param {string} teamName
 * @param {{name: string, place: string, year: number}} competition
 * @param {{gender: string, ageGroup: string, apparatus: string}} place
 */
export const captureSquad = (playerEmail, teamName, competition, place) => {
  const player = String(playerEmail).toLowerCase();
  capture(
    'squads',
    { competition, teamName, playerEmail: player, ...place },
    (row) => row.playerEmail === player && row.competition?.place === competition.place
  );
};

/**
 * Record a player joining a team, by team NAME.
 *
 * Deliberately not the request body. Every other capture in this file is the
 * literal payload the form sent, because that is the only honest description of
 * what the app does — but POST /players/team/join sends `{ teamId }`, and an
 * ObjectId means nothing in the fresh database the seeder writes to. Replaying
 * it would point players at a team that does not exist there, or worse, at
 * whatever now holds that id. The name is the part that survives the trip.
 *
 * @param {string} playerEmail
 * @param {string} teamName - as shown on the selection screen
 */
export const captureMembership = (playerEmail, teamName) => {
  const player = String(playerEmail).toLowerCase();
  capture('memberships', { playerEmail: player, teamName }, (row) => row.playerEmail === player);
};

/**
 * Click submit and read the outcome off the API response rather than a toast.
 *
 * The toast is the obvious thing to assert on and the wrong one: it is
 * transient, react-hot-toast animates it away within seconds, and a regex over
 * its text can match more than one node and blow up on strict mode. Miss that
 * window and a duplicate email surfaces as an unexplained twenty-second URL
 * timeout. The response is unambiguous and always there.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} endpoint - substring identifying the register call
 * @param {import('@playwright/test').Locator} submit
 * @param {string} [role] - when given, the request body is captured for the
 *   database seeder (see CAPTURE_PATH)
 * @returns {Promise<'registered'|'already-exists'>}
 */
export const submitAndReadOutcome = async (page, endpoint, submit, role = null) => {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes(endpoint) && r.request().method() === 'POST',
    { timeout: 20_000 }
  );
  await submit.click();
  const response = await responsePromise;

  if (response.status() === 409) return ALREADY_EXISTS;

  expect(
    response.status(),
    `POST ${endpoint} failed: ${await response.text()}`
  ).toBe(201);

  if (role) {
    // The REQUEST body, not the roster entry: this is the whole point of the
    // capture. What the form actually sends is the only honest description of
    // what an account is made of.
    try {
      captureRegistration(role, JSON.parse(response.request().postData() || '{}'));
    } catch (error) {
      // A failed capture must not fail a registration that already succeeded —
      // the account exists either way, and the seeder says when it is stale.
      console.warn(`Could not capture the ${role} payload: ${error.message}`);
    }
  }

  return REGISTERED;
};
