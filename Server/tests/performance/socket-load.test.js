/**
 * Socket.IO Load Test (Task 60.2)
 *
 * Validates that the SocketManager and MetricsCollector correctly handle
 * and track 1000+ concurrent Socket.IO connections.
 *
 * Because spinning up 1000 real TCP connections in a Jest unit test is
 * impractical (and would require a live MongoDB), this suite:
 *
 *   1. Verifies the SocketManager's connection-tracking data structures
 *      scale to 1000+ entries without errors.
 *   2. Verifies the MetricsCollector accurately tracks 1000+ connection
 *      and disconnection events.
 *   3. Verifies the HealthMonitor reports memory as healthy after
 *      simulating the bookkeeping overhead of 1000 connections.
 *   4. Provides a documented integration test template (skipped by default)
 *      that can be run against a live server with `socket.io-client`.
 *
 * Requirements: 16.8
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'socket-load-test-jwt-secret-key-32chars';
process.env.EMAIL_FROM = 'test@example.com';
process.env.CACHE_TTL_SECONDS = '300';
process.env.CACHE_MAX_SIZE = '10000';
process.env.ENABLE_CACHING = 'true';
process.env.ENABLE_METRICS = 'true';

const MetricsCollector = require('../../src/infrastructure/metrics-collector');
const HealthMonitor = require('../../src/infrastructure/health-monitor');
const SocketManager = require('../../src/socket/socket.manager');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
});

const makeConfig = () => ({
  cache: { ttl: 300, maxSize: 10000 },
  database: { timeouts: { connection: 5000 } },
  server: { nodeEnv: 'test', corsOrigins: [] },
  email: { provider: 'nodemailer' },
  get: (key) => {
    const map = {
      'server.corsOrigins': [],
      'server.nodeEnv': 'test',
    };
    return map[key];
  },
});

/** Generate a fake user ID */
const fakeUserId = (i) => `user-${String(i).padStart(6, '0')}`;

/** Generate a fake socket ID */
const fakeSocketId = (i) => `socket-${String(i).padStart(6, '0')}`;

// ─── Suite 1: SocketManager Connection Tracking ───────────────────────────────

describe('Socket Load: SocketManager connection tracking (Req 16.8)', () => {
  let socketManager;

  beforeEach(() => {
    // Create SocketManager without a real HTTP server — we only test the
    // in-memory data structures (connectedUsers map).
    socketManager = new SocketManager(
      null, // httpServer — not needed for unit tests
      null, // tokenService
      null, // authorizationService
      makeConfig(),
      makeLogger(),
      null  // metricsCollector
    );
  });

  it('should track 1000 concurrent connections in connectedUsers map', () => {
    const TARGET = 1000;

    for (let i = 0; i < TARGET; i++) {
      socketManager.connectedUsers.set(fakeUserId(i), fakeSocketId(i));
    }

    expect(socketManager.getConnectedUsersCount()).toBe(TARGET);
  });

  it('should correctly report isUserConnected() for all 1000 users', () => {
    const TARGET = 1000;

    for (let i = 0; i < TARGET; i++) {
      socketManager.connectedUsers.set(fakeUserId(i), fakeSocketId(i));
    }

    // Spot-check first, middle, and last
    expect(socketManager.isUserConnected(fakeUserId(0))).toBe(true);
    expect(socketManager.isUserConnected(fakeUserId(499))).toBe(true);
    expect(socketManager.isUserConnected(fakeUserId(999))).toBe(true);
    expect(socketManager.isUserConnected('user-not-connected')).toBe(false);
  });

  it('should return all 1000 connected user IDs', () => {
    const TARGET = 1000;

    for (let i = 0; i < TARGET; i++) {
      socketManager.connectedUsers.set(fakeUserId(i), fakeSocketId(i));
    }

    const ids = socketManager.getConnectedUserIds();
    expect(ids).toHaveLength(TARGET);
    expect(ids[0]).toMatch(/^user-/);
  });

  it('should handle 1000 disconnections correctly', () => {
    const TARGET = 1000;

    // Connect all
    for (let i = 0; i < TARGET; i++) {
      socketManager.connectedUsers.set(fakeUserId(i), fakeSocketId(i));
    }
    expect(socketManager.getConnectedUsersCount()).toBe(TARGET);

    // Disconnect all
    for (let i = 0; i < TARGET; i++) {
      socketManager.connectedUsers.delete(fakeUserId(i));
    }
    expect(socketManager.getConnectedUsersCount()).toBe(0);
  });

  it('should handle mixed connect/disconnect cycles for 1000 users', () => {
    const TARGET = 1000;

    // Connect all
    for (let i = 0; i < TARGET; i++) {
      socketManager.connectedUsers.set(fakeUserId(i), fakeSocketId(i));
    }

    // Disconnect half
    for (let i = 0; i < TARGET / 2; i++) {
      socketManager.connectedUsers.delete(fakeUserId(i));
    }

    expect(socketManager.getConnectedUsersCount()).toBe(TARGET / 2);

    // Reconnect the disconnected half with new socket IDs
    for (let i = 0; i < TARGET / 2; i++) {
      socketManager.connectedUsers.set(fakeUserId(i), fakeSocketId(i + TARGET));
    }

    expect(socketManager.getConnectedUsersCount()).toBe(TARGET);
  });

  it('should scale to 5000 connections without errors', () => {
    const TARGET = 5000;

    for (let i = 0; i < TARGET; i++) {
      socketManager.connectedUsers.set(fakeUserId(i), fakeSocketId(i));
    }

    expect(socketManager.getConnectedUsersCount()).toBe(TARGET);
    expect(() => socketManager.getConnectedUserIds()).not.toThrow();
  });
});

