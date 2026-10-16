/**
 * Prometheus metrics for the API (deploy/monitoring/PLAN.md §5).
 *
 * Grafana Cloud scrapes `GET /metrics` once a minute; everything it can see is
 * defined here. Three rules hold for every instrument:
 *
 *  1. Labels are bounded and impersonal. Route patterns, methods, statuses,
 *     event names and role names only — never a user, email, IP, team,
 *     competition or athlete. Every label value from outside the process is
 *     forced through an allow-list below, and
 *     tests/unit/infrastructure/prometheus.registry.test.js fails if a label
 *     NAME outside the allow-list ever appears.
 *  2. Names follow Spring Boot's Micrometer where one exists
 *     (`http_server_requests_seconds`, `mongodb_driver_*`), so the dashboards
 *     outlive the planned port (PLAN.md §10).
 *  3. A scrape never touches the database. It must stay cheap, and it must
 *     still answer while MongoDB is down — that is when it is needed most.
 *
 * `createMetrics()` builds a FRESH Registry per call, never prom-client's
 * global one: jest builds several apps in one process, and the global registry
 * throws on a duplicate metric name.
 */

const client = require('prom-client');

const HTTP_BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const MONGO_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];
const SOCKET_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

/** Every label name any metric in the registry may carry (PLAN.md 1.16). */
const ALLOWED_LABEL_NAMES = new Set([
  'method', 'uri', 'status', 'outcome',
  'command', 'collection', 'reason',
  'event', 'role', 'provider',
  'version', 'service', 'node',
  // prom-client's own runtime metrics
  'le', 'quantile', 'kind', 'space', 'type', 'major', 'minor', 'patch',
]);

const MONGO_COMMANDS = new Set([
  'find', 'insert', 'update', 'delete', 'aggregate', 'count', 'distinct',
  'findAndModify', 'getMore', 'createIndexes',
]);
/** Handshake, auth and session housekeeping — not application work. */
const MONGO_IGNORED = new Set([
  'hello', 'ismaster', 'isMaster', 'ping', 'saslStart', 'saslContinue',
  'endSessions', 'buildInfo', 'getnonce', 'authenticate',
]);
const MAX_COLLECTIONS = 60;
const CHECKOUT_FAILURE_REASONS = new Set(['timeout', 'poolClosed', 'connectionError']);

// Superadmins sign in through the `admin` user type, so they count as admin.
const LOGIN_ROLES = new Set(['admin', 'coach', 'judge', 'player']);
const LOGIN_OUTCOMES = new Set(['success', 'failure', 'locked']);
const WEBHOOK_EVENTS = new Set(['payment.captured', 'payment.failed', 'order.paid']);
const WEBHOOK_OUTCOMES = new Set(['processed', 'ignored', 'rejected_signature', 'error']);
const EMAIL_PROVIDERS = new Set(['resend', 'nodemailer', 'none']);
const SCORE_OUTCOMES = new Set(['accepted', 'rejected']);

const pick = (allowed, value, fallback = 'other') =>
  (allowed.has(value) ? value : fallback);

/**
 * A gauge driven by +1/-1 events that never reads negative — e.g. a close
 * whose open happened before the listener was attached.
 */
function levelGauge(registry, name, help) {
  const gauge = new client.Gauge({ name, help, registers: [registry] });
  let level = 0;
  return {
    inc() { level += 1; gauge.set(level); },
    dec() { if (level > 0) { level -= 1; gauge.set(level); } },
  };
}

