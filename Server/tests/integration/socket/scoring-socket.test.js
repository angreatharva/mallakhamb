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