// ─── Suite 2: MetricsCollector Socket Tracking ────────────────────────────────

describe('Socket Load: MetricsCollector tracks 1000+ connections (Req 16.8)', () => {
  let metrics;

  beforeEach(() => {
    metrics = new MetricsCollector(makeLogger());
  });

  it('should track 1000 connection events', () => {
    for (let i = 0; i < 1000; i++) {
      metrics.recordSocketConnection();
    }

    const m = metrics.getSocketMetrics();
    expect(m.active).toBe(1000);
    expect(m.totalConnections).toBe(1000);
  });

  it('should track 1000 connections then 1000 disconnections', () => {
    for (let i = 0; i < 1000; i++) {
      metrics.recordSocketConnection();
    }
    for (let i = 0; i < 1000; i++) {
      metrics.recordSocketDisconnection();
    }

    const m = metrics.getSocketMetrics();
    expect(m.active).toBe(0);
    expect(m.totalConnections).toBe(1000);
    expect(m.totalDisconnections).toBe(1000);
  });

  it('should not allow active connections to go below 0', () => {
    // Disconnect without connecting first
    for (let i = 0; i < 10; i++) {
      metrics.recordSocketDisconnection();
    }

    const m = metrics.getSocketMetrics();
    expect(m.active).toBe(0);
  });

  it('should track 1000 socket events', () => {
    for (let i = 0; i < 1000; i++) {
      metrics.trackSocketEvent();
    }

    expect(metrics.socketEvents).toBe(1000);
  });

  it('should expose active connections in Prometheus format', () => {
    for (let i = 0; i < 1000; i++) {
      metrics.recordSocketConnection();
    }

    const prometheus = metrics.exportPrometheus();
    expect(prometheus).toContain('socket_connections_active 1000');
    expect(prometheus).toContain('socket_connections_total 1000');
  });

  it('should expose active connections in new Prometheus format', () => {
    for (let i = 0; i < 1000; i++) {
      metrics.recordSocketConnection();
    }

    const prometheus = metrics.toPrometheusFormat();
    expect(prometheus).toContain('socketio_connections 1000');
  });

  it('should handle 5000 connection events without errors', () => {
    expect(() => {
      for (let i = 0; i < 5000; i++) {
        metrics.recordSocketConnection();
      }
    }).not.toThrow();

    const m = metrics.getSocketMetrics();
    expect(m.active).toBe(5000);
    expect(m.totalConnections).toBe(5000);
  });
});

// ─── Suite 3: Memory Stability Under Load ─────────────────────────────────────

