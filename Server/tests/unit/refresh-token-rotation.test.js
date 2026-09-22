/**
 * Refresh-token rotation, against a real store.
 *
 * This path had NO test of any kind before 2026-09-22, which is why it is
 * pinned here rather than left to the refactor that moved it behind
 * `RefreshTokenRepository`: rotation decides whether a presented token is a
 * stranger, a live session or a stolen one, and the three answers differ.
 *
 * Deliberately exercises the real repository and the real model rather than a
 * stub — the interesting behaviour (a spent token still being FOUND so that
 * reuse can be told apart from a token that never existed) lives exactly at
 * that boundary, and a stub would assert only that I stubbed it correctly.
 */

const crypto = require('crypto');
const RefreshToken = require('../../src/models/RefreshToken');
const RefreshTokenRepository = require('../../src/repositories/refresh-token.repository');
const TokenService = require('../../src/services/auth/token.service');
const { AuthenticationError } = require('../../src/errors');

const noopLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const config = {
  get: (key) => ({
    'jwt.secret': 'test-secret-that-is-at-least-32-characters-long',
    'jwt.expiresIn': '24h',
  })[key],
};

const USER_ID = '507f1f77bcf86cd799439011';

function buildService() {
  return new TokenService(config, noopLogger, new RefreshTokenRepository(noopLogger));
}

const hashOf = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

describe('refresh token rotation', () => {
  it('issues a token that is stored hashed, never in the clear', async () => {
    const service = buildService();

    const { token, family } = await service.generateRefreshToken(USER_ID, 'coach');

    const stored = await RefreshToken.findOne({ family }).lean();
    expect(stored).not.toBeNull();
    expect(stored.tokenHash).toBe(hashOf(token));
    // The raw token must not be recoverable from the store.
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.isUsed).toBe(false);
    expect(stored.isRevoked).toBe(false);
  });

  it('rotates within the same family and spends the old token', async () => {
    const service = buildService();
    const { token: first, family } = await service.generateRefreshToken(USER_ID, 'coach');

    const result = await service.rotateRefreshToken(first);

    expect(result.family).toBe(family);
    expect(result.refreshToken).not.toBe(first);
    expect(typeof result.accessToken).toBe('string');

    const old = await RefreshToken.findOne({ tokenHash: hashOf(first) }).lean();
    expect(old.isUsed).toBe(true);

    const fresh = await RefreshToken.findOne({ tokenHash: hashOf(result.refreshToken) }).lean();
    expect(fresh.isUsed).toBe(false);
    expect(fresh.family).toBe(family);
  });

  it('carries the competition claim across a rotation', async () => {
    const service = buildService();
    const competitionId = '507f1f77bcf86cd799439022';
    const { token } = await service.generateRefreshToken(USER_ID, 'judge', null, competitionId);

    const { accessToken, refreshToken } = await service.rotateRefreshToken(token);

    // Without this, a silent refresh hands a judge a token with no competition
    // context and their next request is refused for a scope they never lost.
    expect(service.verifyToken(accessToken).competitionId).toBe(competitionId);
    const stored = await RefreshToken.findOne({ tokenHash: hashOf(refreshToken) }).lean();
    expect(String(stored.competitionId)).toBe(competitionId);
  });

  it('treats a second use as theft and revokes the whole family', async () => {
    const service = buildService();
    const { token: first, family } = await service.generateRefreshToken(USER_ID, 'coach');
    const { refreshToken: second } = await service.rotateRefreshToken(first);

    await expect(service.rotateRefreshToken(first)).rejects.toThrow(AuthenticationError);

    // Not just the replayed token — everything descended from it, including the
    // token the legitimate holder is currently carrying.
    const all = await RefreshToken.find({ family }).lean();
    expect(all).toHaveLength(2);
    expect(all.every((t) => t.isRevoked)).toBe(true);

    await expect(service.rotateRefreshToken(second)).rejects.toThrow(AuthenticationError);
  });

  it('rejects an unknown token without touching anything', async () => {
    const service = buildService();
    await service.generateRefreshToken(USER_ID, 'coach');

    await expect(service.rotateRefreshToken('not-a-real-token')).rejects.toThrow(
      AuthenticationError
    );

    const untouched = await RefreshToken.find({ isRevoked: true }).lean();
    expect(untouched).toHaveLength(0);
  });

  it('rejects an expired token', async () => {
    const service = buildService();
    const raw = 'expired-token-raw-value';
    await RefreshToken.create({
      tokenHash: hashOf(raw),
      userId: USER_ID,
      userType: 'coach',
      family: crypto.randomUUID(),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.rotateRefreshToken(raw)).rejects.toThrow(AuthenticationError);
  });

  it('revokes every live token for a user on logout', async () => {
    const service = buildService();
    await service.generateRefreshToken(USER_ID, 'coach');
    await service.generateRefreshToken(USER_ID, 'coach');
    const other = '507f1f77bcf86cd799439033';
    await service.generateRefreshToken(other, 'coach');

    await service.revokeAllRefreshTokens(USER_ID);

    const mine = await RefreshToken.find({ userId: USER_ID }).lean();
    expect(mine.every((t) => t.isRevoked)).toBe(true);

    const theirs = await RefreshToken.find({ userId: other }).lean();
    expect(theirs.every((t) => t.isRevoked)).toBe(false);
  });
});
