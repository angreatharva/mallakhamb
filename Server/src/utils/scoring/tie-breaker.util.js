/**
 * Tie-Breaker Utilities — v2 Spec (Section 7, rule 1.12)
 *
 * Implements the strict 4-step tie-break cascade defined in the v2 spec:
 *   Step 1: Compare base_score (if computed) or fall back to avg_score
 *   Step 2: Average of evaluation judges (excluding chief)
 *   Step 3: (avg of judges + chief judge score) / 2
 *   Step 4: Lucky draw (random shuffle, logged as "resolved by draw")
 *
 * For 3-judge panels (no chief score available), Steps 2–3 are skipped:
 *   Step 1 → Step 4.
 *
 * Applies to All-Round Individual (Comp II) and Apparatus Championship
 * (Comp III) placements. Team Championship ranking uses summed team totals
 * and does not enter this tie-break engine.
 *
 * Requirements: v2 §7
 */

/**
 * Apply the v2 4-step tie-break cascade to a list of players.
 *
 * Each player object is expected to have:
 *   - finalScore    (number)   — primary sort key
 *   - baseScore     (number|null) — Step 1 fallback
 *   - averageMarks  (number)   — avg_score / executionAverage
 *   - executionAverage (number) — avg of eval judges (excluding chief)
 *   - chiefScore    (number|null) — chief/senior judge's total
 *   - panelSize     (number|null) — 3, 4, or 5 (null = unknown)
 *
 * @param {Array<Object>} players
 * @param {string} competitionType — 'Competition I' | 'Competition II' | 'Competition III'
 * @returns {Array<Object>} Sorted players with `tieBreakInfo` attached where needed
 */
function applyTieBreaker(players, competitionType = 'Competition II') {
  if (!players || players.length === 0) {
    return [];
  }

  // Deep-clone to avoid mutating input
  const items = players.map(p => ({ ...p }));

  // Primary sort: higher finalScore wins
  items.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

  // Walk through the sorted list and break ties within each group
  let i = 0;
  while (i < items.length) {
    // Find the extent of the tie group
    let j = i + 1;
    while (j < items.length && (items[j].finalScore || 0) === (items[i].finalScore || 0)) {
      j++;
    }

    if (j - i > 1) {
      // There is a tie among items[i..j-1]; apply the 4-step cascade
      const tiedGroup = items.slice(i, j);
      const resolved = resolveTieGroup(tiedGroup);
      for (let k = 0; k < resolved.length; k++) {
        items[i + k] = resolved[k];
      }
    }

    i = j;
  }

  return items;
}

/**
 * Resolve a group of players that share the same finalScore
 * using the v2 4-step cascade.
 *
 * @param {Array<Object>} group
 * @returns {Array<Object>}
 */
function resolveTieGroup(group) {
  // Step 1: compare base_score (if computed) or fall back to avg_score
  const step1Key = p => p.baseScore || p.averageMarks || p.executionAverage || 0;
  const step1Sorted = [...group].sort((a, b) => step1Key(b) - step1Key(a));

  const subGroups1 = splitIntoTieSubGroups(step1Sorted, step1Key);
  const result = [];

  for (const sub of subGroups1) {
    if (sub.length === 1) {
      sub[0].tieBreakInfo = { resolvedAtStep: 1, method: 'base_score' };
      result.push(sub[0]);
      continue;
    }

    // Check if chief score is available (4/5-judge panels)
    const hasChief = sub.some(p => {
      const ps = p.panelSize || 0;
      return ps >= 4 || (p.chiefScore != null && p.chiefScore > 0);
    });

    if (!hasChief) {
      // 3-judge panel: skip Steps 2-3, go directly to Step 4 (lucky draw)
      const shuffled = luckyDraw(sub);
      shuffled.forEach(p => {
        p.tieBreakInfo = { resolvedAtStep: 4, method: 'lucky_draw' };
      });
      result.push(...shuffled);
      continue;
    }

    // Step 2: average of evaluation judges (excluding chief)
    const step2Key = p => p.executionAverage || p.averageMarks || 0;
    const step2Sorted = [...sub].sort((a, b) => step2Key(b) - step2Key(a));
    const subGroups2 = splitIntoTieSubGroups(step2Sorted, step2Key);

    for (const sub2 of subGroups2) {
      if (sub2.length === 1) {
        sub2[0].tieBreakInfo = { resolvedAtStep: 2, method: 'avg_eval_judges' };
        result.push(sub2[0]);
        continue;
      }

      // Step 3: (avg of judges + chief judge score) / 2
      const step3Key = p => {
        const avg = p.executionAverage || p.averageMarks || 0;
        const chief = p.chiefScore || p.seniorJudgeScore || 0;
        return (avg + chief) / 2;
      };
      const step3Sorted = [...sub2].sort((a, b) => step3Key(b) - step3Key(a));
      const subGroups3 = splitIntoTieSubGroups(step3Sorted, step3Key);

      for (const sub3 of subGroups3) {
        if (sub3.length === 1) {
          sub3[0].tieBreakInfo = { resolvedAtStep: 3, method: 'avg_plus_chief' };
          result.push(sub3[0]);
          continue;
        }

        // Step 4: lucky draw
        const shuffled = luckyDraw(sub3);
        shuffled.forEach(p => {
          p.tieBreakInfo = { resolvedAtStep: 4, method: 'lucky_draw' };
        });
        result.push(...shuffled);
      }
    }
  }

  return result;
}

