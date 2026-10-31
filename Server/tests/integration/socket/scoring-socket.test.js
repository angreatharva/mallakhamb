/**
 * Socket.IO end-to-end (HIGH-5).
 *
 * `tests/integration/socket/` held only a README saying the tests here were
 * abandoned because the metricsCollector was hard to mock. Using the real
 * `bootstrap()` and `initializeSocketIO()` sidesteps that entirely — nothing is
 * mocked except the clock-free parts of the environment.
 *
 * The HIGH-5 unit tests drive the authorization predicate with fake socket
 * objects. That proves the decision logic but not the transport: whether a real
 * client can connect, whether auto-join actually puts a judge in the right
 * rooms, and whether a broadcast reaches the other judges. This closes that.
 */

const { createServer } = require('http');
const { io: ioClient } = require('socket.io-client');
const mongoose = require('mongoose');

const { bootstrap, initializeSocketIO } = require('../../../src/infrastructure/bootstrap');
const EventTypes = require('../../../src/socket/events/event-types');
const Judge = require('../../../src/models/Judge');
const JudgeAccount = require('../../../src/models/JudgeAccount');

let httpServer;
let container;
let port;
const openClients = [];

/** Connect a client and resolve once connected, or reject on refusal. */
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      timeout: 8000,
    });
    openClients.push(socket);
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', async () => {
      // The client's `connect` fires as soon as the handshake succeeds, but the
      // server is still awaiting autoJoinJudgeRoom — which does database I/O —
      // before it calls registerSocketEvents. Emitting immediately therefore
      // lands before any listener exists and is silently dropped.
      //
      // Not a product defect: the real client emits on a user action, long
      // after connect. But a test that emits instantly will flake without this.
      await waitForServerReady(socket);
      resolve(socket);
    });
  });
}

/**
 * Give the server time to finish handleConnection (auto-join + event
 * registration). Polls the server-side socket for its cached room set rather
 * than sleeping a flat interval.
 */
