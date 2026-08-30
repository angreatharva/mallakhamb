/**
 * Start the real API, in-process, against the throwaway benchmark database.
 *
 * Deliberately NOT "point the harness at whatever is running on :5000". That
 * server is connected to MONGODB_URI — the database the app actually uses — and
 * a benchmark is a few thousand writes. Starting our own listener means the
 * connection string is chosen here rather than inherited, and the seeding,
 * measuring and tearing down all provably happen in the same throwaway place.
 *
 * It is the same `createApp` the production entry point uses, with the same
 * middleware chain: CORS, CSRF, sanitisation, metrics, coalescing, audit. A
 * harness that skipped those would be measuring a server nobody runs.
 *
 * @module scripts/perf/lib/harness-server
 */

const http = require('node:http');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

/**
 * @param {Object} [options]
 * @param {string} [options.uri] - the database to run against
 * @param {number} [options.port] - 0 picks a free one
 * @param {boolean} [options.quiet=true] - silence the app logger
 * @param {boolean} [options.sockets=false] - attach Socket.IO
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>, container: Object, socketManager: Object|null}>}
 */
async function startHarnessServer({
  uri = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf',
  port = 0,
  quiet = true,
  sockets = false,
} = {}) {
  // Both must be set BEFORE config-manager loads, because it snapshots the
  // environment once and every downstream service reads that snapshot.
  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV = 'development';
  if (quiet) process.env.LOG_LEVEL = 'error';

  const config = require('../../../src/config/config-manager');
  config.load();

  const { bootstrap } = require('../../../src/infrastructure/bootstrap');
  const { createApp } = require('../../../src/infrastructure/createApp');

  const { container } = bootstrap();

  // The logger hard-codes `debug` in development (infrastructure/logger.js), and
  // one line per request per middleware buries the harness's own output and
  // measurably slows the benchmark. Turned down on the winston instance after
  // the fact, because there is no level env var to set beforehand.
  if (quiet) {
    const logger = container.resolve('logger');
    const winstonInstance = logger.logger || logger;
    if (winstonInstance?.transports) {
      winstonInstance.level = 'error';
      winstonInstance.transports.forEach((transport) => { transport.level = 'error'; });
    }
  }

  const databaseConnection = container.resolve('databaseConnection');
  await databaseConnection.connect();

  const app = createApp(container);
  const server = http.createServer(app);
  // Same keep-alive settings as server.js — an idle socket closing under a
  // sequential client is exactly the failure this harness would otherwise
  // rediscover and misreport as a slow endpoint.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  /*
   * Socket.IO is opt-in.
   *
   * server.js always attaches it, but most of this harness drives HTTP, and an
   * idle Socket.IO server holds handles that make `close()` slower and noisier.
   * The socket load test asks for it; nothing else pays for it.
   */
  let socketManager = null;
  if (sockets) {
    const { initializeSocketIO } = require('../../../src/infrastructure/bootstrap');
    socketManager = initializeSocketIO(server);
    app.set('io', socketManager.getIO());
  }

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const actualPort = server.address().port;

  return {
    baseUrl: `http://127.0.0.1:${actualPort}`,
    container,
    socketManager,
    close: async () => {
      if (socketManager?.getIO) {
        await new Promise((resolve) => socketManager.getIO().close(resolve));
      }
      await new Promise((resolve) => server.close(resolve));
      await databaseConnection.disconnect?.().catch(() => {});
      const mongoose = require('mongoose');
      await mongoose.disconnect().catch(() => {});
    },
  };
}

module.exports = { startHarnessServer };
