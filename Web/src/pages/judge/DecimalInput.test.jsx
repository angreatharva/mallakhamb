import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecimalInput } from './judgeShared';
import { roundExecution } from '@/utils/scoring/copRules';

// Mirrors the Execution field: rounded to 0.1 (half down) and clamped to 4.40.
const Execution = ({ initial = 0, impliedDecimal = false }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DecimalInput
        impliedDecimal={impliedDecimal}
        value={value}
        onValueChange={(raw) => setValue(roundExecution(raw))}
      />
      <output data-testid="kept">{value}</output>
    </>
  );
};

const field = () => screen.getByPlaceholderText('0.00');

describe('DecimalInput', () => {
  it('shows the placeholder, not a literal 0, when the mark is 0', () => {
    render(<Execution />);
    expect(field()).toHaveValue('');
  });

  it('never shows a leading zero', async () => {
    render(<Execution />);
    await userEvent.type(field(), '03');
    expect(field()).toHaveValue('3');
    expect(screen.getByTestId('kept')).toHaveTextContent('3');
  });

  it('keeps the zero in front of a decimal point', async () => {
    render(<Execution />);
    await userEvent.type(field(), '0.5');
    expect(field()).toHaveValue('0.5');
    expect(screen.getByTestId('kept')).toHaveTextContent('0.5');
  });

  it('shows what the parent kept after clamping', async () => {
    render(<Execution />);
    await userEvent.type(field(), '5');
    expect(field()).toHaveValue('4.4');
  });

  it('snaps to the rounded mark on blur', async () => {
    render(<Execution initial={3} />);
    await userEvent.type(field(), '.02');
    await userEvent.tab();
    expect(field()).toHaveValue('3');
  });

  it('rounds x.x5 down and x.x6 up', async () => {
    render(<Execution />);
    await userEvent.type(field(), '2.05');
    await userEvent.tab();
    expect(field()).toHaveValue('2');
    await userEvent.clear(field());
    await userEvent.type(field(), '2.06');
    expect(field()).toHaveValue('2.1');
    expect(screen.getByTestId('kept')).toHaveTextContent('2.1');
  });

  it('ignores letters', async () => {
    render(<Execution />);
    await userEvent.type(field(), '2a');
    expect(field()).toHaveValue('2');
  });
});

describe('DecimalInput — Execution typed without the point (user rule 2026-11-15)', () => {
  const kept = () => screen.getByTestId('kept');

  it.each([
    ['220', '2.2'],
    ['010', '0.1'],
    ['440', '4.4'],
    ['30', '3'],
    ['385', '3.8'],
  ])('%s keeps %s', async (typed, mark) => {
    render(<Execution impliedDecimal />);
    await userEvent.type(field(), typed);
    expect(kept()).toHaveTextContent(mark);
  });

  it('keeps every digit on screen while typing 220, then shows the mark on blur', async () => {
    render(<Execution impliedDecimal />);
    await userEvent.type(field(), '220');
    expect(field()).toHaveValue('220');
    await userEvent.tab();
    expect(field()).toHaveValue('2.2');
  });

  it('still takes the point the old way: 2.20 and a single digit 3', async () => {
    render(<Execution impliedDecimal />);
    await userEvent.type(field(), '2.20');
    expect(kept()).toHaveTextContent('2.2');
    await userEvent.clear(field());
    await userEvent.type(field(), '3');
    expect(kept()).toHaveTextContent('3');
  });

  it('keeps the existing limits: 450 clamps to 4.40, 015 rounds half down to 0.10', async () => {
    render(<Execution impliedDecimal />);
    await userEvent.type(field(), '450');
    expect(kept()).toHaveTextContent('4.4');
    await userEvent.clear(field());
    await userEvent.type(field(), '015');
    expect(kept()).toHaveTextContent('0.1');
  });

  it('ignores a 4th digit without a point', async () => {
    render(<Execution impliedDecimal />);
    await userEvent.type(field(), '2205');
    expect(field()).toHaveValue('220');
    expect(kept()).toHaveTextContent('2.2');
  });
});
