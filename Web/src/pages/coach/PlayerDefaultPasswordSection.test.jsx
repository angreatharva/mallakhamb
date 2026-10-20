/**
 * The coach's default player password on their profile: readable on purpose
 * (they hand it out), hidden until asked, and changed only with the coach's
 * own password.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coachAPI } from '@/services/api';
import PlayerDefaultPasswordSection from './PlayerDefaultPasswordSection';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/api', () => ({
  coachAPI: { playerDefaultPassword: { get: vi.fn(), set: vi.fn() } },
}));

const respond = (data, message) => Promise.resolve({ data: { data, message } });

beforeEach(() => vi.clearAllMocks());

describe('PlayerDefaultPasswordSection', () => {
  it('shows the saved default hidden, and reveals it on Show', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: true, readable: true, password: 'Shivaji2026', setAt: '2026-10-20T08:00:00Z' }));
    render(<PlayerDefaultPasswordSection />);

    const value = await screen.findByTestId('player-default-password');
    expect(value.textContent).not.toContain('Shivaji2026');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(value.textContent).toBe('Shivaji2026');
  });

  it('asks for one when none is set, and saves it with the coach password', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: false, readable: false, password: null }));
    coachAPI.playerDefaultPassword.set.mockImplementation(() => respond({ isSet: true, readable: true, password: 'Shivaji2026', setAt: '2026-10-20T08:00:00Z' }, 'Saved'));
    render(<PlayerDefaultPasswordSection />);

    expect(await screen.findByText('Not set yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Default password/), { target: { value: 'Shivaji2026' } });
    fireEvent.change(screen.getByLabelText(/^Confirm default password/), { target: { value: 'Shivaji2026' } });
    fireEvent.change(screen.getByLabelText(/^Your current password/), { target: { value: 'CoachPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save default password' }));

    await waitFor(() => expect(coachAPI.playerDefaultPassword.set).toHaveBeenCalledWith('Shivaji2026', 'CoachPass1'));
    expect((await screen.findByTestId('player-default-password')).textContent).toBe('Shivaji2026');
  });

  it('refuses a weak default before calling the server', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: false, readable: false, password: null }));
    render(<PlayerDefaultPasswordSection />);

    await screen.findByText('Not set yet');
    fireEvent.change(screen.getByLabelText(/^Default password/), { target: { value: 'weak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save default password' }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(coachAPI.playerDefaultPassword.set).not.toHaveBeenCalled();
  });

  it('says to set it again when the saved one cannot be read', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: true, readable: false, password: null }));
    render(<PlayerDefaultPasswordSection />);
    expect(await screen.findByText('Set it again')).toBeInTheDocument();
  });
});
