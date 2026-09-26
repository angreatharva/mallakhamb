import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecimalInput } from './judgeShared';
import { roundExecution } from '@/utils/scoring/copRules';

// Mirrors the Execution field: rounded to 0.1 (half down) and clamped to 4.40.
const Execution = ({ initial = 0 }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DecimalInput
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
