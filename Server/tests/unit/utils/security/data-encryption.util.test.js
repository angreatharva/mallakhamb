/**
 * Reversible encryption for values the app must read back (a coach's default
 * player password). Round trip, a fresh IV each time, and every way a stored
 * value can fail to decrypt answering null rather than throwing.
 */

const { encrypt, decrypt } = require('../../../../src/utils/security/data-encryption.util');

const config = (values) => ({ get: (key) => values[key] });
const JWT_ONLY = config({ 'jwt.secret': 'a'.repeat(40) });

describe('data encryption', () => {
  test('round-trips a value', () => {
    expect(decrypt(encrypt('Club@2026', JWT_ONLY), JWT_ONLY)).toBe('Club@2026');
  });

  test('never stores the value in the clear, and never the same way twice', () => {
    const one = encrypt('Club@2026', JWT_ONLY);
    const two = encrypt('Club@2026', JWT_ONLY);
    expect(one).not.toContain('Club@2026');
    expect(one).not.toBe(two);
  });

  test('DATA_ENCRYPTION_KEY wins over JWT_SECRET', () => {
    const both = config({ 'jwt.secret': 'a'.repeat(40), 'security.dataEncryptionKey': 'own-key' });
    const stored = encrypt('x', both);
    expect(decrypt(stored, both)).toBe('x');
    expect(decrypt(stored, JWT_ONLY)).toBeNull();
  });

  test('a rotated key, a tampered value or junk reads as null', () => {
    const stored = encrypt('Club@2026', JWT_ONLY);
    expect(decrypt(stored, config({ 'jwt.secret': 'b'.repeat(40) }))).toBeNull();

    const parts = stored.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(decrypt(parts.join(':'), JWT_ONLY)).toBeNull();

    expect(decrypt('not-a-value', JWT_ONLY)).toBeNull();
    expect(decrypt(null, JWT_ONLY)).toBeNull();
  });
});
