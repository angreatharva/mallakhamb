/**
 * MED-W5 — COP rules drift detection.
 *
 * The most valuable assertion here is the first one: it feeds the REAL server
 * payload (imported straight from Server/src/config/cop-rules.js) through the
 * comparator and requires the two stacks to agree today. If anyone edits one
 * side's ceilings, element values, difficulty mix, tolerance tiers, time
 * deductions or checklist penalties without the other, this test fails in CI —
 * which is the whole point, because at runtime that drift would silently
 * persist wrong scores rather than error.
 */

import { describe, it, expect } from 'vitest';
import { compareCopRules } from './copRulesSync';

// Reaching across into the server package is deliberate. This is a monorepo and
// the invariant being protected is precisely that these two files agree.
import serverCopRules from '../../../../Server/src/config/cop-rules.js';

const serverPayload = serverCopRules.getCopRulesData();

describe('the two stacks agree on the COP rules', () => {
  it('reports no scoring-relevant drift against the real server tables', () => {
    const result = compareCopRules(serverPayload);

    // Printed on failure so the diff is immediately actionable.
    expect(result.differences).toEqual([]);
    expect(result.inSync).toBe(true);
  });

  it('quotes the same COP wording for every checklist item', () => {
    // Both stacks quote COP §2.3.2 verbatim, so there is one right wording,
    // not two paraphrases. Runtime still treats text-only drift as
    // informational (no score depends on it); CI does not let it land.
    expect(compareCopRules(serverPayload).textDifferences).toEqual([]);
  });
});

describe('the comparator actually detects drift', () => {
  /** Deep clone so a mutation cannot leak into another test. */
  const clone = () => JSON.parse(JSON.stringify(serverPayload));

  it('catches a changed point ceiling', () => {
    const drifted = clone();
    drifted.pointCeilings.execution = 4.50;

    const result = compareCopRules(drifted);
    expect(result.inSync).toBe(false);
    expect(result.differences.join(' ')).toContain('pointCeilings.execution');
  });

  it('catches a changed element class value', () => {
    const drifted = clone();
    drifted.elementClassValues.C = 0.70;

    expect(compareCopRules(drifted).differences.join(' ')).toContain('elementClassValues.C');
  });

  it('catches a changed difficulty mix', () => {
    const drifted = clone();
    drifted.difficultyRequirements.COMPETITION_I.B = 7;

    expect(compareCopRules(drifted).differences.join(' ')).toContain('difficultyRequirements');
  });

  it('catches a changed tolerance tier', () => {
    const drifted = clone();
    drifted.toleranceTiers[0].tolerance = 0.15;

    expect(compareCopRules(drifted).differences.join(' ')).toContain('tolerance at avg');
  });

  it('catches a changed time deduction', () => {
    const drifted = clone();
    drifted.timeDeductionTiers[0].deduction = 0.25;

    expect(compareCopRules(drifted).differences.join(' ')).toContain('timeDeduction at');
  });

  it('catches a changed combination penalty — which silently alters totals', () => {
    const drifted = clone();
    drifted.combinationChecklists['Pole Mallakhamb'][0].penalty = 0.50;

    expect(compareCopRules(drifted).differences.join(' ')).toContain('penalty');
  });

  it('catches a checklist item added or removed on one side only', () => {
    const drifted = clone();
    drifted.combinationChecklists['Pole Mallakhamb'].pop();

    expect(compareCopRules(drifted).differences.join(' ')).toContain('items');
  });

  it('catches a changed COP edition', () => {
    const drifted = clone();
    drifted.edition = 'COP Nov 2030';

    expect(compareCopRules(drifted).differences.join(' ')).toContain('edition');
  });

  it('does NOT fail on a rule-text-only change', () => {
    const drifted = clone();
    drifted.combinationChecklists['Pole Mallakhamb'][0].rule = 'Reworded, same penalty';

    const result = compareCopRules(drifted);
    expect(result.inSync).toBe(true);
    expect(result.textDifferences.length).toBeGreaterThan(0);
  });

  it('treats a missing or malformed payload as not in sync', () => {
    expect(compareCopRules(null).inSync).toBe(false);
    expect(compareCopRules(undefined).inSync).toBe(false);
    expect(compareCopRules('nope').inSync).toBe(false);
  });
});
