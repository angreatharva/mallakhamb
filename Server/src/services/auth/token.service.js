/**
 * Token Service
 *
 * Handles JWT token generation, verification, refresh, and rotation.
 * Uses ConfigManager for JWT configuration.
 * Implements:
 *  - Short-lived access tokens (24h)
 *  - Long-lived refresh tokens (7 days) with rotation & reuse detection
 *  - Token rotation for long-lived sessions (Requirement 17.7)
 *
 * Requirements: 1.5, 1.8, 17.7, HIGH-5 (Phase 2A, Item 2.2)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { AuthenticationError } = require('../../errors');

/**
 * Token rotation threshold in milliseconds.
 * Tokens older than this will be rotated on use.
 * Default: 12 hours (roughly half of the 24-hour token expiry).
 */
const TOKEN_ROTATION_THRESHOLD_MS = 12 * 60 * 60 * 1000;

/** Refresh token lifetime in days */
const REFRESH_TOKEN_DAYS = 7;

/**
 * The longest a sign-in lasts, however often its tokens are rotated or
 * refreshed (security audit 2026-10-31, M4). Before this, a token used at
 * least once every 24 hours rotated forever, so a stolen one never died.
 * Thirty days is far longer than any competition, so no one is signed out
 * mid-meet; after it, the person simply signs in again.
 */
const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

class TokenService {
  /**
   * Create a token service
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance
   * @param {RefreshTokenRepository} refreshTokenRepository - Rotation store
   */
  constructor(configManager, logger, refreshTokenRepository) {
    this.config = configManager;
    this.logger = logger;
    this.refreshTokenRepository = refreshTokenRepository;
  }

  /**
   * Generate JWT access token for user.
   * Includes `iat` (issued-at) claim for rotation tracking.
   * @param {string} userId - User ID
   * @param {string} userType - User type (player, coach, admin, judge)
   * @param {string} competitionId - Optional competition context
   * @param {Object} [options]
   * @param {number} [options.issuedAt] - `iat` in seconds, instead of now. Used
   *   right after recordLogout(): `iat` is whole seconds and the logout time is
   *   milliseconds, so a token signed in the same second would read as issued
   *   before the logout and be refused. Pass the next whole second.
   * @returns {string} JWT token
   */
  generateToken(userId, userType, competitionId = null, { issuedAt, authTime } = {}) {
    try {
      const payload = {
        userId,
        userType,
        ...(competitionId && { competitionId }),
        // jwt.sign adds `iat` (issued-at) itself unless one is given
        ...(issuedAt && { iat: issuedAt }),
        // When the person signed in (seconds). Carried through rotation so the
        // session has an absolute end — see MAX_SESSION_MS.
        auth_time: authTime || Math.floor(Date.now() / 1000),
      };

      const secret = this.config.get('jwt.secret');
      const expiresIn = this.config.get('jwt.expiresIn');

      const token = jwt.sign(payload, secret, { expiresIn });

      this.logger.debug('Token generated', { userId, userType, competitionId });

      return token;
    } catch (error) {
      this.logger.error('Token generation failed', { 
        userId, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   * @throws {AuthenticationError} If token is invalid or expired
   */
  verifyToken(token) {
    try {
      const secret = this.config.get('jwt.secret');
      // Pinned to the one algorithm this service signs with (security audit
      // 2026-10-31, L2), so no token can choose how it is checked.
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });

      this.logger.debug('Token verified', { userId: decoded.userId });

      return decoded;
    } catch (error) {
      this.logger.warn('Token verification failed', { error: error.message });

      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token has expired');
      }

      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid token');
      }

      throw new AuthenticationError('Token verification failed');
    }
  }

