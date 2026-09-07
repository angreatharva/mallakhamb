/**
 * Judge slip assembly (task 3.2 / MED-6).
 *
 * A panel role appears in a Score document in two places under two different
 * spellings: as a key on `judgeScores` (`seniorJudge`, `judge1`…) and as
 * `judgeSlips[].judgeRole` (`SR_JUDGE`, `J1`…). That mapping was written out
 * by hand in at least two places — `admin.controller.js` (slip construction)
 * and `judge.service.js` (reading a judge's own scores back) — so the two
 * could disagree about which field a role writes to. A judge would then submit
 * into one slot and be told they had not scored the performer.
 *
 * The project's own docs/architecture.md says controllers do "HTTP I/O only —
 * no business logic". Slip assembly is domain logic, and keeping it in the
 * controller is why the HTTP and socket paths could not share it.
 *
 * These are pure functions over plain data: no repository, no request, no
 * response. That is what lets both transports use them.
 */

/**
 * The canonical panel-role mapping. This is the single source of truth for how
 * a judgeType maps onto a Score document.
 */
const JUDGE_ROLE_MAP = Object.freeze({
  'Senior Judge': Object.freeze({ field: 'seniorJudge', role: 'SR_JUDGE' }),
  'Judge 1': Object.freeze({ field: 'judge1', role: 'J1' }),
  'Judge 2': Object.freeze({ field: 'judge2', role: 'J2' }),
  'Judge 3': Object.freeze({ field: 'judge3', role: 'J3' }),
  'Judge 4': Object.freeze({ field: 'judge4', role: 'J4' }),
});

/** Panel roles that actually evaluate. Excludes 'Scorer', which records for the panel. */
const PANEL_JUDGE_TYPES = Object.freeze(Object.keys(JUDGE_ROLE_MAP));

/** Every `judgeScores` key, in panel order. */
const JUDGE_SCORE_FIELDS = Object.freeze(PANEL_JUDGE_TYPES.map((t) => JUDGE_ROLE_MAP[t].field));

/**
 * The inverse of the mapping: `judgeScores` key → judgeType.
 *
 * Needed by the read side — the socket broadcast has a field name and has to
 * say which judge it belongs to. That inverse was written out by hand in
 * `scoring.service.saveScores`, which is exactly the divergence this module
 * exists to prevent, just pointing the other way.
 */
const JUDGE_TYPE_BY_FIELD = Object.freeze(
  Object.fromEntries(PANEL_JUDGE_TYPES.map((t) => [JUDGE_ROLE_MAP[t].field, t]))
);

/**
 * Resolve a judgeType to its Score-document field and slip role.
 *
 * Falls back to Judge 1 to preserve the behaviour the call sites already had
 * (`|| { field: 'judge1', role: 'J1' }`). Callers that must not guess should
 * check `isPanelJudgeType` first — the HTTP path does, and rejects with 403.
 *
 * @param {string} judgeType
 * @returns {{field: string, role: string}}
 */
function getJudgeRoleMapping(judgeType) {
  return JUDGE_ROLE_MAP[judgeType] || { field: 'judge1', role: 'J1' };
}

/**
 * Is this a real evaluating panel role?
 * @param {string} judgeType
 * @returns {boolean}
 */
function isPanelJudgeType(judgeType) {
  return Object.prototype.hasOwnProperty.call(JUDGE_ROLE_MAP, judgeType);
}

/**
 * Build the single-performer `playerScores` entry for one judge's slip.
 *
 * `judgeType` must already be the AUTHENTICATED identity — resolving who is
 * submitting is an authorization decision and stays at the transport layer
 * (see HIGH-1). This function only decides what the slip looks like.
 *
 * @param {Object} input
 * @param {string} input.judgeType   Authenticated panel role
 * @param {*}      input.playerId
 * @param {string} [input.playerName]
 * @param {string} [input.apparatus]
 * @param {number} input.score       Slip total
 * @param {Object} [input.breakdown] Full COP breakdown
 * @param {Date}   [input.submittedAt]
 * @returns {Object} a `playerScores[]` entry
 */
function buildJudgeSlipPlayerScore({
  judgeType,
  playerId,
  playerName,
  apparatus,
  score,
  breakdown,
  submittedAt,
}) {
  const { field, role } = getJudgeRoleMapping(judgeType);
  const slipBreakdown = breakdown || {};
  // `originality` is the older name for the same 0.20 bonus.
  const bonus = slipBreakdown.bonus ?? slipBreakdown.originality ?? 0;

  return {
    playerId,
    playerName,
    apparatus: apparatus || 'Pole Mallakhamb',
    judgeScores: {
      [field]: score,
    },
    breakdown: slipBreakdown,
    // Per-judge detailed slip for Panel Review / audit (v2 judgeSlips).
    // Carries the full breakdown (element counts, combination checklist) so
    // re-opening this judge's slip for edit restores the exact selections, not
    // just the section totals.
    judgeSlips: [{
      judgeRole: role,
      difficultyScore: slipBreakdown.difficulty?.total || 0,
      combinationScore: slipBreakdown.combination?.total || 0,
      executionScore: slipBreakdown.execution || 0,
      // The bonus is all-or-nothing at 0.20.
      bonusScore: bonus === 0.20 ? 0.20 : 0,
      total: score,
      breakdown: slipBreakdown,
      submittedAt: submittedAt || new Date(),
      isChiefPrefilled: judgeType === 'Senior Judge',
    }],
  };
}

module.exports = {
  JUDGE_ROLE_MAP,
  PANEL_JUDGE_TYPES,
  JUDGE_SCORE_FIELDS,
  JUDGE_TYPE_BY_FIELD,
  getJudgeRoleMapping,
  isPanelJudgeType,
  buildJudgeSlipPlayerScore,
};
