/**
 * Folding a category's seats into ONE panel.
 *
 * What this is really guarding: `panelSeats(...).length` is the panel SIZE, and
 * the size picks the averaging method (flat mean at 3, chief-into-the-vacant-
 * slot at 4, drop-high-low at 5). Every way of getting an extra row into that
 * list produces a believable score by the wrong method rather than an error, so
 * each one gets a test.
 */

import { describe, it, expect } from 'vitest';
import { PANEL_TYPES, mirrorChiefSeat, panelSeats, soleApparatus } from './judgePanel';
import { calculateAverageMarks } from './copRules';

const POLE = 'Pole Mallakhamb';
const ROPE = 'Rope Mallakhamb';

/** A staffed seat as `GET .../judges` returns it. */
const seat = (judgeType, apparatus, name = 'Someone') => ({
  _id: `${judgeType}-${apparatus ?? 'any'}`,
  judgeType,
  apparatus,
  name,
  isEmpty: false,
});

const roles = (seats) => seats.map((s) => s.judgeType);

describe('panelSeats', () => {
  it('keeps only the asked-for apparatus when a category holds several panels', () => {
    const rows = [
      seat('Senior Judge', POLE), seat('Judge 1', POLE), seat('Judge 2', POLE),
      seat('Senior Judge', ROPE), seat('Judge 1', ROPE), seat('Judge 2', ROPE),
      seat('Judge 3', ROPE), seat('Judge 4', ROPE),
    ];

    // Three, not eight: the Pole panel is a 3 and the Rope panel is a 5. Folding
    // them together would score every Pole routine by drop-high-low.
    expect(panelSeats(rows, POLE)).toHaveLength(3);
    expect(panelSeats(rows, ROPE)).toHaveLength(5);
  });

  it('counts a role once when a legacy category-wide seat sits beside a named one', () => {
    // What a meet part-way through being re-seated looks like: the server
    // answers an apparatus filter with `{ $in: [apparatus, null, ''] }`, so both
    // rows come back for the same role.
    const rows = [
      seat('Senior Judge', null, 'Old'),
      seat('Senior Judge', POLE, 'New'),
      seat('Judge 1', POLE),
      seat('Judge 2', POLE),
    ];

    const folded = panelSeats(rows, POLE);

    expect(folded).toHaveLength(3);
    // The seat that NAMES the apparatus wins — it was seated deliberately for it.
    expect(folded[0].name).toBe('New');
  });

  it('keeps a legacy seat when nothing named that apparatus', () => {
    const rows = [seat('Senior Judge', null), seat('Judge 1', null), seat('Judge 2', null)];

    expect(panelSeats(rows, ROPE)).toHaveLength(3);
  });

  it('returns the seats in slot order, however the server sorted them', () => {
    const rows = [seat('Judge 2', POLE), seat('Senior Judge', POLE), seat('Judge 1', POLE)];

    expect(roles(panelSeats(rows, POLE))).toEqual(['Senior Judge', 'Judge 1', 'Judge 2']);
  });

  it('drops the Scorer, empty slots and unstaffed rows', () => {
    const rows = [
      seat('Senior Judge', POLE),
      seat('Scorer', POLE), // records, does not evaluate
      { ...seat('Judge 1', POLE), isEmpty: true },
      { ...seat('Judge 2', POLE), name: '  ' },
    ];

    expect(roles(panelSeats(rows, POLE))).toEqual(['Senior Judge']);
  });

  it('folds every apparatus together when none is given, still one per role', () => {
    const rows = [
      seat('Senior Judge', POLE), seat('Judge 1', POLE),
      seat('Senior Judge', ROPE), seat('Judge 1', ROPE), seat('Judge 2', ROPE),
    ];

    // The best a screen showing a mixed-apparatus squad can do: three, which is
    // a panel-shaped number, rather than five, which is a different rule.
    expect(roles(panelSeats(rows))).toEqual(['Senior Judge', 'Judge 1', 'Judge 2']);
  });

  it('survives a missing or non-array list', () => {
    expect(panelSeats(undefined, POLE)).toEqual([]);
    expect(panelSeats(null)).toEqual([]);
    expect(panelSeats({ data: [] })).toEqual([]);
  });
});