  /**
   * Refresh JWT token
   * Generates a new token with the same payload but extended expiration.
   * @param {string} token - Current JWT token
   * @returns {string} New JWT token
   * @throws {AuthenticationError} If token is invalid
   */
  refreshToken(token) {
    try {
      // Verify the current token (will throw if invalid)
      const decoded = this.verifyToken(token);

      // Generate new token with same payload
      const newToken = this.generateToken(
        decoded.userId,
        decoded.userType,
        decoded.competitionId
      );

      this.logger.info('Token refreshed', { userId: decoded.userId });

      return newToken;
    } catch (error) {
      this.logger.error('Token refresh failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check whether a token should be rotated.
   * A token should be rotated when it is older than TOKEN_ROTATION_THRESHOLD_MS.
   * @param {Object} decoded - Decoded JWT payload (must contain `iat`)
   * @returns {boolean} True if the token should be rotated
   */
  shouldRotateToken(decoded) {
    if (!decoded || !decoded.iat) {
      return false;
    }
    const issuedAtMs = decoded.iat * 1000; // `iat` is in seconds
    const ageMs = Date.now() - issuedAtMs;
    return ageMs >= TOKEN_ROTATION_THRESHOLD_MS;
  }

  /**
   * Rotate a token if it is old enough.
   * Returns the new token if rotation occurred, or null if not needed.
   * @param {Object} decoded - Already-verified decoded JWT payload
   * @returns {string|null} New token string, or null if rotation not needed
   */
  rotateTokenIfNeeded(decoded) {
    if (!this.shouldRotateToken(decoded)) {
      return null;
    }

    // Past the absolute session limit, stop extending: the token runs out on
    // its own `exp` and the person signs in again.
    const authTime = decoded.auth_time || decoded.iat;
    if (Date.now() - authTime * 1000 >= MAX_SESSION_MS) {
      return null;
    }

    const newToken = this.generateToken(
      decoded.userId,
      decoded.userType,
      decoded.competitionId || null,
      { authTime }
    );

    this.logger.info('Token rotated (age threshold reached)', {
      userId: decoded.userId,
      userType: decoded.userType
    });

    return newToken;
  }

  /**
   * Decode token without verification (for debugging/logging)
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded payload or null if invalid
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      this.logger.warn('Token decode failed', { error: error.message });
      return null;
    }
  }

  // ------------------------------------------------------------------
  //  Refresh Token Methods (Phase 2A, Item 2.2)
  // ------------------------------------------------------------------

  /**
   * Generate a cryptographically random refresh token and persist it.
   *
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @param {string|null} [family] - Token family UUID (null = new family)
   * @returns {Promise<{ token: string, family: string }>}
   */
  async generateRefreshToken(userId, userType, family = null, competitionId = null, authTime = null) {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this._hashToken(rawToken);
    const tokenFamily = family || crypto.randomUUID();

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepository.create({
      tokenHash,
      userId,
      userType,
      family: tokenFamily,
      expiresAt,
      // Carried so rotation can re-issue an access token with the SAME
      // competition claim. Without it a silent refresh handed a judge a token
      // with no competition context, and the next request they made was
      // refused for a context they had never lost.
      competitionId: competitionId || null,
      // A new family is a new sign-in; a rotation keeps the family's.
      authTime: authTime || new Date(),
    });

    this.logger.debug('Refresh token generated', { userId, userType, family: tokenFamily });

    return { token: rawToken, family: tokenFamily };
  }

  /**
   * Validate a refresh token and rotate it (issue a new one, mark old as used).
   *
   * If the presented token has already been used, this indicates token theft.
   * The entire family is revoked to force re-authentication.
   *
   * @param {string} rawToken - Raw refresh token string
   * @returns {Promise<{ accessToken: string, refreshToken: string, family: string }>}
   * @throws {AuthenticationError} If the token is invalid, used, revoked, or expired
   */
  async rotateRefreshToken(rawToken) {
    const tokenHash = this._hashToken(rawToken);

    // Look up the token record in WHATEVER state it is in — a spent token has
    // to come back, because "absent" and "already used" mean different things
    // three lines down.
    const tokenRecord = await this.refreshTokenRepository.findByHash(tokenHash);

    if (!tokenRecord) {
      this.logger.warn('Refresh token not found — possible theft or expired');
      throw new AuthenticationError('Invalid refresh token');
    }

    // Reuse detection: if the token was already consumed, the family is compromised
    if (tokenRecord.isUsed || tokenRecord.isRevoked) {
      this.logger.warn('Refresh token reuse detected — revoking family', {
        userId: tokenRecord.userId,
        family: tokenRecord.family,
      });
      await this.refreshTokenRepository.revokeFamily(tokenRecord.family);
      throw new AuthenticationError('Refresh token reuse detected. Please log in again.');
    }

    // Check expiry (belt-and-suspenders; TTL index should clean up, but be safe)
    if (tokenRecord.expiresAt < new Date()) {
      throw new AuthenticationError('Refresh token expired');
    }

    // The absolute session limit: a family refreshed every week would
    // otherwise never end (MAX_SESSION_MS).
    const authTime = new Date(tokenRecord.authTime || tokenRecord.createdAt || Date.now());
    if (Date.now() - authTime.getTime() >= MAX_SESSION_MS) {
      await this.refreshTokenRepository.revokeFamily(tokenRecord.family);
      throw new AuthenticationError('Session expired. Please log in again.');
    }

    // Mark old token as used
    await this.refreshTokenRepository.markUsed(tokenHash);

    // Issue new access + refresh tokens in the same family
    const accessToken = this.generateToken(
      tokenRecord.userId.toString(),
      tokenRecord.userType,
      tokenRecord.competitionId ? tokenRecord.competitionId.toString() : null,
      { authTime: Math.floor(authTime.getTime() / 1000) },
    );

    const { token: newRefreshToken, family } = await this.generateRefreshToken(
      tokenRecord.userId,
      tokenRecord.userType,
      tokenRecord.family, // same family
      tokenRecord.competitionId,
      authTime,
    );

    this.logger.info('Refresh token rotated', {
      userId: tokenRecord.userId,
      userType: tokenRecord.userType,
      family,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      family,
      userId: tokenRecord.userId,
      userType: tokenRecord.userType,
    };
  }

  /**
   * Revoke all refresh tokens for a user (used on logout).
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async revokeAllRefreshTokens(userId) {
    await this.refreshTokenRepository.revokeAllForUser(userId);
    this.logger.info('All refresh tokens revoked', { userId });
  }

  /**
   * Hash a raw token using SHA-256.
   * @param {string} raw - Raw token string
   * @returns {string} Hex-encoded hash
   * @private
   */
  _hashToken(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}

module.exports = TokenService;
