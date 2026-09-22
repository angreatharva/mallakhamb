/**
 * Live scoring over Socket.IO — the half of the API nothing here measured.
 *
 *   node scripts/perf/socketLoad.js
 *   node scripts/perf/socketLoad.js --panels=12 --slips=40
 *
 * Every other harness in this directory drives HTTP. But a judge scoring a
 * performance does not POST and wait — they emit `score_update`, and the panel
 * sees each other's marks in real time. That path has integration tests for
 * CORRECTNESS and had no measurement at all, which meant the busiest minute of a
 * competition — a panel of five all marking the same performer — was the one
 * minute nobody had numbers for.
 *
 * What it measures:
 *
 *   connect       handshake, including token verification and the auto-join
 *                 that puts a judge in their category's room
 *   fan-out       time from one judge emitting a slip to every OTHER judge on
 *                 the panel receiving it — the number a judge actually feels
 *   throughput    slips per second a full panel sustains
 *   delivery      that every panel member got every slip
 *
 * It deliberately does NOT check cross-panel isolation. The obvious test —
 * listen on another panel and assert nothing arrives — is meaningless against
 * this fixture: seedScale.js seats the SAME six accounts on every category, so
 * a listener from "another panel" is the same judge, legitimately auto-joined to
 * the emitting panel's room. The first version of this script reported 20 leaks
 * for exactly that reason and every one was correct behaviour.
 *
 * Cross-room authorization is covered where it can be set up honestly, with a
 * judge seated on one category only: tests/security/socket-scoring.security.test.js.
 */

const { io } = require('socket.io-client');

const { startHarnessServer } = require('./lib/harness-server');
const { ApiClient } = require('./lib/client');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';
const PASSWORD = 'Perftest@2026';

/** The seats seedScale.js fills on every category, in panel order. */
const SEATS = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer'];

/** @param {string[]} argv */
function parseArgs(argv) {
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    panels: Number(flag('panels', 6)),
    slips: Number(flag('slips', 30)),
    json: argv.includes('--json'),
  };
}

const quantile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

const stat = (values) => ({
  n: values.length,
  p50: Number(quantile(values, 50).toFixed(1)),
  p95: Number(quantile(values, 95).toFixed(1)),
  max: Number(Math.max(...values, 0).toFixed(1)),
});

/**
 * Connect one judge and wait until the server has finished auto-joining them.
 *
 * `connect` fires when the handshake succeeds, which is BEFORE handleConnection
 * has resolved the judge's assignments and joined their rooms. Emitting at that
 * moment races the join and the slip goes nowhere — the integration suite hits
 * the same thing and waits for the same reason.
 *
 * @param {string} baseUrl
 * @param {string} token
 * @returns {Promise<{socket: Object, ms: number}>}
 */
