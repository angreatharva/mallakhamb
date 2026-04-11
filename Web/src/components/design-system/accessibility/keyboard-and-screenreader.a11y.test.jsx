import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemedButton } from '../forms/ThemedButton';
import { ThemedInput } from '../forms/ThemedInput';
import { ThemedSelect } from '../forms/ThemedSelect';
import { LiveRegion } from './LiveRegion';
import { testKeyboardNav } from '../../../test/a11y-utils';

const renderWithTheme = (ui) =>
  render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <ThemeProvider role="admin">{ui}</ThemeProvider>
    </MemoryRouter>
  );

describe('Keyboard navigation and screen reader tests', () => {
  it('tabs through interactive controls in logical order', async () => {
    renderWithTheme(
      <form aria-label="Keyboard test form">
        <label htmlFor="email">Email</label>
        <ThemedInput id="email" />
        <label htmlFor="role">Role</label>
        <ThemedSelect id="role" options={[{ value: 'coach', label: 'Coach' }]} />
        <ThemedButton type="submit">Submit</ThemedButton>
      </form>
    );

    await testKeyboardNav([
      screen.getByLabelText('Email'),
      screen.getByLabelText('Role'),
      screen.getByRole('button', { name: 'Submit' }),
    ]);
  });

  it('announces dynamic content through ARIA live regions', async () => {
    const { rerender } = renderWithTheme(<LiveRegion role="status">Loading scores</LiveRegion>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading scores');

    rerender(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <ThemeProvider role="admin">
          <LiveRegion role="status">Scores updated successfully</LiveRegion>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toHaveTextContent('Scores updated successfully');
  });

  it('keeps focus trapped inside modal dialog controls', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">Confirm action</h2>
        <ThemedButton>Cancel</ThemedButton>
        <ThemedButton>Confirm</ThemedButton>
      </div>
    );

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });

    cancelButton.focus();
    expect(cancelButton).toHaveFocus();

    await user.tab();
    expect(confirmButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(cancelButton).toHaveFocus();
  });
});
