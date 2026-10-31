/**
 * Phase 5 of docs/superadmin-control-plan.md: the owner corrects one
 * athlete's score, in any meet, finished ones included (owner decision D2:
 * directly, with a reason; no reopening, no emails).
 *
 * The owner edits what the panel wrote — each judge's slip sections, or the
 * judge totals when a row has no slips — plus time and deductions. The final
 * score is NOT typed: it is recomputed by the same engine every live score
 * goes through (CalculationService.calculateCompletePlayerScore →
 * calculateIndividualScore), so 3/4/5-judge panels, the 4-judge Chief copy and
 * the COP tolerance apply exactly as on competition day.
 *
 * Rankings are computed on read, so they follow. Competition I changes
 * re-run the finals' qualifier lists; finals already finalized or started do
 * not reshuffle silently — the result says which ones to reopen.
 *
 * @module services/superadmin/score-correction.service
 */

const mongoose = require('mongoose');
const { ValidationError, NotFoundError } = require('../../errors');
const { requireReason } = require('./correction.service');
const { JUDGE_ROLE_MAP } = require('../../utils/scoring/judge-slip.util');
const { scoringRoomIds } = require('../../utils/data/scoring-room.util');
const { toCompetitionTypeSlug } = require('../../config/cop-rules');

const FIELD_BY_ROLE = Object.fromEntries(Object.values(JUDGE_ROLE_MAP).map(({ field, role }) => [role, field]));
const JUDGE_FIELDS = Object.values(JUDGE_ROLE_MAP).map((m) => m.field);
const SECTIONS = { difficultyScore: 3.8, combinationScore: 1.6, executionScore: 4.4 };

const r2 = (n) => Number((Number(n) || 0).toFixed(2));
const r3 = (n) => Number((Number(n) || 0).toFixed(3));
const idOf = (v) => (v && v._id ? String(v._id) : v ? String(v) : null);

/** A number in [0, max], or a 400 naming the field. */
function bounded(value, max, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new ValidationError(`${label} must be between 0 and ${max}`);
  return n;
}

/** The fields of a row that a correction can change, for the before/after record. */
const snapshot = (row) => ({
  judgeScores: Object.fromEntries(JUDGE_FIELDS.map((f) => [f, r2(row.judgeScores?.[f])])),
  slips: (row.judgeSlips || []).map((s) => ({ role: s.judgeRole, d: s.difficultyScore, c: s.combinationScore, e: s.executionScore, b: s.bonusScore, total: s.total })),
  time: row.time ?? null,
  deduction: row.deduction ?? 0,
  otherDeduction: row.otherDeduction ?? 0,
  averageMarks: row.averageMarks ?? null,
  baseScoreApplied: !!row.baseScoreApplied,
  finalScore: row.finalScore ?? null,
});

class ScoreCorrectionService {
  constructor({ correctionService, calculationService, competitionRepository, logger }) {
    this.corrections = correctionService;
    this.calculation = calculationService;
    this.competitions = competitionRepository;
    this.logger = logger;
    this.socketManager = null;
    this._qualification = null;
  }

  get Score() { return mongoose.model('Score'); }

  /**
   * Every scored row of a meet, filtered by category, competition type or
   * athlete name. Each row carries what the editor needs.
   */
  async list({ competitionId, gender, ageGroup, competitionType, q } = {}) {
    if (!mongoose.isValidObjectId(competitionId)) throw new ValidationError('Choose a competition');
    const query = { competition: competitionId };
    if (gender) query.gender = gender;
    if (ageGroup) query.ageGroup = ageGroup;
    if (competitionType) query.competitionType = competitionType;
    const sheets = await this.Score.find(query).populate('teamId', 'name').lean();
    const rx = q ? new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i') : null;
    const rows = [];
    for (const sheet of sheets) {
      for (const row of sheet.playerScores || []) {
        if (rx && !rx.test(row.playerName || '')) continue;
        rows.push({
          scoreId: sheet._id, rowId: row._id, playerId: row.playerId, playerName: row.playerName,
          team: sheet.teamId ? { _id: sheet.teamId._id || sheet.teamId, name: sheet.teamId.name || null } : null,
          gender: sheet.gender, ageGroup: sheet.ageGroup, competitionType: sheet.competitionType,
          apparatus: row.apparatus, panelSize: row.panelSize ?? null, isLocked: !!sheet.isLocked,
          ...snapshot(row), executionAverage: row.executionAverage ?? null, toleranceUsed: row.toleranceUsed ?? null,
        });
      }
    }
    return rows.sort((a, b) => (a.ageGroup || '').localeCompare(b.ageGroup || '') || (a.apparatus || '').localeCompare(b.apparatus || '') || (b.finalScore || 0) - (a.finalScore || 0));
  }

