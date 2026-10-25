#!/usr/bin/env node
/**
 * Should the lifecycle check run now? Asked of the REAL system, read-only,
 * before anything starts (deploy/server/bin/mallakhamb-e2e).
 *
 *   MONGODB_URI=<the app's database> node scripts/e2eGuard.js [--live-api http://127.0.0.1:5000]
 *
 * Exit 0 = go. Exit 10 = skip, with ONE line saying why. Anything else = the
 * guard itself failed (the runner then skips too: an unanswered question is
 * not a yes).
 *
 * Skips when:
 *   - a meet is on TODAY or TOMORROW (India time), or ended yesterday — judges
 *     are seated, coaches pay late, and walk-ins arrive around a meet day.
 *     A meet whose dates span more than LONG_WINDOW_DAYS is a date window, not
 *     a meet day (staging's SGAM-TRIALS-1 runs 26 Sep – 31 Dec, which would
 *     skip every run for three months): it counts only while scores for it
 *     were saved in the last SCORING_HOURS hours;
 *   - anyone touched a walk-in desk form in the last hour;
 *   - the live API is busy (more than E2E_BUSY_RPS requests a second, default
 *     1, over 20 s) — only asked when --live-api is given, i.e. on the VM that
 *     is serving; METRICS_TOKEN must be set for it to answer.
 *
 * It reads four things and writes nothing: competitions (dates), scores
 * (updatedAt, long windows only), walk-in drafts (updatedAt), and the API's
 * own /metrics counter.
 */
const mongoose = require('mongoose');

const SKIP = 10;
const LONG_WINDOW_DAYS = 7;
const SCORING_HOURS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = (5 * 60 + 30) * 60 * 1000;

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};

/** Midnight India time of the day `offset` days from `now`, as a UTC instant. */
function istMidnight(now, offset = 0) {
  const ist = new Date(now.getTime() + IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + offset) - IST_MS);
}

/**
 * The meets close enough to now that a run must not compete with them:
 * running on [yesterday 00:00 IST, day-after-tomorrow 00:00 IST).
 * Pure, for the tests.
 */
function meetsNearby(meets, now = new Date()) {
  const from = istMidnight(now, -1);
  const to = istMidnight(now, 2);
  return meets.filter((m) => {
    // Dates are calendar days, whether stored as UTC or as India midnight: a
    // meet runs from the start of its first day to the end of its last, in IST.
    const start = istMidnight(new Date(m.startDate), 0);
    const end = istMidnight(new Date(m.endDate || m.startDate), 1);
    return start < to && end > from;
  });
}

/**
 * Splits nearby meets into real meet days and long date windows (more than
 * LONG_WINDOW_DAYS from first to last day). Pure, for the tests.
 */
function byLength(meets) {
  const days = (m) => Math.round((new Date(m.endDate || m.startDate) - new Date(m.startDate)) / DAY_MS) + 1;
  return {
    short: meets.filter((m) => days(m) <= LONG_WINDOW_DAYS),
    long: meets.filter((m) => days(m) > LONG_WINDOW_DAYS),
  };
}

/** Total requests the API has answered, from its Prometheus histogram. */
async function requestCount(api, token) {
  const res = await fetch(`${api.replace(/\/+$/, '')}/metrics`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`/metrics answered ${res.status}`);
  const text = await res.text();
  let total = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('http_server_requests_seconds_count')) total += Number(line.split(' ').pop()) || 0;
  }
  return total;
}

async function main() {
  const skip = (why) => { console.log(`E2E SKIPPED: ${why}`); process.exit(SKIP); };
  const now = new Date();

  await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'secondaryPreferred', serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const meets = await db.collection('competitions')
    .find({ isDeleted: { $ne: true } }, { projection: { name: 1, place: 1, startDate: 1, endDate: 1 } })
    .toArray();
  const { short, long } = byLength(meetsNearby(meets, now));
  const scoring = [];
  for (const m of long) {
    const n = await db.collection('scores')
      .countDocuments({ competition: m._id, updatedAt: { $gte: new Date(now.getTime() - SCORING_HOURS * 60 * 60 * 1000) } });
    if (n > 0) scoring.push(m);
  }
  const desk = await db.collection('walkinregistrations')
    .countDocuments({ updatedAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } });
  await mongoose.disconnect();

  const day = (d) => new Date(d).toISOString().slice(0, 10);
  if (short.length) {
    skip(`meet day — ${short.map((m) => `${m.name} ${m.place} (${day(m.startDate)})`).join(', ')} is on yesterday, today or tomorrow (IST)`);
  }
  if (scoring.length) {
    skip(`scoring is on — ${scoring.map((m) => `${m.name} ${m.place}`).join(', ')} saved scores in the last ${SCORING_HOURS} h`);
  }
  if (long.length) {
    console.log(`E2E GUARD: ${long.map((m) => `${m.name} ${m.place} (${day(m.startDate)} – ${day(m.endDate)})`).join(', ')} is a date window with no scoring in the last ${SCORING_HOURS} h — not a meet day`);
  }
  if (desk > 0) skip(`the walk-in desk was used in the last hour (${desk} form(s))`);

  const live = arg('live-api');
  if (live) {
    const limit = Number(process.env.E2E_BUSY_RPS || 1);
    const a = await requestCount(live, process.env.METRICS_TOKEN);
    await new Promise((resolve) => setTimeout(resolve, 20000));
    const b = await requestCount(live, process.env.METRICS_TOKEN);
    const rps = (b - a) / 20;
    if (rps > limit) skip(`the live API is busy: ${rps.toFixed(1)} requests/s over 20 s (limit ${limit})`);
    console.log(`E2E GUARD: go — no meet near, desk idle, live API at ${rps.toFixed(2)} requests/s`);
  } else {
    console.log('E2E GUARD: go — no meet near, desk idle (no live API on this VM)');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`E2E GUARD: could not decide (${error.message})`);
    process.exit(2);
  });
}

module.exports = { meetsNearby, istMidnight, byLength };
