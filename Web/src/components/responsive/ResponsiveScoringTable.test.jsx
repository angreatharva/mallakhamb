/**
 * The Scorer's sheet, drawn for each panel size.
 *
 * What this is really guarding: a 4-judge panel is SCORED as a five — the Sr.
 * Judge's mark fills the vacant fourth evaluation slot — and the sheet now says
 * so, with a fifth column holding the Sr. Judge again. Two things can go wrong
 * there and neither fails loudly:
 *
 *   - the copy stops mirroring, and the sheet shows two marks for one judge;
 *   - the extra COLUMN gets counted as an extra SEAT, `judges.length` reads 5,
 *     and a panel of four is averaged by the 5-judge rule over three real
 *     evaluation marks. That is a believable number by the wrong method, which
 *     is the worst shape a scoring bug can take — so the average is asserted
 *     against the value only the 4-judge rule produces.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const responsive = vi.hoisted(() => ({ isMobile: false }));

vi.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => ({
    viewport: { width: 1440, height: 900, category: 'desktop' },
    isMobile: responsive.isMobile,
    isTablet: false,
    isDesktop: !responsive.isMobile,
  }),
}));

import { ResponsiveScoringTable } from './ResponsiveTable';
import { mirrorChiefSeat } from '@/utils/scoring/judgePanel';
import { calculateAverageMarks } from '@/utils/scoring/copRules';

const seat = (judgeType, name) => ({ _id: judgeType, judgeType, name });

const FOUR = [
  seat('Senior Judge', 'Ravi Gaikwad'),
  seat('Judge 1', 'Vinayak Dhamne'),
  seat('Judge 2', 'Yatin Nachre'),
  seat('Judge 3', 'Laxman Shinde'),
];
const FIVE = [...FOUR, seat('Judge 4', 'Suraj Turte')];

const PLAYER = { id: 'a1::pole', playerId: 'a1', name: 'Atharva Angre', teamName: 'SGAM-A' };

/** One athlete's row, as the Scorer has typed it in. */
const MARKS = {
  time: '1:20',
  seniorJudge: '9.2',
  judge1: '9.5',
  judge2: '8.8',
  judge3: '9.1',
  judge4: '',
  deduction: '',
  otherDeduction: '',
};

const sheet = (seats, marks = MARKS) => render(
  <ResponsiveScoringTable
    players={[PLAYER]}
    scores={{ [PLAYER.id]: marks }}
    judges={mirrorChiefSeat(seats)}
    panelSize={seats.length}
    onScoreChange={() => {}}
  />
);

/** A row's inputs: [time, one per judge column, deduction, other deduction]. */
const cells = (container) => [...container.querySelectorAll('input')];

beforeEach(() => {
  responsive.isMobile = false;
});

describe('the Scorer sheet for a 4-judge panel', () => {
  it('draws five judge columns, the last of them the Sr. Judge again', () => {
    const { container } = sheet(FOUR);

    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    const judgeHeaders = headers.filter((h) => h.includes('Judge'));

    expect(judgeHeaders).toHaveLength(5);
    expect(judgeHeaders[4]).toContain('Judge 4');
    // Headed with the Chief's own name, and told plainly whose mark it is —
    // nobody should read the fifth column as a fifth person.
    expect(judgeHeaders[4]).toContain('Ravi Gaikwad');
    expect(judgeHeaders[4]).toMatch(/Senior Judge.s mark/);
  });

  it('shows the Sr. Judge’s mark in Judge 4, and will not let it be typed twice', () => {
    const { container } = sheet(FOUR);
    const inputs = cells(container);

    // time + five judge columns + two deductions
    expect(inputs).toHaveLength(8);
    expect(inputs[1].value).toBe('9.2');   // Senior Judge, typed here
    expect(inputs[1].disabled).toBe(false);
    expect(inputs[5].value).toBe('9.2');   // Judge 4, the same cell mirrored
    expect(inputs[5].disabled).toBe(true);
  });

  it('averages by the 4-judge rule, not by the number of columns', () => {
    /*
     * The whole point. 9.5 and 8.8 are dropped and (9.2 + 9.1) / 2 = 9.15 — the
     * Chief inside the pool. Counting the copy as a seat would take panelSize
     * to 5 with only three evaluation marks entered, giving the median 9.10.
     */
    const { container } = sheet(FOUR);
    const byFour = calculateAverageMarks(MARKS, 4).average.toFixed(2);

    expect(byFour).toBe('9.15');
    expect(calculateAverageMarks(MARKS, 5).average.toFixed(2)).toBe('9.10');
    expect(container.textContent).toContain('9.15');
    expect(container.textContent).not.toContain('9.10');
  });

  it('reads the same on a phone', () => {
    responsive.isMobile = true;
    const { container } = sheet(FOUR);

    const inputs = cells(container);
    expect(inputs).toHaveLength(8);
    expect(inputs[5].value).toBe('9.2');
    expect(inputs[5].disabled).toBe(true);
    expect(screen.getByText(/Senior Judge.s mark/)).toBeTruthy();
  });
});