/** Micrometer's `outcome` for a status code. */
function outcomeFor(status) {
  if (status >= 100 && status < 200) return 'INFORMATIONAL';
  if (status >= 200 && status < 300) return 'SUCCESS';
  if (status >= 300 && status < 400) return 'REDIRECTION';
  if (status >= 400 && status < 500) return 'CLIENT_ERROR';
  if (status >= 500 && status < 600) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

/**
 * The collection a command addressed, from its `commandStarted` payload.
 * `getMore` names it in `collection`; the rest under their own command name.
 */
function collectionOf(commandName, command) {
  const value = commandName === 'getMore' ? command?.collection : command?.[commandName];
  return typeof value === 'string' && value.length > 0 ? value : 'none';
}

/**
 * @param {Object} [options]
 * @param {Object} [options.logger]
 * @param {Object} [options.env] - defaults to process.env
 * @param {boolean} [options.collectDefaults] - runtime metrics; on by default
 */
function createMetrics({ logger, env = process.env, collectDefaults = true } = {}) {
  const registry = new client.Registry();

  if (collectDefaults) {
    client.collectDefaultMetrics({ register: registry });
  }

  // ---------------------------------------------------------------- app_info
  const appInfo = new client.Gauge({
    name: 'app_info',
    help: 'Build and runtime identity; value is always 1',
    labelNames: ['version', 'service', 'node'],
    registers: [registry],
  });
  appInfo.set({
    // GIT_COMMIT is written by mallakhamb-deploy on the VMs; Render sets its own.
    version: (env.GIT_COMMIT || env.RENDER_GIT_COMMIT || 'dev').slice(0, 7),
    service: env.RENDER_SERVICE_NAME || 'mallakhamb-api',
    node: process.version,
  }, 1);

  // -------------------------------------------------------------------- HTTP
  const httpRequests = new client.Histogram({
    name: 'http_server_requests_seconds',
    help: 'HTTP server request duration by route pattern',
    labelNames: ['method', 'uri', 'status', 'outcome'],
    buckets: HTTP_BUCKETS,
    registers: [registry],
  });

  const http = {
    /**
     * @param {string} method
     * @param {string} uri - already a pattern (see route-label.js)
     * @param {number|string} status - a number, or '499' for an aborted request
     * @param {number} seconds
     */
    observe(method, uri, status, seconds) {
      const code = Number(status);
      httpRequests.observe({
        method: String(method || 'UNKNOWN').toUpperCase(),
        uri,
        status: String(status),
        outcome: status === '499' ? 'UNKNOWN' : outcomeFor(code),
      }, seconds);
    },
  };

  // ----------------------------------------------------------------- MongoDB
  const poolSize = levelGauge(registry,
    'mongodb_driver_pool_size', 'Open connections in the MongoDB pool');
  const poolCheckedOut = levelGauge(registry,
    'mongodb_driver_pool_checkedout', 'MongoDB connections currently checked out');
  const poolWaitQueue = levelGauge(registry,
    'mongodb_driver_pool_waitqueuesize', 'Operations waiting for a MongoDB connection');
  const poolCheckoutFailed = new client.Counter({
    name: 'mongodb_driver_pool_checkout_failed_total',
    help: 'MongoDB connection check-outs that failed',
    labelNames: ['reason'],
    registers: [registry],
  });
  const mongoCommands = new client.Histogram({
    name: 'mongodb_driver_commands_seconds',
    help: 'MongoDB command duration',
    labelNames: ['command', 'collection', 'status'],
    buckets: MONGO_BUCKETS,
    registers: [registry],
  });

  const attachedClients = new WeakSet();
  const knownCollections = new Set();
  const collectionLabel = (name) => {
    if (knownCollections.has(name)) return name;
    if (knownCollections.size >= MAX_COLLECTIONS) return 'other';
    knownCollections.add(name);
    return name;
  };

  const mongo = {
    /**
     * Listen to the driver's pool (CMAP) and command events. These are emitted
     * on the MongoClient — `mongoose.connection.getClient()` — not on the Db,
     * which is why the old `connection.db.on(...)` listener never fired.
     *
     * Attach BEFORE `client.connect()` does any I/O, or the gauges miss the
     * `minPoolSize` connections opened at start-up. Idempotent per client.
     *
     * Command events only arrive when the client was built with
     * `monitorCommands: true` (DB_MONITOR_COMMANDS), which is off by default
     * for its cost — see connection.js. Pool events always arrive.
     *
     * @param {import('events').EventEmitter} mongoClient
     */
    attach(mongoClient) {
      if (!mongoClient || typeof mongoClient.on !== 'function') return false;
      if (attachedClients.has(mongoClient)) return false;
      attachedClients.add(mongoClient);

      mongoClient.on('connectionCreated', () => poolSize.inc());
      mongoClient.on('connectionClosed', () => poolSize.dec());
      mongoClient.on('connectionCheckOutStarted', () => poolWaitQueue.inc());
      mongoClient.on('connectionCheckedOut', () => {
        poolWaitQueue.dec();
        poolCheckedOut.inc();
      });
      mongoClient.on('connectionCheckOutFailed', (event) => {
        poolWaitQueue.dec();
        poolCheckoutFailed.inc({ reason: pick(CHECKOUT_FAILURE_REASONS, event?.reason) });
      });
      mongoClient.on('connectionCheckedIn', () => poolCheckedOut.dec());

      // requestId → collection; the finish events do not repeat the command.
      const inFlight = new Map();
      mongoClient.on('commandStarted', (event) => {
        if (MONGO_IGNORED.has(event.commandName)) return;
        inFlight.set(event.requestId, collectionOf(event.commandName, event.command));
      });
      const finish = (status) => (event) => {
        if (MONGO_IGNORED.has(event.commandName)) return;
        const collection = inFlight.get(event.requestId) || 'none';
        inFlight.delete(event.requestId);
        mongoCommands.observe({
          command: pick(MONGO_COMMANDS, event.commandName),
          collection: collectionLabel(collection),
          status,
        }, (Number(event.duration) || 0) / 1000);
      };
      mongoClient.on('commandSucceeded', finish('SUCCESS'));
      mongoClient.on('commandFailed', finish('FAILED'));
      return true;
    },
  };

  // --------------------------------------------------------------- Socket.IO
  const socketClients = levelGauge(registry,
    'socketio_connected_clients', 'Socket.IO clients currently connected');
  const socketEvents = new client.Counter({
    name: 'socketio_events_received_total',
    help: 'Socket.IO events received, by registered event name',
    labelNames: ['event'],
    registers: [registry],
  });
  const socketErrors = new client.Counter({
    name: 'socketio_event_errors_total',
    help: 'Socket.IO event handlers that threw',
    labelNames: ['event'],
    registers: [registry],
  });
  const socketHandler = new client.Histogram({
    name: 'socketio_event_handler_seconds',
    help: 'Socket.IO event handler duration',
    labelNames: ['event'],
    buckets: SOCKET_BUCKETS,
    registers: [registry],
  });
  let roomsSource = () => 0;
  // eslint-disable-next-line no-new
  new client.Gauge({
    name: 'socketio_rooms',
    help: 'Socket.IO rooms in use, excluding each socket\'s own room',
    registers: [registry],
    collect() {
      try {
        this.set(roomsSource());
      } catch {
        this.set(0);
      }
    },
  });

  const socket = {
    connected() { socketClients.inc(); },
    disconnected() { socketClients.dec(); },
    /**
     * Count an event and time its handler. `event` must be a key of the
     * socket manager's `eventHandlers` — a fixed, server-defined set.
     * @returns {(failed: boolean) => void} call once when the handler settles
     */
    startEvent(event) {
      socketEvents.inc({ event });
      const end = socketHandler.startTimer({ event });
      return (failed) => {
        end();
        if (failed) socketErrors.inc({ event });
      };
    },
    /** @param {() => number} fn - read at scrape time; must be O(rooms), no I/O */
    setRoomsSource(fn) { roomsSource = fn; },
  };

  // ---------------------------------------------------------------- Business
  const scoresSubmitted = new client.Counter({
    name: 'mallakhamb_scores_submitted_total',
    help: 'Score sheet writes, by outcome',
    labelNames: ['outcome'],
    registers: [registry],
  });
  const logins = new client.Counter({
    name: 'mallakhamb_auth_logins_total',
    help: 'Login attempts, by role and outcome',
    labelNames: ['role', 'outcome'],
    registers: [registry],
  });
  const paymentWebhooks = new client.Counter({
    name: 'mallakhamb_payment_webhooks_total',
    help: 'Razorpay webhooks received, by event and outcome',
    labelNames: ['event', 'outcome'],
    registers: [registry],
  });
  const emails = new client.Counter({
    name: 'mallakhamb_emails_sent_total',
    help: 'Emails sent, by provider and outcome',
    labelNames: ['provider', 'outcome'],
    registers: [registry],
  });

  const business = {
    scoreSubmitted(outcome) {
      scoresSubmitted.inc({ outcome: pick(SCORE_OUTCOMES, outcome) });
    },
    login(role, outcome) {
      logins.inc({ role: pick(LOGIN_ROLES, role), outcome: pick(LOGIN_OUTCOMES, outcome) });
    },
    // `event` comes from the request body — an attacker picks it, so it is
    // never a label until it has matched the allow-list.
    paymentWebhook(event, outcome) {
      paymentWebhooks.inc({
        event: pick(WEBHOOK_EVENTS, event),
        outcome: pick(WEBHOOK_OUTCOMES, outcome),
      });
    },
    emailSent(provider, outcome) {
      emails.inc({
        provider: pick(EMAIL_PROVIDERS, provider),
        outcome: outcome === 'sent' ? 'sent' : 'failed',
      });
    },
  };

  logger?.debug?.('Prometheus registry created', { defaults: collectDefaults });

  return {
    registry,
    contentType: registry.contentType,
    metrics: () => registry.metrics(),
    http,
    mongo,
    socket,
    business,
  };
}

/**
 * The do-nothing stand-in every instrumented class defaults to, so code and
 * tests that build a service without metrics keep working unchanged.
 */
const noopMetrics = Object.freeze({
  http: { observe() {} },
  mongo: { attach() { return false; } },
  socket: {
    connected() {},
    disconnected() {},
    startEvent() { return () => {}; },
    setRoomsSource() {},
  },
  business: {
    scoreSubmitted() {},
    login() {},
    paymentWebhook() {},
    emailSent() {},
  },
});

module.exports = {
  createMetrics,
  noopMetrics,
  outcomeFor,
  ALLOWED_LABEL_NAMES,
};
