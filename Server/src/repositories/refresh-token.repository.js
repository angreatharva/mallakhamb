/**
 * Refresh Token Repository
 *
 * Data access for the refresh-token rotation store.
 *
 * `TokenService` used to reach straight past this layer and hold the Mongoose
 * model itself — the last service in `src/services/` to do so. That is worth a
 * repository rather than an exception, because rotation is the one place the
 * distinction between "no such token" and "a token that was already spent"
 * decides whether a whole family is revoked, and that decision should be made
 * against a plain object the service can reason about rather than a live
 * document it might accidentally `.save()`.
 *
 * Note `findByHash` deliberately does NOT filter on `isUsed`/`isRevoked`/
 * expiry, unlike the model's `findValidToken` static. Rotation must be able to
 * SEE a spent token: a presented token that is absent is a stranger, while one
 * that is present and already used is theft, and the two get different answers.
 */

const BaseRepository = require('./base.repository');
const RefreshToken = require('../models/RefreshToken');

class RefreshTokenRepository extends BaseRepository {
  /**
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(RefreshToken, logger);
  }

  /**
   * Find a token record by its SHA-256 hash, in whatever state it is in.
   *
   * @param {string} tokenHash - Hex-encoded SHA-256 of the raw token
   * @returns {Promise<Object|null>} Plain object, or null when no such token
   */
  async findByHash(tokenHash) {
    try {
      return await this.model.findOne({ tokenHash }).lean();
    } catch (error) {
      this.logger.error('RefreshTokenRepository.findByHash error', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark a token as consumed by rotation.
   *
   * @param {string} tokenHash
   * @returns {Promise<boolean>} True when a record was updated
   */
  async markUsed(tokenHash) {
    try {
      const result = await this.model.updateOne(
        { tokenHash },
        { $set: { isUsed: true } },
      );
      return result.matchedCount > 0;
    } catch (error) {
      this.logger.error('RefreshTokenRepository.markUsed error', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke every token in a family — the response to reuse detection.
   *
   * @param {string} family - Token family UUID
   * @returns {Promise<number>} Number of records revoked
   */
  async revokeFamily(family) {
    try {
      const result = await this.model.revokeFamily(family);
      return result.modifiedCount ?? 0;
    } catch (error) {
      this.logger.error('RefreshTokenRepository.revokeFamily error', {
        family,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke every live token for a user — full logout.
   *
   * @param {string} userId
   * @returns {Promise<number>} Number of records revoked
   */
  async revokeAllForUser(userId) {
    try {
      const result = await this.model.revokeAllForUser(userId);
      return result.modifiedCount ?? 0;
    } catch (error) {
      this.logger.error('RefreshTokenRepository.revokeAllForUser error', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = RefreshTokenRepository;
