/**
 * Player registration's three paths: the choice screen, the form each choice
 * leads to, guardian consent for a minor, and the Player ID screen that waits
 * for the player before moving on.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  auth: { user: null, userType: null },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login: h.login, user: h.auth.user, userType: h.auth.userType }),
}));
vi.mock('@/services/api', () => ({ playerAPI: { register: h.register }, coachAPI: {} }));
vi.mock('@/services/public/judge.api', () => ({ judgeAPI: {} }));
vi.mock('@/utils/auth/secureStorage', () => ({ secureStorage: { setItem: vi.fn(), getItem: vi.fn() } }));

import UnifiedRegister from './UnifiedRegister';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/player/register" element={<UnifiedRegister />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>
);

const fill = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

const fillCommon = ({ dateOfBirth = '2016-06-15' } = {}) => {
  fill('player-reg-firstName', 'Aarav');
  fill('player-reg-lastName', 'Patil');
  fill('player-reg-dateOfBirth', dateOfBirth);
  fill('player-reg-gender', 'Male');
  fill('player-reg-password', 'CorrectHorse1');
  fill('player-reg-confirmPassword', 'CorrectHorse1');
};

const fillGuardian = () => {
  fill('player-reg-guardian-name', 'Sunita Patil');
  fill('player-reg-guardian-relation', 'Mother');
  fill('player-reg-guardian-phone', '9876543210');
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: /create account/i }));

beforeEach(() => {
  h.register.mockReset();
  h.login.mockReset();
  h.auth = { user: null, userType: null };
  h.register.mockImplementation(async (data) => ({
    data: { data: { token: 't', user: { firstName: 'Aarav', lastName: 'Patil', loginId: 'aarav.patil.150616', emailType: data.emailType } } },
  }));
});

describe('player registration', () => {
  it('asks first whose email the player will use', () => {
    renderAt('/player/register');
    expect(screen.getByRole('link', { name: /my own email/i })).toHaveAttribute('href', '/player/register?with=own');
    expect(screen.getByRole('link', { name: /parent's or guardian's email/i })).toHaveAttribute('href', '/player/register?with=guardian');
    expect(screen.getByRole('link', { name: /no email at all/i })).toHaveAttribute('href', '/player/register?with=none');
    expect(screen.queryByRole('button', { name: /create account/i })).toBeNull();
  });

  it('own email: the form as before, with email and phone', () => {
    renderAt('/player/register?with=own');
    expect(document.getElementById('player-reg-email')).not.toBeNull();
    expect(document.getElementById('player-reg-phone')).not.toBeNull();
    expect(document.getElementById('player-reg-guardian-name')).toBeNull();
  });

  it("guardian's email: the guardian's details instead of the player's phone", () => {
    renderAt('/player/register?with=guardian');
    expect(screen.getByLabelText(/parent's or guardian's email/i)).toBeInTheDocument();
    expect(document.getElementById('player-reg-guardian-name')).not.toBeNull();
    expect(document.getElementById('player-reg-phone')).toBeNull();
  });

  it('no email: no email field at all', () => {
    renderAt('/player/register?with=none');
    expect(document.getElementById('player-reg-email')).toBeNull();
    expect(document.getElementById('player-reg-guardian-phone')).not.toBeNull();
  });

  it('a minor cannot register until a guardian consents', async () => {
    renderAt('/player/register?with=none');
    fillCommon();
    fillGuardian();
    submit();
    expect(await screen.findByText(/parent or guardian must agree/i)).toBeInTheDocument();
    expect(h.register).not.toHaveBeenCalled();
  });

  it('an adult sees no consent tick', () => {
    renderAt('/player/register?with=own');
    fillCommon({ dateOfBirth: '1995-01-01' });
    expect(document.getElementById('player-reg-guardianConsent')).toBeNull();
  });

  it('sends the choice, drops the email for none, and shows the Player ID before moving on', async () => {
    renderAt('/player/register?with=none');
    fillCommon();
    fillGuardian();
    fireEvent.click(document.getElementById('player-reg-guardianConsent'));
    submit();

    expect(await screen.findByRole('heading', { name: 'Your Player ID' })).toBeInTheDocument();
    const sent = h.register.mock.calls[0][0];
    expect(sent).toMatchObject({
      emailType: 'none',
      guardianConsent: true,
      guardian: { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' },
    });
    expect(sent).not.toHaveProperty('email');
    expect(screen.getByText('aarav.patil.150616')).toBeInTheDocument();
    expect(screen.getByText(/write it down now/i)).toBeInTheDocument();

    // Signed in already, but the screen waits for the player.
    expect(h.login).toHaveBeenCalled();
    expect(screen.queryByTestId('where')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/player/select-level'));
  });
});
