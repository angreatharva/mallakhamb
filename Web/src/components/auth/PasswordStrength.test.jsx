/**
 * The two password policies the shared meter now carries as props: admin
 * accounts (AdminRegister) need 12 characters and score length at 12/16;
 * player accounts (AddPlayerForm) need 8 and score at 8/12. A refactor that
 * lost either would quietly loosen or tighten an account rule.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordRequirements, PasswordStrengthIndicator } from './PasswordStrength';

describe('password policy, per form', () => {
  it('player form (defaults): 8 characters', () => {
    render(<PasswordRequirements password="Abcdefg1" />);
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
  });

  it('admin form: 12 characters', () => {
    render(<PasswordRequirements password="Abcdefg1" minLength={12} />);
    expect(screen.getByText('At least 12 characters')).toBeInTheDocument();
  });

  it('scores length against each form\'s own steps', () => {
    // 10 chars, mixed case, a digit, a symbol: player 8/12 -> 4 (Strong); admin 12/16 -> 3 (Good).
    const { unmount } = render(<PasswordStrengthIndicator password="Abcdefgh1!" />);
    expect(screen.getByText('Password strength: Strong')).toBeInTheDocument();
    unmount();
    render(<PasswordStrengthIndicator password="Abcdefgh1!" minLength={12} strongLength={16} />);
    expect(screen.getByText('Password strength: Good')).toBeInTheDocument();
  });

  it('shows nothing until something is typed', () => {
    const { container } = render(<PasswordStrengthIndicator password="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
