/**
 * SessionRevocation Model
 *
 * "Every access token this account was issued before `revokedAt` is dead" —
 * written on logout, password change/reset and coach-code reset.
 *
 * Access tokens are stateless JWTs, so a logout is enforced by remembering when
 * it happened. That memory used to live only in the API process (Redis is not
 * configured on Render or OCI), so every restart, deploy and OCI failover
 * forgot every logout and a signed-out token worked again (security audit
 * 2026-10-31, M4). This collection is the durable copy: the token-invalidation
 * service writes through to it and reloads it when a process starts.
 *
 * One document per account, keyed by the account id (ObjectIds are unique
 * across the user collections). `expiresAt` is when no token issued before
 * `revokedAt` can still be valid, after which the record is irrelevant; the
 * service ignores and prunes records past it, so no TTL index is needed.
 */

const mongoose = require('mongoose');

const sessionRevocationSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    revokedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, collection: 'sessionrevocations' }
);

module.exports = mongoose.model('SessionRevocation', sessionRevocationSchema);
