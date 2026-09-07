/**
 * The two things every login path needs, and both of which were written out
 * twice — once in `services/auth/authentication.service.js` for players,
 * coaches and admins, and again in `services/user/judge.service.js` for judges,
 * which authenticates against a different collection and so could not reuse the
 * first.
 *
 * Neither is complicated. Both are security controls, and a security control
 * that exists in two copies is one that will eventually only be fixed in one.
 *
 * @module utils/security/login-security.util
 */

const bcrypt = require('bcryptjs');

/**
 * LOW-4: a hash to compare against when the account does not exist.
 *
 * Without it, login returns immediately on user-not-found while a real account
 * pays for a bcrypt comparison — so response time tells an attacker which
 * e-mail addresses are registered.
 *
 * The plaintext is irrelevant and this is not a secret; only the COST of
 * comparing against it matters. It is a literal rather than a `hashSync` call
 * so that importing this module does no bcrypt work at startup, and so unit
 * tests that mock bcrypt do not have to stub `hashSync` to load the file.
 * Generated at cost 12, matching BCRYPT_ROUNDS.
 */
const DUMMY_PASSWORD_HASH = '$2a$12$xkzf6jGVSx6.qXQ/GXY93OiYAmFAjB7Q9ph2ciDNL8cuW.PNc94Mi';

/**
 * Burn a comparable amount of time before reporting that an account does not
 * exist, so an unregistered address is not distinguishable by latency.
 *
 * @param {string} password - whatever the caller submitted
 * @returns {Promise<void>}
 */
async function equalizeFailedLoginTiming(password) {
  await bcrypt.compare(password || '', DUMMY_PASSWORD_HASH);
}

/**
 * Read a numeric security setting from the config singleton.
 *
 * The services that need this are constructed POSITIONALLY by the DI container
 * and have no `config` dependency; adding one would change a constructor
 * signature that bootstrap wires by position. The singleton is read directly
 * instead, and defensively: unit tests build those services without ever
 * calling `config.load()`, and a lockout policy is not worth throwing over.
 *
 * @param {string} key - Dot path under the config root, e.g. 'security.bcryptRounds'
 * @param {number} fallback
 * @returns {number}
 */
function securitySetting(key, fallback) {
  try {
    const value = require('../../config/config-manager').get(key);
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  } catch {
    return fallback;
  }
}

/** Defaults shared by every login path. */
const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;
/** Matches the model pre-save hooks and the documented BCRYPT_ROUNDS default. */
const DEFAULT_BCRYPT_ROUNDS = 12;

/**
 * The configured lockout policy, as `account-lockout.util` expects it.
 * @returns {{maxAttempts: number, lockoutMinutes: number}}
 */
function lockoutPolicy() {
  return {
    maxAttempts: securitySetting('security.maxLoginAttempts', DEFAULT_MAX_LOGIN_ATTEMPTS),
    lockoutMinutes: securitySetting('security.lockoutDuration', DEFAULT_LOCKOUT_MINUTES),
  };
}

module.exports = {
  DUMMY_PASSWORD_HASH,
  DEFAULT_MAX_LOGIN_ATTEMPTS,
  DEFAULT_LOCKOUT_MINUTES,
  DEFAULT_BCRYPT_ROUNDS,
  equalizeFailedLoginTiming,
  securitySetting,
  lockoutPolicy,
};