function connectJudge(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 20000,
    });

    socket.on('connect_error', (error) => reject(new Error(`connect_error: ${error.message}`)));
    socket.on('connect', () => {
      // Timed at the handshake, NOT after the settle wait below — otherwise
      // every reading would be "150ms plus a bit" and the number would be
      // measuring this script's own sleep.
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      setTimeout(() => resolve({ socket, ms }), 150);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = await startHarnessServer({ uri: PERF_URI, sockets: true });
  const mongoose = require('mongoose');
  const Competition = require('../../src/models/Competition');
  const Judge = require('../../src/models/Judge');

  const competition = await Competition.findOne({ name: 'Perf Benchmark Championship' }).lean();
  if (!competition) throw new Error('No perf fixture — run seedScale.js first.');
  const competitionId = String(competition._id);

  // Sign in each seat once over HTTP; the socket handshake takes the same token.
  const tokens = {};
  for (let seat = 0; seat < SEATS.length; seat += 1) {
    const client = new ApiClient({ baseUrl: server.baseUrl });
    const email = seat === 0 ? 'perf.judge1@perf.example.com' : `perf.judge.${seat}@perf.example.com`;
    await client.login('/api/judge/login', { email, password: PASSWORD });
    client.competitionId = competitionId;
    await client.put(`/api/judge/competition/${competitionId}/set`, {});
    tokens[SEATS[seat]] = client.bearer;
  }

  // The categories that actually have a seated panel.
  const seated = await Judge.find({ competition: competitionId, judgeAccount: { $ne: null } })
    .select('gender ageGroup competitionTypes')
    .lean();
  const categories = [...new Map(
    seated.map((row) => [`${row.gender}|${row.ageGroup}`, { gender: row.gender, ageGroup: row.ageGroup }])
  ).values()].slice(0, args.panels);

  process.stderr.write(`\nFixture: ${(competition.registeredTeams || []).length} teams, `
    + `${categories.length} panel(s) x ${SEATS.length} seats, ${args.slips} slips each\n\n`);

  // ---- connect every seat on every panel ----
  const connectTimes = [];
  const panels = [];
  for (const category of categories) {
    const sockets = [];
    for (const seat of SEATS) {
      const { socket, ms } = await connectJudge(server.baseUrl, tokens[seat]);
      connectTimes.push(ms);
      sockets.push({ seat, socket });
    }
    panels.push({ category, sockets });
  }

  process.stderr.write(`connect       ${JSON.stringify(stat(connectTimes))}\n`);

  // ---- fan-out: one judge emits, the rest of the panel receives ----
  const roomId = (c) => `scoring_${c.gender}_${c.ageGroup}_Competition I`;

  const fanOut = [];
  const started = Date.now();

  for (const panel of panels) {
    const room = roomId(panel.category);
    const [sender, ...listeners] = panel.sockets;

    for (let i = 0; i < args.slips; i += 1) {
      const marker = `${room}#${i}`;
      const sentAt = process.hrtime.bigint();

      const heard = listeners.map((listener) => new Promise((resolve) => {
        const onUpdate = (payload) => {
          if (payload?.playerName !== marker) return;
          listener.socket.off('score_updated', onUpdate);
          resolve(Number(process.hrtime.bigint() - sentAt) / 1e6);
        };
        listener.socket.on('score_updated', onUpdate);
        // Never hang the run on a slip that is not coming.
        setTimeout(() => { listener.socket.off('score_updated', onUpdate); resolve(null); }, 4000);
      }));

      sender.socket.emit('score_update', {
        roomId: room,
        playerId: String(new mongoose.Types.ObjectId()),
        teamId: String(new mongoose.Types.ObjectId()),
        playerName: marker,
        judgeType: sender.seat,
        score: 8.4,
      });

      const results = await Promise.all(heard);
      results.filter((ms) => ms !== null).forEach((ms) => fanOut.push(ms));
    }
  }

  const elapsed = (Date.now() - started) / 1000;
  const slipsSent = panels.length * args.slips;

  process.stderr.write(`fan-out       ${JSON.stringify(stat(fanOut))}\n`);
  process.stderr.write(`throughput    ${(slipsSent / elapsed).toFixed(1)} slips/s `
    + `(${slipsSent} slips, ${fanOut.length} deliveries, ${elapsed.toFixed(1)}s)\n`);

  const expected = slipsSent * (SEATS.length - 1);
  const lost = expected - fanOut.length;
  process.stderr.write(`delivery      ${fanOut.length}/${expected}`
    + `${lost > 0 ? ` — ${lost} NOT DELIVERED` : ' — all delivered'}\n`);

  for (const panel of panels) panel.sockets.forEach(({ socket }) => socket.close());

  if (args.json) {
    process.stdout.write(JSON.stringify({
      connect: stat(connectTimes),
      fanOut: stat(fanOut),
      slipsPerSecond: Number((slipsSent / elapsed).toFixed(1)),
      delivered: fanOut.length,
      expected,
    }, null, 2));
  }

  await server.close();
  await mongoose.disconnect().catch(() => {});
  // An undelivered slip is a failure, not a slow number.
  process.exit(lost > 0 ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`socketLoad failed: ${error.stack}\n`);
  process.exit(1);
});
