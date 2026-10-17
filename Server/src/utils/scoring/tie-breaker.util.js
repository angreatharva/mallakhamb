/**
 * Tie-Breaker Utilities
 *
 * Placement is decided on `finalScore`. When two competitors in the same
 * standing finish on the same finalScore, the size of the panel that judged
 * them decides how the tie is broken:
 *
 *   3 judges (1 senior + 2 evaluation)
 *     1. Lower time wins.
 *
 *   4 and 5 judges — COP Mallakhamb §1.12 (Server/docs/COP Mallakhamb.pdf)
 *     1. (1.12.1) Higher base score wins. The base score is COP §2.1.3:
 *        (average of the two middle scores of the four judges + Chief) / 2,
 *        calculated here for every tied competitor, whether or not the base
 *        score was applied to their final score.
 *     2. (1.12.2) Higher average score of the four judges wins — the plain
 *        mean of all four evaluation marks, Chief excluded, nothing dropped.
 *     3. (1.12.3) Higher (average of the four judges + Chief) / 2 wins.
 *
 * "The four judges" are the four evaluation slots. A 5-judge panel has four
 * evaluators (J1–J4). A 4-judge panel has three, and the Sr. Judge fills the
 * vacant fourth slot — the same convention calculation.util.js scores it with
 * and the Scorer sheet draws (Judge 4 mirrors the Sr. Judge).
 *
 * COP 1.12.4 (lucky draw) is deliberately NOT implemented. If no step can
 * separate two competitors — identical time, identical marks at every step,
 * or the field a step needs is missing — the tie stands. Both take the same
 * placing and the next placing is skipped (1, 1, 3). Nothing here is decided
 * randomly: ranking the same data twice returns the same order.
 *
 * Team Championship ranks on summed team totals and does not enter this
 * engine — see `calculateTeamRankings` in ranking.util.js.
 */

const { calculateIndividualScore } = require('./calculation.util');

const EPSILON = 1e-6;

/**
 * Apply the tie-break rules to a list of competitors in one standing.
 *
 * Callers must pass competitors who are actually racing each other: one
 * apparatus, one category. `calculateIndividualRankingsByApparatus` does that
 * grouping.
 *
 * Each competitor is expected to carry:
 *   - finalScore  (number)  — primary sort key
 *   - panelSize   (3|4|5)   — inferred from the judge marks when absent
 *   - judgeScores ({ seniorJudge, judge1..judge4 })
 *   - time        (string "MM:SS" | string seconds | number) — 3-judge panels
 *
 * @param {Array<Object>} players
 * @param {string} competitionType - accepted for call compatibility; the rules
 *   are the same for every competition type.
 * @returns {Array<Object>} Sorted copies, with `tieBreakInfo` on tied entries
 */
function applyTieBreaker(players, competitionType = 'Competition II') {
  if (!players || players.length === 0) {
    return [];
  }

  // Shallow-clone so the caller's documents are not reordered or annotated
  const items = players.map((player) => ({ ...player }));

  items.sort((a, b) => {
    const outcome = determineTieBreakerWinner(a, b, competitionType);
    if (outcome.winner === 'A') return -1;
    if (outcome.winner === 'B') return 1;
    return 0;
  });

  annotateTieGroups(items, competitionType);

  return items;
}

/**
 * Record how each member of a tie group was separated from the competitor
 * next to it, so a results screen can explain a placing rather than just
 * asserting it.
 *
 * @param {Array<Object>} sorted - already in final order
 * @param {string} competitionType
 */
function annotateTieGroups(sorted, competitionType) {
  let start = 0;

  while (start < sorted.length) {
    let end = start + 1;
    while (
      end < sorted.length &&
      Math.abs(toNumber(sorted[end].finalScore) - toNumber(sorted[start].finalScore)) <= EPSILON
    ) {
      end++;
    }

    if (end - start > 1) {
      for (let i = start; i < end; i++) {
        // Compare against the neighbour this competitor was ordered against:
        // the one above, or for the group leader, the one below.
        const neighbour = i > start ? sorted[i - 1] : sorted[i + 1];
        const outcome = determineTieBreakerWinner(sorted[i], neighbour, competitionType);

        sorted[i].tieBreakInfo = {
          resolvedAtStep: outcome.step,
          method: outcome.reason,
          unresolved: outcome.winner === 'tie'
        };
      }
    }

    start = end;
  }
}

