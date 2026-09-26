import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecimalInput } from './judgeShared';

// Mirrors the Execution field: rounded to 0.05 and clamped to 4.40.
const Execution = ({ initial = 0 }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DecimalInput
        value={value}
        onValueChange={(raw) => setValue(Math.max(0, Math.min(4.4, Math.round(raw * 20) / 20)))}
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

  it('ignores letters', async () => {
    render(<Execution />);
    await userEvent.type(field(), '2a');
    expect(field()).toHaveValue('2');
  });
});