  /**
   * Correct one row.
   * @param {Object} body
   * @param {Array<{judgeRole: string, difficultyScore?, combinationScore?, executionScore?, bonusScore?}>} [body.slips]
   * @param {Object} [body.judgeScores]  totals by seat, for rows with no slips
   * @param {number} [body.time]
   * @param {number} [body.deduction]
   * @param {number} [body.otherDeduction]
   */
  async correct(actor, scoreId, rowId, body = {}) {
    const reason = requireReason(body.reason);
    if (!mongoose.isValidObjectId(scoreId) || !mongoose.isValidObjectId(rowId)) throw new ValidationError('Invalid score');
    const sheet = await this.Score.findById(scoreId);
    if (!sheet) throw new NotFoundError('Score sheet');
    const row = sheet.playerScores.id(rowId);
    if (!row) throw new NotFoundError('Score row');
    const before = snapshot(row.toObject());

    let touched = false;
    for (const edit of Array.isArray(body.slips) ? body.slips : []) {
      const slip = (row.judgeSlips || []).find((s) => s.judgeRole === edit.judgeRole);
      if (!slip) throw new ValidationError(`No ${edit.judgeRole} slip on this score`);
      for (const [key, max] of Object.entries(SECTIONS)) {
        if (edit[key] !== undefined) slip[key] = bounded(edit[key], max, key.replace('Score', ''));
      }
      if (edit.executionScore !== undefined && Math.round(slip.executionScore * 20) / 20 !== Number(slip.executionScore)) {
        throw new ValidationError('Execution must be in steps of 0.05');
      }
      if (edit.bonusScore !== undefined) {
        const bonus = Number(edit.bonusScore);
        if (![0, 0.2].includes(bonus)) throw new ValidationError('Bonus is 0 or 0.20');
        slip.bonusScore = bonus;
      }
      slip.total = r2(slip.difficultyScore + slip.combinationScore + slip.executionScore + (slip.bonusScore || 0));
      if (slip.total > 10) throw new ValidationError(`${edit.judgeRole}'s total cannot exceed 10`);
      const field = FIELD_BY_ROLE[slip.judgeRole];
      if (field) row.judgeScores[field] = slip.total;
      touched = true;
    }
    if (body.judgeScores && typeof body.judgeScores === 'object') {
      for (const field of JUDGE_FIELDS) {
        if (body.judgeScores[field] === undefined) continue;
        if ((row.judgeSlips || []).some((s) => FIELD_BY_ROLE[s.judgeRole] === field)) {
          throw new ValidationError(`Correct ${field} through its slip, so the slip and the total stay the same`);
        }
        row.judgeScores[field] = r2(bounded(body.judgeScores[field], 10, field));
        touched = true;
      }
    }
    if (body.time !== undefined) { row.time = body.time === null ? null : bounded(body.time, 600, 'Time'); touched = true; }
    if (body.deduction !== undefined) { row.deduction = r2(bounded(body.deduction, 10, 'Deduction')); touched = true; }
    if (body.otherDeduction !== undefined) { row.otherDeduction = r2(bounded(body.otherDeduction, 10, 'Other deduction')); touched = true; }
    if (!touched) throw new ValidationError('Nothing to change');

    // The same engine as competition day.
    const computed = this.calculation.calculateCompletePlayerScore(
      { ...row.toObject(), finalScore: 0 },
      { panelSize: row.panelSize || undefined }
    );
    for (const key of ['executionAverage', 'baseScore', 'baseScoreApplied', 'toleranceUsed', 'averageMarks']) {
      if (computed[key] !== undefined) row[key] = computed[key];
    }
    row.finalScore = r3(computed.finalScore);
    sheet.markModified('playerScores');
    try {
      await sheet.save();
    } catch (error) {
      if (error?.name === 'ValidationError') throw new ValidationError(error.message);
      throw error;
    }

    const after = snapshot(row.toObject());
    const label = `${row.playerName || 'Athlete'} — ${row.apparatus || ''} (${sheet.competitionType})`;
    await this.corrections.record({
      actor, entity: 'score', entityId: row.playerId, action: 'SCORE_CORRECTED', label, reason,
      competitionId: sheet.competition, before, after,
      extra: { scoreId: String(sheet._id), rowId: String(row._id), gender: sheet.gender, ageGroup: sheet.ageGroup, competitionType: sheet.competitionType },
    });

    const finals = await this._afterCorrection(sheet, row);
    return { row: { scoreId: sheet._id, rowId: row._id, playerName: row.playerName, apparatus: row.apparatus, ...after }, finals };
  }

  /** Tell open score screens, and re-run the finals a Competition I change feeds. */
  async _afterCorrection(sheet, row) {
    try {
      const slug = toCompetitionTypeSlug(sheet.competitionType);
      for (const room of scoringRoomIds(sheet.gender, sheet.ageGroup, slug)) {
        this.socketManager?.emitToRoom?.(room, 'scores_saved_notification', {
          playerId: row.playerId, playerName: row.playerName, teamId: idOf(sheet.teamId), finalScore: row.finalScore,
          apparatus: row.apparatus || null, isFinalized: !!row.isFinalized, isLocked: !!sheet.isLocked, corrected: true,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger?.warn?.('Correction not broadcast', { error: error.message });
    }

    if (toCompetitionTypeSlug(sheet.competitionType) !== 'competition_1') return { recomputed: false, held: [] };
    const q = this._qualification;
    if (!q?.onCompetitionOneChange) return { recomputed: false, held: [] };
    await q.onCompetitionOneChange(sheet.competition, sheet.gender, sheet.ageGroup);
    const held = await mongoose.model('Qualification').find(
      { competition: sheet.competition, gender: sheet.gender, $or: [{ finalizedAt: { $ne: null } }, { frozenAt: { $ne: null } }] },
      { competitionType: 1, ageGroup: 1, apparatus: 1, finalizedAt: 1, frozenAt: 1 }
    ).lean().catch(() => []);
    return {
      recomputed: true,
      held: held.map((f) => ({ _id: f._id, competitionType: f.competitionType, ageGroup: f.ageGroup, apparatus: f.apparatus, started: !!f.frozenAt })),
    };
  }
}

module.exports = ScoreCorrectionService;