/**
 * Decide which of two competitors places higher.
 *
 * @param {Object} playerA
 * @param {Object} playerB
 * @param {string} competitionType - accepted for call compatibility
 * @returns {Object} { winner: 'A'|'B'|'tie', reason, step, isTieBreaker }
 */
function determineTieBreakerWinner(playerA, playerB, competitionType = 'Competition II') {
  const finalA = toNumber(playerA?.finalScore);
  const finalB = toNumber(playerB?.finalScore);

  // Not tied at all — the score decides and no tie-break rule is consulted.
  if (Math.abs(finalA - finalB) > EPSILON) {
    return {
      winner: finalA > finalB ? 'A' : 'B',
      reason: 'higher_final_score',
      step: 0,
      isTieBreaker: false
    };
  }

  const sizeA = panelSizeOf(playerA);
  const sizeB = panelSizeOf(playerB);

  // Three-judge panels are separated on time alone — the senior judge's mark
  // is not used, and there is no second step.
  if (sizeA === 3 && sizeB === 3) {
    const timeA = timeInSeconds(playerA);
    const timeB = timeInSeconds(playerB);

    if (timeA === null || timeB === null) {
      return {
        winner: 'tie',
        reason: 'time_unavailable',
        step: 1,
        isTieBreaker: true
      };
    }

    if (Math.abs(timeA - timeB) > EPSILON) {
      return {
        winner: timeA < timeB ? 'A' : 'B',
        reason: 'faster_time',
        step: 1,
        isTieBreaker: true
      };
    }

    return {
      winner: 'tie',
      reason: 'identical_time',
      step: 1,
      isTieBreaker: true
    };
  }

  // Four- and five-judge panels: COP 1.12.1 – 1.12.3, in order.
  const steps = [
    { reason: 'base_score', value: baseScoreOf },
    { reason: 'four_judge_average', value: fourJudgeAverageOf },
    { reason: 'four_judge_average_with_chief', value: fourJudgeAverageWithChiefOf }
  ];

  for (let index = 0; index < steps.length; index++) {
    const { reason, value } = steps[index];
    const step = index + 1;
    const valueA = value(playerA, sizeA);
    const valueB = value(playerB, sizeB);

    if (valueA === null || valueB === null) {
      return {
        winner: 'tie',
        reason: 'panel_scores_unavailable',
        step,
        isTieBreaker: true
      };
    }

    if (Math.abs(valueA - valueB) > EPSILON) {
      return {
        winner: valueA > valueB ? 'A' : 'B',
        reason,
        step,
        isTieBreaker: true
      };
    }
  }

  return {
    winner: 'tie',
    reason: 'identical_panel_scores',
    step: steps.length,
    isTieBreaker: true
  };
}

/**
 * True when the rules cannot separate two competitors, so they share a placing.
 *
 * @param {Object} playerA
 * @param {Object} playerB
 * @param {string} competitionType
 * @returns {boolean}
 */
function areTied(playerA, playerB, competitionType = 'Competition II') {
  return determineTieBreakerWinner(playerA, playerB, competitionType).winner === 'tie';
}

/**
 * The panel that judged this performance.
 *
 * `panelSize` is written at scoring time and is authoritative. Inferring it
 * from the marks is only a fallback, and an imperfect one: a judge who scored
 * 0.00 looks exactly like a judge who never sat.
 *
 * @param {Object} player
 * @returns {number|null} 3, 4, 5, or null when it cannot be established
 */
function panelSizeOf(player) {
  const declared = Number(player?.panelSize);
  if (declared === 3 || declared === 4 || declared === 5) {
    return declared;
  }

  const marked = judgeMarksOf(player).filter((mark) => mark > 0).length;
  return marked >= 3 && marked <= 5 ? marked : null;
}

/**
 * The senior (superior) judge's total for this performance.
 *
 * @param {Object} player
 * @returns {number}
 */
