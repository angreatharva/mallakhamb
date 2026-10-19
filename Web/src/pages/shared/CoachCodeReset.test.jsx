/**
 * A no-email player's reset with the code their coach was given.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ reset: vi.fn(), failWith: null }));
// A failure goes through a plain function, not the spy: Vitest reports a
// rejected promise RETURNED by a spy as an error of the test, even when the
// component handles it (it tracks the spy's settled results).
vi.mock('@/services/api', () => ({
  authAPI: {
    resetWithCoachCode: (...args) => {
      h.reset(...args);
      return h.failWith ? Promise.reject(h.failWith) : Promise.resolve({ data: { success: true } });
    },
  },
}));

import CoachCodeReset from './CoachCodeReset';

const fill = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

beforeEach(() => { h.reset.mockReset(); h.failWith = null; });

describe('CoachCodeReset', () => {
  it('sends the Player ID (lower-cased), the code and the new password', async () => {
    render(<MemoryRouter><CoachCodeReset /></MemoryRouter>);
    fill('coach-reset-identifier', 'Aarav.Patil.150616');
    fill('coach-reset-code', '482913');
    fill('coach-reset-password', 'NewPassword9');
    fill('coach-reset-confirmPassword', 'NewPassword9');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => expect(h.reset).toHaveBeenCalledWith('aarav.patil.150616', '482913', 'NewPassword9'));
    expect(await screen.findByText(/taking you to sign in/i)).toBeInTheDocument();
  });

  it('shows the server’s one message when the code is wrong', async () => {
    h.failWith = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { message: 'That Player ID and code do not match an approved reset.' } },
    });
    render(<MemoryRouter><CoachCodeReset /></MemoryRouter>);
    fill('coach-reset-identifier', 'aarav.patil.150616');
    fill('coach-reset-code', '000000');
    fill('coach-reset-password', 'NewPassword9');
    fill('coach-reset-confirmPassword', 'NewPassword9');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match an approved reset/i);
  });

  it('checks the code is six digits before sending', async () => {
    render(<MemoryRouter><CoachCodeReset /></MemoryRouter>);
    fill('coach-reset-identifier', 'aarav.patil.150616');
    fill('coach-reset-code', '12');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(await screen.findByText('The code is 6 digits')).toBeInTheDocument();
    expect(h.reset).not.toHaveBeenCalled();
  });
});
