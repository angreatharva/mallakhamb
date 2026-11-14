'use strict';

/**
 * Where the twin-run is allowed to run, and with which settings.
 *
 * `Server/.env` names the real database and a real mail provider. Nothing in
 * the twin-run may reach either, so the environment is set here, before any
 * Server module loads (dotenv never overrides a variable that is already set),
 * and every database address is checked to be on this machine.
 */

const path = require('node:path');
const { SERVER_ROOT, BACKEND_ROOT } = require('../../lib/server');

const MONGO_HOST = 'mongodb://127.0.0.1:27017';
const CORPUS_ROOT = path.join(BACKEND_ROOT, 'twinrun', 'corpus');
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The MongoDB driver the Server itself uses (no second copy, no version skew). */
const mongodb = () => require(path.join(SERVER_ROOT, 'node_modules', 'mongodb'));

const dbUri = (name) => `${MONGO_HOST}/${name}`;

/** Throw unless the address is a plain `mongodb://` URI on this machine and a `twin_test_` database. */
function assertLocal(uri) {
  const match = /^mongodb:\/\/([^/?]+)\/([^?]+)/.exec(String(uri));
  const hosts = match ? match[1].split(',').map((host) => host.replace(/:\d+$/, '')) : [];
  if (!match || match[1].includes('@') || hosts.some((host) => !LOCAL_HOSTS.has(host))) {
    throw new Error(`twinrun: refusing to use a database that is not on this machine: ${String(uri).replace(/\/\/[^@/]*@/, '//***@')}`);
  }
  if (!match[2].startsWith('twin_test_')) {
    throw new Error(`twinrun: refusing database "${match[2]}"; twin-run databases are named twin_test_* (the Server's seeder only writes to a database whose name says it is a test one)`);
  }
  return uri;
}

/**
 * Point this process at a local twin database and switch every outside service off.
 * Must run before any Server module is required.
 *
 * @param {string} database - the twin database the API serves from
 */
function applyTwinEnvironment(database) {
  const uri = assertLocal(dbUri(database));
  Object.assign(process.env, {
    // The harness seeder refuses to run when the two are equal, so the "live" one is a second local name nothing uses.
    MONGODB_URI: assertLocal(dbUri('twin_test_unused')),
    PERF_MONGODB_URI: uri,
    NODE_ENV: 'development',
    // Twin-only secrets: the same on the Node and the Java side, and nothing recorded is signed with a real key.
    JWT_SECRET: 'twinrun-only-jwt-secret-never-used-anywhere-else',
    DATA_ENCRYPTION_KEY: 'twinrun-only-data-encryption-key',
    DISCOUNT_CODE_ENABLED: 'true',
    DISCOUNT_CODE: 'TWINRUN100',
    GMAIL_CLIENT_ID: '',
    GMAIL_CLIENT_SECRET: '',
    GMAIL_REFRESH_TOKEN: '',
    RESEND_API_KEY: '',
    EMAIL_PROVIDER: 'none',
    EMAIL_CAPTURE: 'false',
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    RAZORPAY_WEBHOOK_SECRET: '',
    OCR_URL: '',
    OCR_TOKEN: '',
    RATE_LIMIT_ENABLED: 'false',
    ACCOUNT_RATE_LIMIT_ENABLED: 'false',
    ENABLE_API_DOCS: 'false',
    LOG_LEVEL: 'error',
  });
  return uri;
}

const corpusDir = (name) => path.join(CORPUS_ROOT, name);

module.exports = { MONGO_HOST, CORPUS_ROOT, mongodb, dbUri, assertLocal, applyTwinEnvironment, corpusDir };
