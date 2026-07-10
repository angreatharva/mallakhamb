import { describe, it, expect } from 'vitest';
import {
  getCombinationChecklist,
  computeCombinationTotal,
  getDifficultyRequirement,
  isApparatusAllowedForGender,
  normalizeApparatus,
  resolveDifficultyValue,
  POINT_CEILINGS,
} from './copRules';

describe('copRules — apparatus combination checklists', () => {
  it('provides the right item count per apparatus (Pole 10 / Hanging 10 / Rope 7)', () => {
    expect(getCombinationChecklist('Pole Mallakhamb')).toHaveLength(10);
    expect(getCombinationChecklist('Hanging Mallakhamb')).toHaveLength(10);
    expect(getCombinationChecklist('Rope Mallakhamb')).toHaveLength(7);
  });

  it('each apparatus checklist penalties sum to the 1.60 combination ceiling', () => {
    for (const app of ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb']) {
      const sum = getCombinationChecklist(app).reduce((s, i) => s + i.penalty, 0);
      expect(Number(sum.toFixed(2))).toBe(POINT_CEILINGS.combination);
    }
  });

  it('normalizes short and long apparatus labels', () => {
    expect(normalizeApparatus('Pole')).toBe('Pole Mallakhamb');
    expect(normalizeApparatus('rope mallakhamb')).toBe('Rope Mallakhamb');
    expect(normalizeApparatus('HANGING')).toBe('Hanging Mallakhamb');
    expect(normalizeApparatus('unknown')).toBeNull();
  });

  it('defaults unknown apparatus to the Pole checklist', () => {
    expect(getCombinationChecklist('nonsense')).toBe(getCombinationChecklist('Pole Mallakhamb'));
  });
});

describe('copRules — computeCombinationTotal', () => {
  it('returns full 1.60 when every requirement is met', () => {
    const checklist = getCombinationChecklist('Pole Mallakhamb');
    const allChecked = Object.fromEntries(checklist.map(i => [i.id, true]));
    expect(computeCombinationTotal('Pole Mallakhamb', allChecked)).toBe(1.60);
  });

  it('subtracts the exact penalty of a single failed item', () => {
    const checklist = getCombinationChecklist('Rope Mallakhamb');
    const checked = Object.fromEntries(checklist.map(i => [i.id, true]));
    // Fail item id 2 (penalty 0.30 for Rope)
    checked[2] = false;
    expect(computeCombinationTotal('Rope Mallakhamb', checked)).toBe(1.30);
  });

  it('never goes below zero and treats missing map entries as failed', () => {
    // Empty map = all items failed = 1.60 - 1.60 = 0.
    expect(computeCombinationTotal('Pole Mallakhamb', {})).toBe(0);
  });
});

describe('copRules — difficulty requirements', () => {
  it('Competition I requires A4/B6/C1', () => {
    expect(getDifficultyRequirement('competition_1')).toEqual({ A: 4, B: 6, C: 1 });
    expect(getDifficultyRequirement('Competition I')).toEqual({ A: 4, B: 6, C: 1 });
  });

  it('Competition II/III require A1/B6/C2', () => {
    expect(getDifficultyRequirement('competition_2')).toEqual({ A: 1, B: 6, C: 2 });
    expect(getDifficultyRequirement('competition_3')).toEqual({ A: 1, B: 6, C: 2 });
  });
});

describe('copRules — gender apparatus rule', () => {
  it('blocks Hanging Mallakhamb for Female competitions', () => {
    expect(isApparatusAllowedForGender('Hanging Mallakhamb', 'Female')).toBe(false);
    expect(isApparatusAllowedForGender('Hanging', 'female')).toBe(false);
  });

  it('allows Pole and Rope for Female, and everything for Male', () => {
    expect(isApparatusAllowedForGender('Pole Mallakhamb', 'Female')).toBe(true);
    expect(isApparatusAllowedForGender('Rope Mallakhamb', 'Female')).toBe(true);
    expect(isApparatusAllowedForGender('Hanging Mallakhamb', 'Male')).toBe(true);
  });
});

describe('copRules — difficulty cascade (v2 §3.2.1)', () => {
  it('cascades excess C to B, excess B to A', () => {
    // Competition I required: A4 B6 C1; executed: A0 B5 C2
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 0, B: 5, C: 2 }, required);
    // C: 1*0.60=0.60, B: (5+1)*0.40=2.40, A: 0 (shortfall)
    expect(result.C).toBe(0.60);
    expect(result.B).toBe(2.40);
    expect(result.A).toBe(0.00);
    expect(result.total).toBe(3.00);
    expect(result.shortfallFlag).toBe(true);
  });

  it('returns full points when mix matches exactly', () => {
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 4, B: 6, C: 1 }, required);
    expect(result.total).toBe(3.80);
    expect(result.shortfallFlag).toBe(false);
  });
});