describe('the sheet fits the card', () => {
  /*
   * jsdom computes no layout, so what is asserted here is the mechanism rather
   * than the pixels: a table that divides the width it HAS, and inputs that
   * fill their cell. Measured in a real browser at 1024px with a 5-column
   * panel, that took the sheet from 1156px in an 837px card — the Scorer had
   * to drag sideways to reach the deductions — to no overflow at all.
   */
  it('sizes its columns from the space available, not from its contents', () => {
    const { container } = sheet(FOUR);
    const table = container.querySelector('table');

    expect(table.style.tableLayout).toBe('fixed');
    expect(table.style.width).toBe('100%');
    // Nothing may insist on a width the column cannot give it.
    expect(cells(container).map((input) => input.style.width)).toEqual(Array(8).fill('100%'));
  });

  it('leaves the phone cards on their fixed-width fields', () => {
    // There the field sits opposite its label with room to spare, and a
    // full-width input would push the label off its own row.
    responsive.isMobile = true;
    const { container } = sheet(FOUR);

    expect(container.querySelector('table')).toBeNull();
    expect(cells(container).map((input) => input.style.width)).toEqual(Array(8).fill('80px'));
  });
});

describe('the Scorer sheet for the other panel sizes', () => {
  it('leaves a 5-judge panel alone — five real seats, all of them typable', () => {
    const { container } = sheet(FIVE, { ...MARKS, judge4: '9.3' });
    const inputs = cells(container);

    expect(inputs).toHaveLength(8);
    expect(inputs[5].value).toBe('9.3');
    expect(inputs[5].disabled).toBe(false);
    expect(container.textContent).toContain('Suraj Turte');
    expect(container.textContent).not.toMatch(/Senior Judge.s mark/);
  });

  it('leaves a 3-judge panel at three columns — no Chief, nothing to copy', () => {
    const { container } = sheet(FOUR.slice(0, 3));
    const inputs = cells(container);

    expect(inputs).toHaveLength(6);
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)
      .filter((h) => h.includes('Judge'))).toHaveLength(3);
  });
});

// Native number inputs carry spinner arrows and change value under the mouse
// wheel, so a scorer scrolling the sheet altered marks. Every cell is text.
describe('mark cells are plain number-only text fields', () => {
  it.each([false, true])('has no native number input (mobile: %s)', (isMobile) => {
    responsive.isMobile = isMobile;
    const { container } = sheet(FIVE);
    expect(container.querySelector('input[type="number"]')).toBeNull();
    const marks = cells(container).filter((el) => el.getAttribute('inputmode') === 'decimal');
    // five judge marks, deduction, other deduction
    expect(marks).toHaveLength(7);
  });

  it('passes digits and a point, drops a leading zero, and refuses anything else', () => {
    const onScoreChange = vi.fn();
    const { container } = render(
      <ResponsiveScoringTable
        players={[PLAYER]}
        scores={{ [PLAYER.id]: { ...MARKS, judge1: '' } }}
        judges={FIVE}
        panelSize={5}
        onScoreChange={onScoreChange}
      />
    );
    const judge1 = cells(container)[2];

    fireEvent.change(judge1, { target: { value: '8.5' } });
    expect(onScoreChange).toHaveBeenLastCalledWith(PLAYER.id, 'judge1', '8.5');

    fireEvent.change(judge1, { target: { value: '03' } });
    expect(onScoreChange).toHaveBeenLastCalledWith(PLAYER.id, 'judge1', '3');

    fireEvent.change(judge1, { target: { value: '8,5' } });
    expect(onScoreChange).toHaveBeenLastCalledWith(PLAYER.id, 'judge1', '8.5');

    onScoreChange.mockClear();
    fireEvent.change(judge1, { target: { value: '8e1' } });
    fireEvent.change(judge1, { target: { value: '-1' } });
    fireEvent.change(judge1, { target: { value: '8.5.1' } });
    expect(onScoreChange).not.toHaveBeenCalled();
  });

  it('leaves the time cell as free text', () => {
    const onScoreChange = vi.fn();
    const { container } = render(
      <ResponsiveScoringTable
        players={[PLAYER]}
        scores={{ [PLAYER.id]: MARKS }}
        judges={FIVE}
        panelSize={5}
        onScoreChange={onScoreChange}
      />
    );
    fireEvent.change(cells(container)[0], { target: { value: '1:35' } });
    expect(onScoreChange).toHaveBeenLastCalledWith(PLAYER.id, 'time', '1:35');
  });
});