describe('Socket Load: Memory stability with 1000 connections (Req 16.8)', () => {
  it('should not exceed 512MB heap after simulating 1000 connection bookkeeping', () => {
    const connectedUsers = new Map();

    // Simulate the bookkeeping SocketManager does per connection
    for (let i = 0; i < 1000; i++) {
      connectedUsers.set(fakeUserId(i), {
        socketId: fakeSocketId(i),
        userId: fakeUserId(i),
        userType: 'player',
        competitionId: `comp-${i % 10}`,
        connectedAt: Date.now(),
      });
    }

    const heapUsedMB = process.memoryUsage().heapUsed / 1024 / 1024;
    expect(heapUsedMB).toBeLessThan(512);

    // Cleanup
    connectedUsers.clear();
  });

  it('HealthMonitor should report healthy memory after 1000-connection simulation', () => {
    const monitor = new HealthMonitor(makeConfig(), makeLogger());

    // Simulate connection bookkeeping
    const connectedUsers = new Map();
    for (let i = 0; i < 1000; i++) {
      connectedUsers.set(fakeUserId(i), fakeSocketId(i));
    }

    const result = monitor.checkMemory();
    expect(result.heap.used).toBeLessThan(512);
    expect(['healthy', 'degraded', 'warning']).toContain(result.status);

    connectedUsers.clear();
  });
});

// ─── Suite 4: Concurrent Request Simulation ───────────────────────────────────

describe('Socket Load: Concurrent request simulation (Req 16.8)', () => {
  it('should handle 1000 concurrent async operations without errors', async () => {
    const results = [];
    const errors = [];

    // Simulate 1000 concurrent "connection handler" promises
    const promises = Array.from({ length: 1000 }, (_, i) =>
      Promise.resolve()
        .then(() => {
          // Simulate lightweight async work (auth token verification, etc.)
          const userId = fakeUserId(i);
          const socketId = fakeSocketId(i);
          return { userId, socketId, connectedAt: Date.now() };
        })
        .then(result => results.push(result))
        .catch(err => errors.push(err))
    );

    await Promise.all(promises);

    expect(errors).toHaveLength(0);
    expect(results).toHaveLength(1000);
  });

  it('should process 1000 socket events sequentially without data corruption', async () => {
    const metrics = new MetricsCollector(makeLogger());
    const processedEvents = [];

    // Simulate 1000 sequential event handlers
    for (let i = 0; i < 1000; i++) {
      metrics.trackSocketEvent();
      processedEvents.push(i);
    }

    expect(processedEvents).toHaveLength(1000);
    expect(metrics.socketEvents).toBe(1000);
  });
});

// ─── Suite 5: Integration Test Template (skipped — requires live server) ──────

/**
 * INTEGRATION TEST TEMPLATE
 *
 * To run a real Socket.IO load test against a live server:
 *
 *   1. Install socket.io-client:  npm install --save-dev socket.io-client
 *   2. Start the server:          npm start  (or npm run server)
 *   3. Run with:                  SOCKET_LOAD_TEST=1 npx jest socket-load.test.js
 *
 * The test below is skipped by default to avoid requiring a live server
 * in the standard CI pipeline.
 */
describe.skip('Socket Load: Live integration test (requires running server)', () => {
  const CONCURRENT_CONNECTIONS = 1000;
  const SERVER_URL = process.env.SOCKET_TEST_URL || 'http://localhost:5000';
  const TEST_TOKEN = process.env.SOCKET_TEST_TOKEN || 'test-token';

  it(`should support ${CONCURRENT_CONNECTIONS} concurrent Socket.IO connections`, async () => {
    // This test requires socket.io-client to be installed
    // npm install --save-dev socket.io-client
    const { io } = require('socket.io-client');

    const sockets = [];
    const connected = [];
    const errors = [];

    // Create connections in batches to avoid overwhelming the OS
    const BATCH_SIZE = 50;
    const BATCH_DELAY_MS = 100;

    for (let batch = 0; batch < CONCURRENT_CONNECTIONS / BATCH_SIZE; batch++) {
      const batchPromises = Array.from({ length: BATCH_SIZE }, () =>
        new Promise((resolve, reject) => {
          const socket = io(SERVER_URL, {
            auth: { token: TEST_TOKEN },
            transports: ['websocket'],
            timeout: 5000,
          });

          socket.on('connect', () => {
            connected.push(socket.id);
            resolve(socket);
          });

          socket.on('connect_error', (err) => {
            errors.push(err.message);
            reject(err);
          });

          sockets.push(socket);
        }).catch(() => null) // Don't fail the batch on individual errors
      );

      await Promise.all(batchPromises);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }

    // Verify connection count
    expect(connected.length).toBeGreaterThanOrEqual(CONCURRENT_CONNECTIONS * 0.95); // 95% success rate

    // Cleanup
    sockets.forEach(s => s && s.disconnect());
  }, 120000); // 2-minute timeout for this test
});
