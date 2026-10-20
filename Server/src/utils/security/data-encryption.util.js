/**
 * Reversible encryption for the few stored values the app has to read back.
 *
 * Passwords are hashed, never this. The one user today is a coach's default
 * password for the players they register: the coach asked to be able to SEE it
 * so they can hand it out, so a hash will not do — but it must not sit in the
 * database as plain text either. AES-256-GCM, a fresh IV per value, and the
 * auth tag checked on the way out, so a tampered value fails rather than
 * decrypting to garbage.
 *
 * The key is `DATA_ENCRYPTION_KEY` when set (any string; it is stretched to 32
 * bytes), else derived from `JWT_SECRET` with HKDF under a label of its own, so
 * the two secrets are never the same bytes. Rotating whichever one is in use
 * makes old values unreadable: `decrypt` returns null and the caller treats
 * the value as unset.
 *
 * @module utils/security/data-encryption.util
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const HKDF_INFO = 'mallakhamb:data-encryption:v1';

/**
 * @param {{ get: Function }} config
 * @returns {Buffer} 32-byte key
 */
function keyFrom(config) {
  const explicit = config?.get?.('security.dataEncryptionKey');
  const base = explicit || config?.get?.('jwt.secret');
  if (!base) throw new Error('No key material for data encryption (set DATA_ENCRYPTION_KEY or JWT_SECRET)');
  return Buffer.from(crypto.hkdfSync('sha256', String(base), Buffer.alloc(0), HKDF_INFO, 32));
}

/**
 * @param {string} plaintext
 * @param {{ get: Function }} config
 * @returns {string} `v1:<iv>:<tag>:<ciphertext>`, base64 parts
 */
function encrypt(plaintext, config) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyFrom(config), iv);
  const body = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

/**
 * @param {string|null|undefined} stored - a value `encrypt` produced
 * @param {{ get: Function }} config
 * @returns {string|null} the plaintext, or null when absent, malformed, or
 *   written under a different key
 */
function decrypt(stored, config) {
  if (!stored || typeof stored !== 'string') return null;
  const [version, iv, tag, body] = stored.split(':');
  if (version !== VERSION || !iv || !tag || body === undefined) return null;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyFrom(config), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
