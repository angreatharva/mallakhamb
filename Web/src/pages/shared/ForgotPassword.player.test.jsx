/**
 * Forgot password on the player portal: a Player ID is accepted, and after
 * sending the player picks where their code came from (email, or their coach
 * for an account with no email) instead of being sent to the email-code page.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ forgot: vi.fn() }));
vi.mock('@/services/api', () => ({
  authAPI: { forgotPassword: (...args) => { h.forgot(...args); return Promise.resolve({ data: { success: true } }); } },
}));

import ForgotPassword from './ForgotPassword';

beforeEach(() => h.forgot.mockReset());

describe('ForgotPassword (player)', () => {
  it('takes a Player ID and offers both ways to finish', async () => {
    render(<MemoryRouter initialEntries={['/forgot-password?role=player']}><ForgotPassword /></MemoryRouter>);
    fireEvent.change(document.getElementById('email'), { target: { value: 'Aarav.Patil.150616' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => expect(h.forgot).toHaveBeenCalledWith('aarav.patil.150616', 'player'));
    expect(await screen.findByRole('link', { name: /i got a code by email/i })).toHaveAttribute('href', '/reset-password?role=player');
    expect(screen.getByRole('link', { name: /my coach gave me a code/i })).toHaveAttribute('href', '/reset-password/coach');
  });
});