async function waitForServerReady(clientSocket, timeout = 5000) {
  const manager = container.resolve('socketManager');
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const serverSocket = manager.io?.sockets?.sockets?.get(clientSocket.id);
    if (serverSocket?.judgeRoomIds) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

/** Wait for one event, or resolve null after `ms`. */
function waitFor(socket, event, ms = 1200) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const competitionId = new mongoose.Types.ObjectId();

/**
 * A registered judge seated on a panel. The socket identity is the ACCOUNT —
 * the seats are what the auto-join reads to decide which rooms to join.
 */
async function createJudge({ judgeNo, judgeType, username, gender = 'Male', ageGroup = 'Under14' }) {
  const account = await JudgeAccount.create({
    firstName: judgeType.replace(/\s+/g, ''),
    lastName: username,
    email: `${username}@club.in`,
    password: 'JudgeSecret1',
    isActive: true,
  });

  const judge = await Judge.create({
    judgeAccount: account._id,
    competition: competitionId,
    competitionTypes: ['competition_1'],
    gender,
    ageGroup,
    judgeNo,
    judgeType,
    isActive: true,
  });

  return { judge, account };
}

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET
    || '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';

  const booted = bootstrap();
  container = booted.container;

  httpServer = createServer();
  initializeSocketIO(httpServer);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterEach(() => {
  while (openClients.length) {
    const s = openClients.pop();
    if (s?.connected) s.disconnect();
    s?.close?.();
  }
});

afterAll(async () => {
  if (httpServer) await new Promise((r) => httpServer.close(r));
  const manager = container?.resolve?.('socketManager');
  if (manager?.io) manager.io.close();
});

/** Real JWT for a persisted judge — subject is the account. */
function tokenFor(principal) {
  const account = principal?.account || principal;
  return container.resolve('tokenService').generateToken(String(account._id), 'judge', String(competitionId));
}

describe('socket authentication', () => {
  test('refuses a connection with no token', async () => {
    await expect(connect(null)).rejects.toThrow(/token|auth/i);
  });

  test('refuses a forged token', async () => {
    await expect(connect('not-a-real-jwt')).rejects.toThrow();
  });

  test('accepts an authenticated judge', async () => {
    const judge = await createJudge({ judgeNo: 1, judgeType: 'Judge 1', username: 'sockj1' });
    const socket = await connect(tokenFor(judge));

    expect(socket.connected).toBe(true);
  });
});

describe('HIGH-5 — scoring rooms over a real transport', () => {
  const room = 'scoring_Male_Under14_competition_1';

  const slip = (overrides = {}) => ({
    roomId: room,
    playerId: String(new mongoose.Types.ObjectId()),
    teamId: String(new mongoose.Types.ObjectId()),
    judgeType: 'Judge 1',
    score: 8.4,
    ...overrides,
  });

  test('a judge is auto-joined to their assigned room and receives a panel broadcast', async () => {
    const j1 = await createJudge({ judgeNo: 1, judgeType: 'Judge 1', username: 'rj1' });
    const j2 = await createJudge({ judgeNo: 2, judgeType: 'Judge 2', username: 'rj2' });

    const s1 = await connect(tokenFor(j1));
    const s2 = await connect(tokenFor(j2));

    // Auto-join happens on connect; no explicit join needed.
    const received = waitFor(s2, EventTypes.SCORE_UPDATED);
    s1.emit(EventTypes.SCORE_UPDATE, slip({ score: 8.4 }));

    const payload = await received;
    expect(payload).not.toBeNull();
    expect(payload.score).toBe(8.4);
  });

  test('the broadcast judgeType comes from the socket identity, not the payload', async () => {
    const j2 = await createJudge({ judgeNo: 2, judgeType: 'Judge 2', username: 'stampj2' });
    const listener = await createJudge({ judgeNo: 3, judgeType: 'Judge 3', username: 'stampj3' });

    const sender = await connect(tokenFor(j2));
    const observer = await connect(tokenFor(listener));

    const received = waitFor(observer, EventTypes.SCORE_UPDATED);
    // Judge 2 claims to be the Senior Judge — the impersonation from HIGH-1/5.
    sender.emit(EventTypes.SCORE_UPDATE, slip({ judgeType: 'Senior Judge', score: 10 }));

    const payload = await received;
    expect(payload).not.toBeNull();
    expect(payload.judgeType).toBe('Judge 2');
  });

  test('a judge from another category cannot broadcast into this room', async () => {
    const insider = await createJudge({ judgeNo: 1, judgeType: 'Judge 1', username: 'inside1' });
    // Same competition, different age group — not assigned to `room`.
    const outsider = await createJudge({
      judgeNo: 2, judgeType: 'Judge 1', username: 'outside1', ageGroup: 'Under18',
    });

    const inside = await connect(tokenFor(insider));
    const outside = await connect(tokenFor(outsider));

    const received = waitFor(inside, EventTypes.SCORE_UPDATED, 1000);
    // socket.manager surfaces handler failures on the generic 'error' event.
    // NOTE: two client files also listen for 'score_update_error', which the
    // server never emits — dead listeners, removed alongside this test.
    const errored = waitFor(outside, 'error', 1000);

    outside.emit(EventTypes.SCORE_UPDATE, slip({ score: 9.9 }));

    // The forged broadcast must never reach the panel.
    expect(await received).toBeNull();
    // And the sender is told why, rather than failing silently.
    expect(await errored).not.toBeNull();
  });
});

/** Mint a token for a role socket auth never looks up in the DB. */
/**
 * A token for a real, active account of this role. The handshake refuses a
 * token whose account is missing or deactivated, exactly as the HTTP auth
 * middleware does (security audit 2026-10-31, L5), so the account must exist.
 */
async function tokenForRole(userType, compId = competitionId) {
  const id = new mongoose.Types.ObjectId();
  const collection = { admin: 'admins', coach: 'coaches', player: 'players' }[userType];
  await mongoose.connection.collection(collection).insertOne({
    _id: id, name: `Socket ${userType}`, firstName: 'Socket', lastName: userType,
    email: `socket.${id}@example.com`, isActive: true, role: userType === 'admin' ? 'admin' : undefined,
  });
  return container.resolve('tokenService').generateToken(String(id), userType, String(compId));
}

describe('competition rooms over a real transport', () => {
  // Regression coverage for a live defect found while building Server/MEMORY:
  // several real broadcasts (team approval/rejection, age-group start/end,
  // score lock/unlock, competition update) target `competition_{id}`, and
  // nothing ever joined that room — the broadcasts reached nobody.

  test('a socket auto-joins its own competition room at connect', async () => {
    const admin = await connect(await tokenForRole('admin'));
    const observer = await connect(await tokenForRole('admin'));

    const received = waitFor(observer, 'competition_updated');
    container.resolve('socketManager').emitToRoom(
      `competition_${competitionId}`,
      'competition_updated',
      { competitionId: String(competitionId) }
    );

    const payload = await received;
    expect(payload).not.toBeNull();
    expect(admin.connected).toBe(true);
  });

  test('an admin may explicitly join a different competition room', async () => {
    const otherCompetitionId = new mongoose.Types.ObjectId();
    const admin = await connect(await tokenForRole('admin'));

    const joined = waitFor(admin, EventTypes.ROOM_JOINED);
    admin.emit(EventTypes.JOIN_COMPETITION_ROOM, { competitionId: String(otherCompetitionId) });

    const ack = await joined;
    expect(ack).not.toBeNull();
    expect(ack.roomId).toBe(`competition_${otherCompetitionId}`);
  });

  test('a coach cannot join a competition room other than their own', async () => {
    const otherCompetitionId = new mongoose.Types.ObjectId();
    const coach = await connect(await tokenForRole('coach', competitionId));

    const errored = waitFor(coach, 'error', 1000);
    const joined = waitFor(coach, EventTypes.ROOM_JOINED, 1000);
    coach.emit(EventTypes.JOIN_COMPETITION_ROOM, { competitionId: String(otherCompetitionId) });

    expect(await joined).toBeNull();
    expect(await errored).not.toBeNull();
  });
});

describe('Time Keeper — a stopped time reaches the Scorer', () => {
  const room = 'scoring_Male_Under14_competition_1';
  const time = (overrides = {}) => ({
    roomId: room,
    playerId: String(new mongoose.Types.ObjectId()),
    teamId: String(new mongoose.Types.ObjectId()),
    apparatus: 'Pole Mallakhamb',
    seconds: 92,
    ...overrides,
  });

  test('the Time Keeper\'s time is relayed to the Scorer, named by the server', async () => {
    const keeper = await createJudge({ judgeNo: 7, judgeType: 'Time Keeper', username: 'tk1' });
    const scorer = await createJudge({ judgeNo: 6, judgeType: 'Scorer', username: 'sc1' });

    const tk = await connect(tokenFor(keeper));
    const sc = await connect(tokenFor(scorer));

    const received = waitFor(sc, EventTypes.TIME_RECORDED);
    const acked = waitFor(tk, EventTypes.TIME_RECORDED);
    tk.emit(EventTypes.TIME_RECORD, time({ seconds: 92 }));

    const payload = await received;
    expect(payload).not.toBeNull();
    expect(payload.seconds).toBe(92);
    expect(payload.apparatus).toBe('Pole Mallakhamb');
    // The account's own name, not anything the client could send.
    expect(payload.timeKeeperName).toMatch(/TimeKeeper/);
    // …and the Time Keeper is told it went.
    expect((await acked)?.ack).toBe(true);
  });

  test('a judge who is not the Time Keeper cannot record a time', async () => {
    const judge = await createJudge({ judgeNo: 2, judgeType: 'Judge 1', username: 'notk' });
    const scorer = await createJudge({ judgeNo: 6, judgeType: 'Scorer', username: 'sc2' });

    const j = await connect(tokenFor(judge));
    const sc = await connect(tokenFor(scorer));

    const received = waitFor(sc, EventTypes.TIME_RECORDED, 1000);
    const errored = waitFor(j, 'error', 1000);
    j.emit(EventTypes.TIME_RECORD, time());

    expect(await received).toBeNull();
    expect(await errored).not.toBeNull();
  });

  test('a Time Keeper from another category cannot record into this room', async () => {
    const outsider = await createJudge({
      judgeNo: 7, judgeType: 'Time Keeper', username: 'tkout', ageGroup: 'Under18',
    });
    const scorer = await createJudge({ judgeNo: 6, judgeType: 'Scorer', username: 'sc3' });

    const tk = await connect(tokenFor(outsider));
    const sc = await connect(tokenFor(scorer));

    const received = waitFor(sc, EventTypes.TIME_RECORDED, 1000);
    tk.emit(EventTypes.TIME_RECORD, time());

    expect(await received).toBeNull();
  });

  test('a time that is not whole seconds is refused', async () => {
    const keeper = await createJudge({ judgeNo: 7, judgeType: 'Time Keeper', username: 'tk2' });
    const scorer = await createJudge({ judgeNo: 6, judgeType: 'Scorer', username: 'sc4' });

    const tk = await connect(tokenFor(keeper));
    const sc = await connect(tokenFor(scorer));

    const received = waitFor(sc, EventTypes.TIME_RECORDED, 1000);
    const errored = waitFor(tk, 'error', 1000);
    tk.emit(EventTypes.TIME_RECORD, time({ seconds: 91.5 }));

    expect(await received).toBeNull();
    expect(await errored).not.toBeNull();
  });
});

describe('Prometheus socket metrics (deploy/monitoring/PLAN.md §5.4)', () => {
  /** Current value of a sample in the registry's text output, or 0. */
  async function valueOf(pattern) {
    const text = await container.resolve('metrics').metrics();
    const match = pattern.exec(text);
    return match ? Number(match[1]) : 0;
  }

  test('a received event is counted by name and the client shows as connected', async () => {
    const before = await valueOf(/^socketio_events_received_total\{event="score_update"\} (\d+)/m);

    const judge = await createJudge({ judgeNo: 1, judgeType: 'Judge 1', username: 'promj1' });
    const socket = await connect(tokenFor(judge));

    expect(await valueOf(/^socketio_connected_clients (\d+)/m)).toBeGreaterThanOrEqual(1);

    socket.emit(EventTypes.SCORE_UPDATE, {
      roomId: 'scoring_Male_Under14_competition_1',
      playerId: String(new mongoose.Types.ObjectId()),
      teamId: String(new mongoose.Types.ObjectId()),
      score: 8.1,
    });

    // The handler runs asynchronously on the server; poll briefly.
    const deadline = Date.now() + 3000;
    let after = before;
    while (Date.now() < deadline && after <= before) {
      await new Promise((r) => setTimeout(r, 50));
      after = await valueOf(/^socketio_events_received_total\{event="score_update"\} (\d+)/m);
    }
    expect(after).toBe(before + 1);
    expect(await valueOf(/^socketio_event_handler_seconds_count\{event="score_update"\} (\d+)/m))
      .toBeGreaterThanOrEqual(1);
  });
});