function seniorScoreOf(player) {
  const candidates = [
    player?.judgeScores?.seniorJudge,
    player?.seniorJudgeScore,
    player?.chiefScore
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return 0;
}

/**
 * The four evaluation slots of a 4- or 5-judge panel: J1–J4 on a 5-judge
 * panel; J1–J3 plus the Sr. Judge in the vacant fourth slot on a 4-judge one.
 *
 * @param {Object} player
 * @param {number|null} panelSize
 * @returns {Array<number>|null} null when the panel size is not 4 or 5
 */
function fourJudgeMarksOf(player, panelSize) {
  const size = panelSize || panelSizeOf(player);
  const [senior, judge1, judge2, judge3, judge4] = judgeMarksOf(player);

  if (size === 5) return [judge1, judge2, judge3, judge4];
  if (size === 4) return [judge1, judge2, judge3, senior];
  return null;
}

/**
 * COP 1.12.1 / 2.1.3 — the base score:
 * (average of the two middle scores of the four judges + Chief) / 2.
 *
 * The middle-two average is taken from calculation.util.js, so the tie-break
 * reads a panel the same way the score itself was calculated. Only the seats
 * the panel has are passed, so a stray mark in an empty slot is ignored.
 *
 * @param {Object} player
 * @param {number|null} panelSize
 * @returns {number|null} null when the panel cannot be read
 */
function baseScoreOf(player, panelSize) {
  const size = panelSize || panelSizeOf(player);
  if (size !== 4 && size !== 5) {
    return null;
  }

  const [seniorJudge, judge1, judge2, judge3, judge4] = judgeMarksOf(player);
  const seats = size === 5
    ? { seniorJudge, judge1, judge2, judge3, judge4 }
    : { seniorJudge, judge1, judge2, judge3 };

  const { method, executionAverage } = calculateIndividualScore(seats, size);
  if (!method) {
    return null;
  }

  return (executionAverage + seniorJudge) / 2;
}

/**
 * COP 1.12.2 — the average score of the four judges: the plain mean of all
 * four evaluation marks. The Chief is excluded and nothing is dropped, which
 * is what makes it a different number from the middle-two average.
 *
 * @param {Object} player
 * @param {number|null} panelSize
 * @returns {number|null}
 */
function fourJudgeAverageOf(player, panelSize) {
  const marks = fourJudgeMarksOf(player, panelSize);
  if (!marks) {
    return null;
  }

  return marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
}

/**
 * COP 1.12.3 — (average score of the four judges + Chief Judge score) / 2.
 *
 * @param {Object} player
 * @param {number|null} panelSize
 * @returns {number|null}
 */
function fourJudgeAverageWithChiefOf(player, panelSize) {
  const average = fourJudgeAverageOf(player, panelSize);
  if (average === null) {
    return null;
  }

  return (average + seniorScoreOf(player)) / 2;
}

/**
 * The five judge slots in seat order: senior first, then J1–J4.
 *
 * @param {Object} player
 * @returns {Array<number>}
 */
function judgeMarksOf(player) {
  const scores = player?.judgeScores || {};
  return [
    scores.seniorJudge,
    scores.judge1,
    scores.judge2,
    scores.judge3,
    scores.judge4
  ].map(toNumber);
}

/**
 * Performance time in seconds.
 *
 * The stored value is a string in "MM:SS" form or a plain seconds count —
 * see the `time` field on Score.playerScores.
 *
 * @param {Object} player
 * @returns {number|null} null when absent or unparseable
 */
function timeInSeconds(player) {
  const raw = player?.time;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw !== 'string') {
    return null;
  }

  const text = raw.trim();
  if (!text) {
    return null;
  }

  if (text.includes(':')) {
    const parts = text.split(':');
    if (parts.length > 3) {
      return null;
    }

    let seconds = 0;
    for (const part of parts) {
      if (part.trim() === '') {
        return null;
      }
      const value = Number(part);
      if (!Number.isFinite(value)) {
        return null;
      }
      seconds = seconds * 60 + value;
    }
    return seconds;
  }

  const seconds = Number(text);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * @param {*} value
 * @returns {number} 0 for anything that is not a usable number
 */
function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

module.exports = {
  applyTieBreaker,
  determineTieBreakerWinner,
  areTied,
  // Exported for testing and for callers that need the same reading of a score
  panelSizeOf,
  seniorScoreOf,
  baseScoreOf,
  fourJudgeAverageOf,
  fourJudgeAverageWithChiefOf,
  timeInSeconds
};