/**
 * Split a sorted array into sub-groups where consecutive items
 * share the same key value.
 */
function splitIntoTieSubGroups(sorted, keyFn) {
  const groups = [];
  let i = 0;
  while (i < sorted.length) {
    const group = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && Math.abs(keyFn(sorted[j]) - keyFn(sorted[i])) < 1e-6) {
      group.push(sorted[j]);
      j++;
    }
    groups.push(group);
    i = j;
  }
  return groups;
}

/**
 * Seeded-random shuffle for tie resolution.
 * In production this should be a witnessed random draw;
 * the software logs it as "resolved by draw" in the audit trail.
 */
function luckyDraw(players) {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Determine tie-breaker winner between two players using the v2 4-step cascade.
 *
 * @param {Object} playerA
 * @param {Object} playerB
 * @param {string} competitionType
 * @returns {Object} { winner: 'A'|'B'|'tie', reason, step, isTieBreaker }
 */
function determineTieBreakerWinner(playerA, playerB, competitionType = 'Competition II') {
  const scoreA = playerA.finalScore || 0;
  const scoreB = playerB.finalScore || 0;

  // Not actually tied
  if (Math.abs(scoreA - scoreB) > 1e-6) {
    return {
      winner: scoreA > scoreB ? 'A' : 'B',
      reason: 'higher_final_score',
      step: 0,
      isTieBreaker: false
    };
  }

  // Step 1: base_score or avg_score
  const base1A = playerA.baseScore || playerA.averageMarks || playerA.executionAverage || 0;
  const base1B = playerB.baseScore || playerB.averageMarks || playerB.executionAverage || 0;
  if (Math.abs(base1A - base1B) > 1e-6) {
    return {
      winner: base1A > base1B ? 'A' : 'B',
      reason: 'base_score',
      step: 1,
      isTieBreaker: true
    };
  }

  // Check if chief score is available
  const hasChief = (playerA.panelSize >= 4 || (playerA.chiefScore != null && playerA.chiefScore > 0))
                || (playerB.panelSize >= 4 || (playerB.chiefScore != null && playerB.chiefScore > 0));

  if (!hasChief) {
    // 3-judge panel: skip to Step 4
    return {
      winner: 'tie',
      reason: 'lucky_draw_required',
      step: 4,
      isTieBreaker: true
    };
  }

  // Step 2: average of eval judges (excluding chief)
  const avg2A = playerA.executionAverage || playerA.averageMarks || 0;
  const avg2B = playerB.executionAverage || playerB.averageMarks || 0;
  if (Math.abs(avg2A - avg2B) > 1e-6) {
    return {
      winner: avg2A > avg2B ? 'A' : 'B',
      reason: 'avg_eval_judges',
      step: 2,
      isTieBreaker: true
    };
  }

  // Step 3: (avg of judges + chief judge score) / 2
  const chiefA = playerA.chiefScore || playerA.seniorJudgeScore || 0;
  const chiefB = playerB.chiefScore || playerB.seniorJudgeScore || 0;
  const combo3A = (avg2A + chiefA) / 2;
  const combo3B = (avg2B + chiefB) / 2;
  if (Math.abs(combo3A - combo3B) > 1e-6) {
    return {
      winner: combo3A > combo3B ? 'A' : 'B',
      reason: 'avg_plus_chief',
      step: 3,
      isTieBreaker: true
    };
  }

  // Step 4: lucky draw
  return {
    winner: 'tie',
    reason: 'lucky_draw_required',
    step: 4,
    isTieBreaker: true
  };
}

/**
 * Check if two players are tied after all tie-break steps.
 *
 * @param {Object} playerA
 * @param {Object} playerB
 * @param {string} competitionType
 * @returns {boolean}
 */
function areTied(playerA, playerB, competitionType = 'Competition II') {
  const result = determineTieBreakerWinner(playerA, playerB, competitionType);
  return result.winner === 'tie';
}

// Legacy compatibility aliases
const compareIndividualScores = (a, b) => {
  const sA = a.individualScore || a.averageMarks || 0;
  const sB = b.individualScore || b.averageMarks || 0;
  if (sB > sA) return 1;
  if (sB < sA) return -1;
  return 0;
};

const compareDeductions = (a, b) => {
  const dA = a.deduction || 0;
  const dB = b.deduction || 0;
  if (dA < dB) return -1;
  if (dA > dB) return 1;
  return 0;
};

module.exports = {
  applyTieBreaker,
  determineTieBreakerWinner,
  areTied,
  // Legacy exports retained for backward compatibility
  compareIndividualScores,
  compareDeductions,
  // Internals exported for testing
  resolveTieGroup,
  splitIntoTieSubGroups,
  luckyDraw
};
