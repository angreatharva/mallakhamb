/**
 * A coach registering a player with no email: blocked until a default player
 * password exists, the sign-in card afterwards, and the same-person check.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coachAPI } from '@/services/api';
import RegisterPlayerDialog, { signInCardText } from './RegisterPlayerDialog';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/api', () => ({
  coachAPI: { playerDefaultPassword: { get: vi.fn() }, registerPlayer: vi.fn(), getProfile: vi.fn() },
}));

const respond = (data, message) => Promise.resolve({ data: { data, message } });
// A plain function, not a vi.fn returning a rejection: Vitest reports a
// rejected promise from a spy as an error even when it is handled.
const duplicateOnce = () => {
  let first = true;
  return (body) => {
    if (first && !body.confirmDuplicate) {
      first = false;
      const error = new Error('Request failed with status code 409');
      error.response = {
        status: 409,
        data: { success: false, error: { message: 'Possible duplicate', details: { reason: 'POSSIBLE_DUPLICATE', matches: [{ loginId: 'aarav.patil.150616', name: 'Aarav Patil', team: 'Other Club' }] } } },
      };
      return Promise.reject(error);
    }
    return respond(CREATED, 'Registered');
  };
};

const tenYearsAgo = () => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 10);
  return d.toISOString().slice(0, 10);
};

const CREATED = {
  player: { _id: 'p1', firstName: 'Aarav', lastName: 'Patil', loginId: 'aarav.patil.150616.2', gender: 'Male', dateOfBirth: tenYearsAgo() },
  team: { _id: 't1', name: 'Shivaji Club' },
};

const renderDialog = (props = {}) => render(
  <MemoryRouter>
    <RegisterPlayerDialog open onClose={vi.fn()} {...props} />
  </MemoryRouter>
);

const fillForm = () => {
  fireEvent.change(screen.getByLabelText(/^First Name/), { target: { value: 'Aarav' } });
  fireEvent.change(screen.getByLabelText(/^Last Name/), { target: { value: 'Patil' } });
  fireEvent.change(screen.getByLabelText(/^Date of Birth/), { target: { value: tenYearsAgo() } });
  fireEvent.change(screen.getByLabelText(/^Gender/), { target: { value: 'Male' } });
};

beforeEach(() => {
  vi.clearAllMocks();
  coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: true, readable: true, password: 'Shivaji2026' }));
  coachAPI.getProfile.mockImplementation(() => respond({ firstName: 'Ravi', lastName: 'Kale', phone: '9123456780' }));
});

describe('RegisterPlayerDialog', () => {
  it('sends the coach to their profile when no default password is set', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: false, readable: false, password: null }));
    renderDialog();
    expect(await screen.findByText('Set your default player password first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to my profile' })).toHaveAttribute('href', '/coach/profile#player-password');
  });

  it('registers the player and shows their sign-in details', async () => {
    coachAPI.registerPlayer.mockImplementation(() => respond(CREATED, 'Registered'));
    const onEnterAgeGroup = vi.fn();
    renderDialog({ onEnterAgeGroup });

    await screen.findByRole('button', { name: 'Register player' });
    fillForm();
    fireEvent.click(await screen.findByLabelText(/has agreed to this registration/));
    fireEvent.click(screen.getByRole('button', { name: 'Register player' }));

    await waitFor(() => expect(coachAPI.registerPlayer).toHaveBeenCalled());
    const body = coachAPI.registerPlayer.mock.calls[0][0];
    expect(body).toMatchObject({ firstName: 'Aarav', lastName: 'Patil', gender: 'Male', guardianConsent: true });
    // The coach is the contact of record; the server fills it in.
    expect(body).not.toHaveProperty('guardian');
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('password');

    expect((await screen.findByTestId('new-player-id')).textContent).toBe('aarav.patil.150616.2');
    expect(screen.getByText('Shivaji2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enter in an age group now' }));
    expect(onEnterAgeGroup).toHaveBeenCalledWith(expect.objectContaining({ _id: 'p1', gender: 'Male' }));
  });

  it('shows the coach as the contact, with no guardian fields to fill', async () => {
    renderDialog();
    expect((await screen.findByTestId('coach-contact')).textContent).toBe('Ravi Kale · Coach · 9123456780');
    expect(screen.queryByLabelText(/Parent\/Guardian Name/)).not.toBeInTheDocument();
  });

  it('blocks registering until the coach adds a phone', async () => {
    coachAPI.getProfile.mockImplementation(() => respond({ firstName: 'Ravi', lastName: 'Kale', phone: null }));
    renderDialog();
    expect(await screen.findByText('Add your phone number first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register player' })).toBeDisabled();
  });

  it('stops at a possible duplicate until the coach says it is someone else', async () => {
    coachAPI.registerPlayer.mockImplementation(duplicateOnce());
    renderDialog();

    await screen.findByRole('button', { name: 'Register player' });
    fillForm();
    fireEvent.click(await screen.findByLabelText(/has agreed to this registration/));
    fireEvent.click(screen.getByRole('button', { name: 'Register player' }));

    expect(await screen.findByText('This player may already be registered')).toBeInTheDocument();
    expect(screen.getByText('aarav.patil.150616')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /register anyway/ }));
    await waitFor(() => expect(coachAPI.registerPlayer).toHaveBeenLastCalledWith(expect.objectContaining({ confirmDuplicate: true })));
    expect(await screen.findByTestId('new-player-id')).toBeInTheDocument();
  });

  it('the download card holds the Player ID and password, nothing more', () => {
    const text = signInCardText(CREATED.player, 'Shivaji2026', 'https://app.example/player/login');
    expect(text).toContain('Player ID: aarav.patil.150616.2');
    expect(text).toContain('Password:  Shivaji2026');
    expect(text).not.toContain('9123456780');
  });
});
