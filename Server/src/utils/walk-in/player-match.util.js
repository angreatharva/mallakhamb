/**
 * Is the child on this paper row someone who already has a Player ID?
 *
 * The desk must not hand one child two IDs, and the photo it works from is
 * imperfect: the reader may get one letter of a name wrong, or one digit of a
 * date, and coaches write "SAI MORE" where the account says "Sai More".
 * So a row is compared, not just looked up:
 *
 *  - exact — the same name and the same date of birth;
 *  - close — the same date of birth and a name within two letters (or first
 *            and last written the other way round), or the same name and a date
 *            one digit off or with day and month swapped.
 *
 * Pure: the service fetches the candidates, this decides what they are.
 *
 * @module utils/walk-in/player-match
 */

/** "D&#x27;SOUZA", "d'souza", "D SOUZA" → "DSOUZA" */
function normName(value) {
  return String(value || '')
    .replace(/&#x27;|&#39;/gi, "'")
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Date (or ISO string) → "YYYY-MM-DD" in UTC, or ''. */
function isoDay(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** One digit different, or DD and MM swapped. */
function nearDate(a, b) {
  if (!a || !b || a === b) return false;
  const [ay, am, ad] = a.split('-');
  const [by, bm, bd] = b.split('-');
  if (ay === by && am === bd && ad === bm) return true;
  const x = a.replace(/-/g, '');
  const y = b.replace(/-/g, '');
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) diff += 1;
  return diff === 1;
}

const MAX_NAME_DISTANCE = 2;

/**
 * @param {{firstName: string, lastName: string, dateOfBirth: string}} row - DOB as YYYY-MM-DD
 * @param {{firstName: string, lastName: string, dateOfBirth: Date|string}} player
 * @returns {'exact'|'close'|null}
 */
function matchKind(row, player) {
  const rf = normName(row.firstName);
  const rl = normName(row.lastName);
  const pf = normName(player.firstName);
  const pl = normName(player.lastName);
  if (!rf || !rl || !pf || !pl) return null;
  const rd = row.dateOfBirth || '';
  const pd = isoDay(player.dateOfBirth);
  const sameName = rf === pf && rl === pl;
  const sameDate = Boolean(rd) && rd === pd;

  if (sameName && sameDate) return 'exact';
  if (sameDate) {
    const swapped = rf === pl && rl === pf;
    if (swapped || levenshtein(rf + rl, pf + pl) <= MAX_NAME_DISTANCE) return 'close';
  }
  if (sameName && nearDate(rd, pd)) return 'close';
  return null;
}

module.exports = { normName, levenshtein, isoDay, nearDate, matchKind, MAX_NAME_DISTANCE };
