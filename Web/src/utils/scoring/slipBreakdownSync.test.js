/**
 * The two stacks average a performance's judge slips the same way.
 *
 * The public results board renders the D / C / E breakdown with
 * `averageSlipBreakdown` here; the profile Stats graphs get it from the
 * server's twin (Server/src/utils/scoring/slip-breakdown.util.js). An athlete
 * must never see one Execution on the results page and another on their own
 * graph, so both are fed the same panels and must agree.
 */
import { describe, expect, it } from 'vitest';
import { averageSlipBreakdown } from './copRules';
// Reaching into the server package is deliberate, as copRulesSync.test.js does.
import serverSlips from '../../../../Server/src/utils/scoring/slip-breakdown.util.js';

const slip = (judgeRole, d, c, e, bonus = 0) => ({
  judgeRole, difficultyScore: d, combinationScore: c, executionScore: e, bonusScore: bonus, total: d + c + e + bonus,
});

const PANELS = {
  'three judges': [[slip('SR_JUDGE', 3, 1.6, 3), slip('J1', 3.2, 1.4, 3.1), slip('J2', 3.4, 1.6, 3.2)], 3],
  'four judges': [[slip('SR_JUDGE', 3.3, 1.6, 3.3), slip('J1', 3, 1.6, 3), slip('J2', 3.2, 1.6, 3.2), slip('J3', 3.8, 1.6, 4)], 4],
  'five judges': [[slip('SR_JUDGE', 1, 1, 1), slip('J1', 3, 1.6, 3), slip('J2', 3.2, 1.6, 3.2, 0.2), slip('J3', 3.4, 1.4, 3.4), slip('J4', 3.8, 1.6, 4)], 5],
  'five judges with tied totals': [[slip('SR_JUDGE', 3, 1.6, 3), slip('J1', 3, 1.6, 3), slip('J2', 3, 1.6, 3), slip('J3', 3.2, 1.4, 3), slip('J4', 3, 1.6, 3)], 5],
  'size inferred from the slips': [[slip('SR_JUDGE', 3, 1.6, 3), slip('J1', 3.2, 1.4, 3.1)], undefined],
  'a stray non-panel role': [[slip('CHIEF', 9, 9, 9), slip('SR_JUDGE', 3, 1.6, 3), slip('J1', 3.2, 1.4, 3.1), slip('J2', 3.4, 1.6, 3.2)], 3],
};

describe('the two stacks agree on the published slip breakdown', () => {
  for (const [name, [slips, size]] of Object.entries(PANELS)) {
    it(name, () => {
      const web = averageSlipBreakdown(slips, size);
      const server = serverSlips.averageSlipBreakdown(slips, size);
      for (const key of ['difficulty', 'combination', 'execution', 'bonus']) {
        expect(server[key]).toBeCloseTo(web[key], 9);
      }
      expect(server.used).toBe(web.used);
      expect(server.panelSize).toBe(web.panelSize);
    });
  }

  it('both answer null for no slips', () => {
    expect(averageSlipBreakdown([], 3)).toBeNull();
    expect(serverSlips.averageSlipBreakdown([], 3)).toBeNull();
  });
});
