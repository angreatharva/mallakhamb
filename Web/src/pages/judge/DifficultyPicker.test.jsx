/**
 * The Difficulty control as drawn: a 1–10 grid per class plus a vertical
 * − / count / + stepper beside it.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DifficultyPicker } from './judgeShared';

const Harness = ({ initial = 0 }) => {
  const [count, setCount] = useState(initial);
  return <DifficultyPicker cls="B" value={0.40} count={count} onChange={setCount} />;
};

const num = (n) => screen.getByRole('button', { name: `B - Class - 0.40: ${n}` });
const shownCount = () => screen.getByRole('button', { name: 'Increase B - Class - 0.40' })
  .parentElement.querySelector('span').textContent;

describe('DifficultyPicker', () => {
  it('shows the class and its value, and numbers 1 to 10', () => {
    render(<Harness />);
    expect(screen.getByText('B - 0.40')).toBeInTheDocument();
    for (let n = 1; n <= 10; n += 1) expect(num(n)).toBeInTheDocument();
  });

  it('one tap on a number sets the count, and marks it chosen', () => {
    render(<Harness />);
    fireEvent.click(num(6));
    expect(shownCount()).toBe('6');
    expect(num(6)).toHaveAttribute('aria-pressed', 'true');
    expect(num(5)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('6 × 0.40 = 2.40')).toBeInTheDocument();
  });

  it('tapping the chosen number again clears it', () => {
    render(<Harness initial={3} />);
    fireEvent.click(num(3));
    expect(shownCount()).toBe('0');
  });

  it('the stepper goes past 10 and back down to 0, not below', () => {
    render(<Harness initial={10} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase B - Class - 0.40' }));
    expect(shownCount()).toBe('11');
    // 11 is beyond the grid — no number is marked.
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);

    render(<Harness initial={0} />);
    const decrease = screen.getAllByRole('button', { name: 'Decrease B - Class - 0.40' })[1];
    expect(decrease).toBeDisabled();
  });
});
