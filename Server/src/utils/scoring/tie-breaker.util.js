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
 *   4 judges (1 senior + 3 evaluation)
 *     1. Higher senior judge score wins.
 *     2. Higher mean of all four judges (sum / 4) wins.
 *
 *   5 judges (1 senior + 4 evaluation)
 *     1. Higher senior judge score wins.
 *     2. Higher mean of all five judges (sum / 5) wins.
 *
 * The mean in step 2 is taken over the WHOLE panel, senior judge included —
 * that is what "all judges score / 4" means — so it is not the same number as
 * `executionAverage`, which excludes the senior judge and drops the high and
 * low marks.
 *
 * If a step cannot separate two competitors — identical time, or an identical
 * senior score AND an identical panel mean, or the field a step needs is
 * missing — the tie stands. Both take the same placing and the next placing is
 * skipped (1, 1, 3). Nothing here is decided randomly: ranking the same data
 * twice returns the same order.
 *
 * Team Championship ranks on summed team totals and does not enter this
 * engine — see `calculateTeamRankings` in ranking.util.js.
 */

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

  // Four- and five-judge panels: the senior judge decides first.
  const seniorA = seniorScoreOf(playerA);
  const seniorB = seniorScoreOf(playerB);

  if (Math.abs(seniorA - seniorB) > EPSILON) {
    return {
      winner: seniorA > seniorB ? 'A' : 'B',
      reason: 'senior_judge_score',
      step: 1,
      isTieBreaker: true
    };
  }

  // Senior judge agrees too: fall back to the mean of the whole panel.
  const meanA = panelMean(playerA, sizeA);
  const meanB = panelMean(playerB, sizeB);

  if (meanA === null || meanB === null) {
    return {
      winner: 'tie',
      reason: 'panel_scores_unavailable',
      step: 2,
      isTieBreaker: true
    };
  }

  if (Math.abs(meanA - meanB) > EPSILON) {
    return {
      winner: meanA > meanB ? 'A' : 'B',
      reason: 'panel_average',
      step: 2,
      isTieBreaker: true
    };
  }

  return {
    winner: 'tie',
    reason: 'identical_panel_average',
    step: 2,
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
 * Mean of every mark on the panel, senior judge included: "all judges / N".
 *
 * Only the seats the panel actually has are counted, so a 4-judge panel
 * divides by 4 and never dilutes itself with an empty `judge4` slot.
 *
 * @param {Object} player
 * @param {number|null} panelSize
 * @returns {number|null} null when the panel size is unknown
 */
function panelMean(player, panelSize) {
  const size = panelSize || panelSizeOf(player);
  if (!size) {
    return null;
  }

  const [senior, ...evaluation] = judgeMarksOf(player);
  const marks = [senior, ...evaluation.slice(0, size - 1)];

  return marks.reduce((sum, mark) => sum + mark, 0) / size;
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
  panelMean,
  timeInSeconds
};
