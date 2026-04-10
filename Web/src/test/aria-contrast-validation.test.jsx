import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ThemeProvider } from '../components/design-system/theme/ThemeProvider';
import { ThemedInput } from '../components/design-system/forms/ThemedInput';
import { ThemedButton } from '../components/design-system/forms/ThemedButton';
import { DESIGN_TOKENS } from '../styles/tokens';
import { expectContrastAtLeast } from './a11y-utils';

const renderWithTheme = (ui) =>
  render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <ThemeProvider role="admin">{ui}</ThemeProvider>
    </MemoryRouter>
  );

describe('ARIA and contrast validation', () => {
  it('validates ARIA attributes for custom interactive components', () => {
    renderWithTheme(
      <form aria-label="Accessible form">
        <label htmlFor="email-input">Email</label>
        <ThemedInput
          id="email-input"
          type="email"
          error="Email is required"
          aria-describedby="email-hint"
        />
        <span id="email-hint">Use your registered email address</span>
        <ThemedButton aria-label="Submit form">Submit</ThemedButton>
      </form>
    );

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-describedby', 'email-hint');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
    expect(screen.getByRole('button', { name: 'Submit form' })).toBeInTheDocument();
  });

  it('enforces WCAG contrast ratios for key token combinations', () => {
    const bg = DESIGN_TOKENS.colors.surfaces.dark;
    const normalText = DESIGN_TOKENS.colors.text.primary;
    const largeText = DESIGN_TOKENS.colors.roles.admin;

    expectContrastAtLeast(normalText, bg, 4.5);
    expectContrastAtLeast(largeText, bg, 3);
  });
});