describe('mirrorChiefSeat', () => {
  const four = [seat('Senior Judge', POLE, 'Chief'), seat('Judge 1', POLE), seat('Judge 2', POLE), seat('Judge 3', POLE)];

  it('draws a 4-judge panel as five, the last seat the Sr. Judge again', () => {
    const sheet = mirrorChiefSeat(four);

    expect(roles(sheet)).toEqual(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']);
    expect(sheet[4].name).toBe('Chief');
    expect(sheet[4].isChiefCopy).toBe(true);
    // Reads the Sr. Judge's own cell, so there is no second mark to type and
    // the two can never hold different numbers.
    expect(sheet[4].scoreField).toBe('seniorJudge');
  });

  it('gives the copy its own id — two columns keyed alike collapse into one', () => {
    const sheet = mirrorChiefSeat(four);

    expect(sheet[4]._id).not.toBe(sheet[0]._id);
    expect(new Set(sheet.map((s) => s._id)).size).toBe(5);
  });

  it('leaves panels of 3 and 5 exactly as they were', () => {
    const three = [seat('Senior Judge', POLE), seat('Judge 1', POLE), seat('Judge 2', POLE)];
    const five = [...four, seat('Judge 4', POLE)];

    // A 3 has no Chief role and no slot to fill; a 5 has no vacancy.
    expect(mirrorChiefSeat(three)).toBe(three);
    expect(mirrorChiefSeat(five)).toBe(five);
  });

  it('copies nothing when the four seats do not include a Sr. Judge', () => {
    const chiefless = [seat('Judge 1', POLE), seat('Judge 2', POLE), seat('Judge 3', POLE), seat('Judge 4', POLE)];

    expect(mirrorChiefSeat(chiefless)).toBe(chiefless);
  });

  it('survives a missing or non-array list', () => {
    expect(mirrorChiefSeat(undefined)).toEqual([]);
    expect(mirrorChiefSeat(null)).toEqual([]);
  });

  it('shows a column whose mark the 4-judge rule really does use', () => {
    /*
     * The reason the copy exists. The 4-judge rule puts the Chief's mark in the
     * vacant fourth evaluation slot and then runs the 5-judge method unchanged,
     * so the sheet is drawn as the arithmetic already works: the same marks
     * scored as a four and as a five with Judge 4 = the Chief give one number.
     */
    const marks = { seniorJudge: 9.2, judge1: 9.5, judge2: 8.8, judge3: 9.1 };

    const asFour = calculateAverageMarks(marks, 4);
    const asFive = calculateAverageMarks({ ...marks, judge4: marks.seniorJudge }, 5);

    expect(asFour.average).toBe(asFive.average);
    // 9.5 and 8.8 dropped, (9.2 + 9.1) / 2 = 9.15 — the Chief inside the pool.
    expect(asFour.executionAvg).toBeCloseTo(9.15, 2);
  });
});

describe('soleApparatus', () => {
  it('names the apparatus when every row agrees', () => {
    expect(soleApparatus([{ apparatus: POLE }, { apparatus: POLE }])).toBe(POLE);
  });

  it('is null when the rows disagree — there is no one panel to ask for', () => {
    expect(soleApparatus([{ apparatus: POLE }, { apparatus: ROPE }])).toBeNull();
  });

  it('is null when nothing records an apparatus', () => {
    expect(soleApparatus([{ apparatus: null }, {}])).toBeNull();
    expect(soleApparatus([])).toBeNull();
    expect(soleApparatus(undefined)).toBeNull();
  });
});

describe('PANEL_TYPES', () => {
  it('is the five evaluation seats in slot order, and not the Scorer', () => {
    expect(PANEL_TYPES).toEqual(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']);
  });
});
