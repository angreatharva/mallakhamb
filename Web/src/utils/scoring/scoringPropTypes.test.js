/**
 * LOW-W2 — the scoring prop contracts.
 *
 * PropTypes that nobody verifies are decoration. These assert the declarations
 * actually reject the shapes that matter, using PropTypes.checkPropTypes, which
 * is the same path React takes when rendering in development.
 *
 * The shapes mirror what `normalizeBreakdown` (pages/judge/judgeShared.jsx)
 * produces. If these ever disagree, that function is the source of truth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PropTypes from 'prop-types';
import {
  breakdownShape,
  panelScoresShape,
  checklistItemShape,
  pointCeilingsShape,
} from './scoringPropTypes';

/** Capture the console.error PropTypes writes on a violation. */
function check(shape, value, name = 'breakdown') {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  // PropTypes caches by message, so vary the component name per call.
  PropTypes.checkPropTypes(
    { [name]: shape },
    { [name]: value },
    'prop',
    `Test_${Math.random().toString(36).slice(2)}`
  );
  const messages = spy.mock.calls.map((c) => String(c[0])).join('\n');
  spy.mockRestore();
  return messages;
}

const validBreakdown = {
  difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
  combination: { total: 1.6, checked: { 1: true, 2: false } },
  execution: 3.1,
  bonus: 0.2,
  detailed: true,
};

describe('breakdownShape', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('accepts a real slip breakdown', () => {
    expect(check(breakdownShape, validBreakdown)).toBe('');
  });

  it('accepts a totals-only breakdown (detailed: false)', () => {
    // slipToBreakdown produces this when only section totals were persisted.
    expect(check(breakdownShape, {
      difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 3.8 },
      combination: { total: 1.6, checked: {} },
      execution: 3.1,
      bonus: 0,
      detailed: false,
    })).toBe('');
  });

  it('rejects a string where a section total should be a number', () => {
    // The failure this guards: a total arriving as "3.8" from a form input
    // renders fine but breaks arithmetic downstream.
    const msg = check(breakdownShape, {
      ...validBreakdown,
      difficulty: { ...validBreakdown.difficulty, total: '3.8' },
    });
    expect(msg).toMatch(/difficulty/);
  });

  it('rejects a non-numeric execution score', () => {
    expect(check(breakdownShape, { ...validBreakdown, execution: '3.1' })).toMatch(/execution/);
  });

  it('rejects a combination checklist that is not keyed by booleans', () => {
    const msg = check(breakdownShape, {
      ...validBreakdown,
      combination: { total: 1.6, checked: { 1: 'yes' } },
    });
    expect(msg).toMatch(/combination/);
  });
});

describe('panelScoresShape', () => {
  it('accepts a live panel feed keyed by judgeType', () => {
    expect(check(panelScoresShape, {
      'Senior Judge': { judgeType: 'Senior Judge', score: 8.2, breakdown: validBreakdown },
      'Judge 1': { judgeType: 'Judge 1', score: 8.1, breakdown: validBreakdown },
    }, 'panelScores')).toBe('');
  });

  it('rejects a score submitted as a string', () => {
    const msg = check(panelScoresShape, {
      'Judge 1': { judgeType: 'Judge 1', score: '8.1' },
    }, 'panelScores');
    expect(msg).toMatch(/panelScores/);
  });
});

describe('checklistItemShape', () => {
  it('requires id, rule and penalty — penalty decides the score', () => {
    expect(check(checklistItemShape, { id: 1, rule: 'All parts utilized', penalty: 0.1 }, 'item')).toBe('');
    expect(check(checklistItemShape, { id: 1, rule: 'x' }, 'item')).toMatch(/penalty/);
    expect(check(checklistItemShape, { rule: 'x', penalty: 0.1 }, 'item')).toMatch(/id/);
  });
});

describe('pointCeilingsShape', () => {
  it('accepts the COP ceilings', () => {
    expect(check(pointCeilingsShape, {
      difficulty: 3.8, combination: 1.6, execution: 4.4, bonus: 0.2, total: 10,
    }, 'ceilings')).toBe('');
  });
});
