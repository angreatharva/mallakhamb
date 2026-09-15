/**
 * The judge pool, read from `seed/judges.json`.
 *
 * One file, read by both stacks — `Web/e2e/support/judge-roster.js` is the
 * mirror of this on the browser side. The panel plan used to hardcode six seat
 * emails here, separately from the roster that created those accounts, so
 * seating a judge who had never registered failed deep inside the admin screen
 * with a name that was simply not in the search results.
 *
 * @module scripts/lib/judges
 */

const { readFileSync } = require('node:fs');
const path = require('node:path');

const JUDGES_PATH = path.join(__dirname, '..', 'seed', 'judges.json');

/**
 * How an account is identified, everywhere.
 *
 * Mirrors `emailFor` in `Web/e2e/support/people.js`. Derived on both sides
 * rather than stored, so a judge who is renamed cannot end up with a seat
 * pointing at their old address.
 *
 * @param {{firstName: string, lastName: string}} person
 * @returns {string}
 */
const emailFor = ({ firstName, lastName }) =>
  `${firstName}.${lastName[0]}@gmail.com`.toLowerCase();

let cached = null;

/** Every judge, with the derived email attached. */
function allJudges() {
  if (cached) return cached;

  let raw;
  try {
    raw = JSON.parse(readFileSync(JUDGES_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read the judge pool at ${JUDGES_PATH}: ${error.message}`);
  }

  if (!Array.isArray(raw.judges) || raw.judges.length === 0) {
    throw new Error(`${JUDGES_PATH} has no judges in it.`);
  }

  const judges = raw.judges.map((judge) => ({ ...judge, email: emailFor(judge) }));

  const seen = new Set();
  for (const judge of judges) {
    if (seen.has(judge.email)) {
      throw new Error(
        `${JUDGES_PATH}: "${judge.email}" is produced by two judges. ` +
        'Emails are firstname.<surname initial>, so change one of the names.'
      );
    }
    seen.add(judge.email);
  }

  cached = judges;
  return judges;
}

/** Just the emails, in roster order. */
const judgeEmails = () => allJudges().map((judge) => judge.email);

module.exports = { JUDGES_PATH, emailFor, allJudges, judgeEmails };
