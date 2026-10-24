/**
 * The coaches `register-coaches.spec.js` puts into the app.
 *
 * Email and password are derived from the name — see `people.js` for the
 * conventions and the import-time checks.
 *
 * A coach owns a team, and team names are shared across the app, so each entry
 * names the team it should create. The spec registers the coach and creates
 * that team; registering the team for a competition is a separate step with its
 * own money and deadlines, and is deliberately NOT automated here —
 * `build-squads.spec.js` does that.
 *
 * Phone numbers were generated randomly, once, and written down. A seed file
 * whose contents change every run cannot be re-run against an existing
 * database, diffed, or reconciled with what is already stored.
 *
 * These are fictional people for a development database.
 */

import { derive, onlyMatching, validateRoster } from './people.js';
import { LEVELS, meetsAtLevel } from './meets.js';

/**
 * @typedef {Object} CoachEntry
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} phone            10-digit Indian mobile, leading 6-9
 * @property {string} teamName         the team this coach creates
 * @property {string} level            which level's meets this team enters
 * @property {string} [teamDescription]
 */

/**
 * Three coaches, and so three teams, at each of the six levels — four at
 * university and DSO, which run four meets each.
 *
 * THREE IS A DELIBERATE FLOOR, not an arbitrary number. It is the smallest
 * field that gives a team ranking a genuine middle place — with two, every
 * result is first-or-last and a comparison bug that swaps them looks the same
 * as one that reverses the whole order. Every entered team's squad has to be
 * built once PER MEET, so each extra team is three more squads through an
 * eight-interaction modal; five made a rebuild an afternoon's work.
 *
 * ONE COACH PER TEAM. A coach can technically own several — `Team` is unique on
 * (name, coach) — but `Coach.team` only ever points at the last one created,
 * and the competition chooser reads `teams[0]`. So a coach with two teams has
 * one the UI cannot reach, which is a fixture that looks complete and behaves
 * oddly.
 *
 * `level` is what binds a team to meets. Each team enters ALL THREE meets at its
 * own level, which is what gets three teams into every one of the twelve
 * competitions without needing thirty-six distinct squads. A team entering
 * several meets is a supported path, not a shortcut: `registerTeam` only refuses
 * a duplicate entry into the SAME competition.
 *
 * Levels are also why the clubs are named in six families — a district club
 * appearing at an international meet is exactly the kind of detail that makes a
 * fixture read as fake.
 *
 * Mayur Pashte appears here, on the player roster and on the judge roster, and
 * that is intentional rather than a collision. Each role is a separate
 * collection with its own unique index on email, so `mayur.p@gmail.com` is
 * three independent accounts — the same convention that already gave Yatin
 * Nachre a coach login and a judge login. Signing in as the wrong one lands you
 * in the wrong dashboard, not in an error, so check the role portal first when
 * a login "works but shows nothing".
 *
 * @type {CoachEntry[]}
 */
