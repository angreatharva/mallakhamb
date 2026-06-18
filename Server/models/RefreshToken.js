/**
 * RefreshToken Model
 *
 * Stores hashed refresh tokens with family tracking for rotation-based
 * reuse detection. Each token belongs to a "family" — when a refresh token
 * is used, a new one is issued in the same family and the old one is
 * invalidated. If a previously-used token is presented again, the entire
 * family is revoked (indicating possible theft).
 *
 * Requirements: HIGH-5 (Refresh token rotation — Phase 2A, Item 2.2)
 */

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    /** SHA-256 hash of the token value (never store raw tokens) */
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },

    /** Reference to the user who owns this token */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    /** User type: player, coach, admin, judge, superadmin */
    userType: {
      type: String,
      required: true,
      enum: ['player', 'coach', 'admin', 'judge', 'superadmin'],
    },

    /**
     * Token family identifier (UUID).
     * All tokens issued through rotation within a single login session
     * share the same family. Revoking by family invalidates the entire chain.
     */
    family: {
      type: String,
      required: true,
      index: true,
    },

    /** When this token expires (TTL index auto-deletes expired docs) */
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL index — auto-delete on expiry
    },

    /** Whether this token has already been consumed via rotation */
    isUsed: {
      type: Boolean,
      default: false,
    },

    /** Whether this token has been revoked (logout or reuse detection) */
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  },
);

/**
 * Revoke all tokens in a given family (reuse detection).
 * @param {string} family - Token family UUID
 * @returns {Promise<Object>} MongoDB updateMany result
 */
refreshTokenSchema.statics.revokeFamily = function (family) {
  return this.updateMany({ family }, { $set: { isRevoked: true } });
};

/**
 * Revoke all tokens for a given user (full logout).
 * @param {string} userId
 * @returns {Promise<Object>} MongoDB updateMany result
 */
refreshTokenSchema.statics.revokeAllForUser = function (userId) {
  return this.updateMany(
    { userId, isRevoked: false },
    { $set: { isRevoked: true } },
  );
};

/**
 * Find a valid (not used, not revoked, not expired) token by its hash.
 * @param {string} tokenHash
 * @returns {Promise<Object|null>}
 */
refreshTokenSchema.statics.findValidToken = function (tokenHash) {
  return this.findOne({
    tokenHash,
    isUsed: false,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  });
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
