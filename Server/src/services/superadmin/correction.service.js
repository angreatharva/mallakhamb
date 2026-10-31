/**
 * The owner's correction record (docs/superadmin-control-plan.md, Phase 2).
 *
 * Every change the Super Admin makes to existing data goes through
 * `record()`: who, when, what, the reason, and a field-level before/after.
 * Rows live in the AuditLog collection beside everything else that is
 * audited, so the History tab reads ONE place.
 *
 * Undo: a plain field edit stores the old values under `details.undo`. Undo
 * replays them through the SAME service method the edit used (registered per
 * entity with `registerUndo`), so validation and uniqueness checks run again,
 * and the undo is itself a recorded correction. Structural changes (moving a
 * player, changing a coach, a score) are not undoable here: they are corrected
 * by doing the opposite move, which keeps every side effect honest.
 *
 * @module services/superadmin/correction.service
 */

const { ValidationError, NotFoundError, BusinessRuleError } = require('../../errors');

/** Fields never written into the record, even as "changed". */
const SECRET_FIELDS = new Set(['password', 'defaultPassword', 'resetPasswordToken', 'resetPasswordExpires', 'otp', 'otpExpires']);

const MIN_REASON = 5;

/** A reason of at least five characters, trimmed. */
function requireReason(reason) {
  const text = String(reason || '').trim();
  if (text.length < MIN_REASON) throw new ValidationError(`Give a reason (at least ${MIN_REASON} characters)`);
  return text.slice(0, 500);
}

const plain = (value) => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value === 'object' && value._bsontype === 'ObjectId') return String(value);
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value.toObject ? value.toObject() : value)) out[k] = plain(v);
    return out;
  }
  return value;
};

/**
 * Field-level differences between two objects, over `fields` (or the union of
 * both objects' keys). Secrets are reported as "changed" with no values.
 */
function diff(before = {}, after = {}, fields) {
  const keys = fields || [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  const changes = [];
  for (const field of keys) {
    const from = plain(before?.[field]);
    const to = plain(after?.[field]);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes.push(SECRET_FIELDS.has(field) ? { field, secret: true } : { field, from, to });
  }
  return changes;
}

class CorrectionService {
  constructor({ auditLogRepository, adminRepository, logger }) {
    this.audit = auditLogRepository;
    this.admins = adminRepository;
    this.logger = logger;
    this.undoers = new Map();
  }

  /** `fn(actor, entityId, values, reason)` re-applies old field values for `entity`. */
  registerUndo(entity, fn) {
    this.undoers.set(entity, fn);
  }

  /**
   * Write one correction.
   * @param {Object} p
   * @param {{id: string, name?: string}} p.actor
   * @param {string} p.entity     e.g. 'player', 'coach', 'team', 'score'
   * @param {string} p.entityId
   * @param {string} p.action     e.g. 'PLAYER_UPDATED'
   * @param {string} [p.label]    what a person reads: "Riya Mane"
   * @param {string} [p.reason]
   * @param {Object} [p.before]
   * @param {Object} [p.after]
   * @param {string[]} [p.fields] limit the diff to these fields
   * @param {boolean} [p.undoable] store old values so History can undo
   * @param {string} [p.competitionId]
   * @param {Object} [p.extra]    anything else worth keeping
   */
  async record({ actor, entity, entityId, action, label, reason, before, after, fields, undoable = false, competitionId, extra = {} }) {
    const changes = before || after ? diff(before, after, fields) : [];
    const undo = undoable && changes.length && !changes.some((c) => c.secret)
      ? Object.fromEntries(changes.map((c) => [c.field, c.from]))
      : null;
    const actorName = actor?.name || await this._actorName(actor?.id);
    try {
      return await this.audit.logAction({
        adminId: actor.id,
        adminType: 'superadmin',
        action,
        resource: entity,
        resourceId: String(entityId),
        details: {
          correction: true,
          entity,
          label: label || null,
          reason: reason || null,
          changes,
          undo,
          competition: competitionId ? String(competitionId) : null,
          actorName,
          ...extra,
        },
      });
    } catch (error) {
      // The change itself already happened; a lost record is logged loudly
      // rather than reported to the owner as a failed correction.
      this.logger?.error?.('Correction record could not be saved', { action, entity, entityId: String(entityId), error: error.message });
      return null;
    }
  }

  async _actorName(id) {
    if (!id || !this.admins) return null;
    try {
      const admin = await this.admins.findById(id);
      return admin?.name || null;
    } catch {
      return null;
    }
  }

  /**
   * Everything on record, newest first. Corrections and the older audited
   * actions (player teams, walk-in, panels, account requests) alike.
   */
  async list({ entity, competitionId, entityId, q, correctionsOnly, page = 1, limit = 50 } = {}) {
    const query = {};
    if (entity) query.resource = entity;
    if (entityId) query.resourceId = String(entityId);
    if (competitionId) query['details.competition'] = String(competitionId);
    if (correctionsOnly === true || correctionsOnly === 'true') query['details.correction'] = true;
    // Sign-ins and sign-outs are audited too; they are noise in a change history.
    query.action = { $nin: ['LOGIN', 'LOGOUT', 'OTP_GENERATED', 'OTP_VERIFIED'] };
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i');
      query.$or = [{ 'details.label': rx }, { 'details.reason': rx }, { action: rx }, { resourceId: rx }];
    }
    const size = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const current = Math.max(Number(page) || 1, 1);
    const [rows, total] = await Promise.all([
      this.audit.model.find(query).sort({ createdAt: -1 }).skip((current - 1) * size).limit(size).lean(),
      this.audit.model.countDocuments(query),
    ]);
    return {
      total,
      page: current,
      pages: Math.max(Math.ceil(total / size), 1),
      rows: rows.map((r) => ({
        _id: r._id,
        at: r.createdAt,
        action: r.action,
        entity: r.resource,
        entityId: r.resourceId,
        actorId: r.adminId,
        actorType: r.adminType,
        actorName: r.details?.actorName || null,
        label: r.details?.label || null,
        reason: r.details?.reason || null,
        changes: r.details?.changes || [],
        competition: r.details?.competition || null,
        undoable: !!(r.details?.undo && this.undoers.has(r.resource) && !r.details?.undoneAt),
        undoneAt: r.details?.undoneAt || null,
        details: r.details?.correction ? undefined : r.details,
      })),
    };
  }

  /** Put the old values back, as a new correction. */
  async undo(actor, logId, reason) {
    const why = requireReason(reason);
    const row = await this.audit.findById(logId);
    if (!row) throw new NotFoundError('History entry');
    const values = row.details?.undo;
    const undoer = this.undoers.get(row.resource);
    if (!values || !undoer) throw new BusinessRuleError('This change cannot be undone from History. Correct it the same way it was made.');
    if (row.details?.undoneAt) throw new BusinessRuleError('This change was already undone.');
    const result = await undoer(actor, row.resourceId, values, `Undo: ${why}`);
    await this.audit.model.updateOne(
      { _id: row._id },
      { $set: { 'details.undoneAt': new Date(), 'details.undoneBy': String(actor.id) } }
    );
    return result;
  }
}

module.exports = CorrectionService;
module.exports.requireReason = requireReason;
module.exports.diff = diff;