const ENTRIES = [
  // ── district — Shivaji Gymkhana Akhada Mandal ─────────────────────────────
  // The three that predate the other levels. Registered by hand before this
  // file existed, which is why the player roster's 70 athletes all belong to
  // them; the seeder skips accounts that already exist, so re-running is safe.
  { firstName: 'Rajesh', lastName: 'Amrale', phone: '9146708325', teamName: 'SGAM-A', level: 'district', teamDescription: 'SGAM Team A' },
  { firstName: 'Naresh', lastName: 'Jadhav', phone: '7028915463', teamName: 'SGAM-B', level: 'district', teamDescription: 'SGAM Team B' },
  { firstName: 'Mayur', lastName: 'Pashte', phone: '8390612774', teamName: 'SGAM-C', level: 'district', teamDescription: 'SGAM Team C' },

  // ── state — Maharashtra State Akhada Mandal ───────────────────────────────
  { firstName: 'Ganesh', lastName: 'Deshmukh', phone: '9834126750', teamName: 'MSAM-A', level: 'state', teamDescription: 'MSAM Team A' },
  { firstName: 'Prakash', lastName: 'Salunkhe', phone: '8605731942', teamName: 'MSAM-B', level: 'state', teamDescription: 'MSAM Team B' },
  { firstName: 'Nilesh', lastName: 'Gaikwad', phone: '7020648153', teamName: 'MSAM-C', level: 'state', teamDescription: 'MSAM Team C' },

  // ── national — National Institute of Mallakhamb ───────────────────────────
  { firstName: 'Deepak', lastName: 'Rane', phone: '9028561473', teamName: 'NIMA-A', level: 'national', teamDescription: 'NIMA Team A' },
  { firstName: 'Sunil', lastName: 'Thorat', phone: '7385204916', teamName: 'NIMA-B', level: 'national', teamDescription: 'NIMA Team B' },
  { firstName: 'Kiran', lastName: 'Pawar', phone: '9673810542', teamName: 'NIMA-C', level: 'national', teamDescription: 'NIMA Team C' },

  // ── international — International Mallakhamb Sports Academy ───────────────
  { firstName: 'Rohit', lastName: 'Vaidya', phone: '9762014835', teamName: 'IMSA-A', level: 'international', teamDescription: 'IMSA Team A' },
  { firstName: 'Sameer', lastName: 'Kale', phone: '8329471605', teamName: 'IMSA-B', level: 'international', teamDescription: 'IMSA Team B' },
  { firstName: 'Jitendra', lastName: 'Wagh', phone: '7016482953', teamName: 'IMSA-C', level: 'international', teamDescription: 'IMSA Team C' },

  // ── university — All India University Mallakhamb ──────────────────────────
  // Added 2026-10-24 to grow the nightly e2e by a quarter. LAST on purpose: the
  // generated athletes are named by a counter that walks this list in order, so
  // appending leaves every earlier team's athletes (and their emails) unchanged.
  // These three squads also carry the no-email Player IDs — guardian, none and
  // coach-registered (roster-generated.js NO_EMAIL_SLOTS) — so every kind of
  // account is judged and published like any other.
  { firstName: 'Abhijit', lastName: 'Bhosale', phone: '9561247830', teamName: 'AIUM-A', level: 'university', teamDescription: 'AIUM Team A' },
  { firstName: 'Tushar', lastName: 'Mhatre', phone: '8007413962', teamName: 'AIUM-B', level: 'university', teamDescription: 'AIUM Team B' },
  { firstName: 'Vikram', lastName: 'Shinde', phone: '7387105624', teamName: 'AIUM-C', level: 'university', teamDescription: 'AIUM Team C' },
  { firstName: 'Sandeep', lastName: 'Gavali', phone: '9158204736', teamName: 'AIUM-D', level: 'university', teamDescription: 'AIUM Team D' },

  // ── dso — District Sports Office school teams ─────────────────────────────
  // Added with the four DSO meets. Also appended last, for the same reason.
  { firstName: 'Ajay', lastName: 'Mane', phone: '9604381527', teamName: 'DSOM-A', level: 'dso', teamDescription: 'DSO School Team A' },
  { firstName: 'Rupesh', lastName: 'Kokate', phone: '8669027413', teamName: 'DSOM-B', level: 'dso', teamDescription: 'DSO School Team B' },
  { firstName: 'Manoj', lastName: 'Tawde', phone: '7720915348', teamName: 'DSOM-C', level: 'dso', teamDescription: 'DSO School Team C' },
  { firstName: 'Sharad', lastName: 'Pingle', phone: '9370642185', teamName: 'DSOM-D', level: 'dso', teamDescription: 'DSO School Team D' },
];

export const COACH_ROSTER = derive(ENTRIES);

validateRoster(COACH_ROSTER, { label: 'Coach roster' });

/**
 * Every level must have meets to enter and teams to enter them.
 *
 * Checked at import so a half-finished edit fails here, naming the level, rather
 * than two steps later as an empty competition list on a chooser — which reads
 * as a broken app rather than as a roster that is short a team.
 */
const TEAMS_PER_LEVEL = 3;
// Only the levels the seed actually holds meets at. DSO and University are
// valid levels with no seeded meet, so they carry no teams either.
for (const level of LEVELS.filter((l) => meetsAtLevel(l).length > 0)) {
  const teams = COACH_ROSTER.filter((c) => c.level === level);
  if (teams.length < TEAMS_PER_LEVEL) {
    throw new Error(
      `Coach roster: "${level}" has ${teams.length} team(s); every level with meets needs at least ${TEAMS_PER_LEVEL}. ` +
      'Each team enters all three meets at its level, so this is what puts three teams in every competition.'
    );
  }
}

// The other direction: a team at a level with no meet has nothing to enter.
for (const level of LEVELS.filter((l) => meetsAtLevel(l).length === 0)) {
  const teams = COACH_ROSTER.filter((c) => c.level === level);
  if (teams.length > 0) {
    throw new Error(
      `Coach roster: "${level}" has ${teams.length} team(s) but no meets to enter. ` +
      'Add meets at that level to Server/scripts/seed/meets.json.'
    );
  }
}

const unknownLevel = COACH_ROSTER.find((c) => !LEVELS.includes(c.level));
if (unknownLevel) {
  throw new Error(
    `Coach roster: ${unknownLevel.teamName} has level "${unknownLevel.level}", ` +
    `which is not one of ${LEVELS.join(', ')}.`
  );
}

/** Which meets a team enters — all three at its own level. */
export const meetsForTeam = (teamName) => {
  const coach = COACH_ROSTER.find((c) => c.teamName === teamName);
  if (!coach) throw new Error(`No coach owns a team called "${teamName}".`);
  return meetsAtLevel(coach.level);
};

/** Every team name, in roster order. */
export const TEAM_NAMES = COACH_ROSTER.map((c) => c.teamName);

/** The coaches to seed this run — all of them, or `ONLY=<name>`. */
export const selectedCoaches = () => onlyMatching(COACH_ROSTER);
