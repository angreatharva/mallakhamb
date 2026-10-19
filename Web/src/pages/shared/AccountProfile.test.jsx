/**
 * The account page behind the top-right menu: the right fields for the role,
 * the password change replacing the stored session, and the email change's
 * states (code sent, waiting for the coach).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  account: null,
  api: {
    get: vi.fn(),
    update: vi.fn(),
    changePassword: vi.fn(),
    requestEmailChange: vi.fn(),
    confirmEmailChange: vi.fn(),
    cancelEmailChange: vi.fn(),
  },
  login: vi.fn(),
}));

vi.mock('@/services/api', () => ({ accountAPI: h.api }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ login: h.login, logout: vi.fn() }) }));
vi.mock('@/contexts/CompetitionContext', () => ({ useCompetition: () => ({ clearCompetitionContext: vi.fn() }) }));
vi.mock('@/utils/auth/secureStorage', () => ({ secureStorage: { getItem: () => null, setItem: vi.fn() } }));

import AccountProfile from './AccountProfile';

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/:role/profile" element={<AccountProfile />} />
    </Routes>
  </MemoryRouter>
);

const respond = (data) => Promise.resolve({ data: { data } });

beforeEach(() => {
  Object.values(h.api).forEach((fn) => fn.mockReset());
  h.login.mockReset();
  h.api.get.mockImplementation(() => respond(h.account));
});

describe('account page', () => {
  it('a player sees their Player ID, and date of birth is locked once on a team', async () => {
    h.account = {
      userType: 'player',
      user: { firstName: 'Aarav', lastName: 'Patil', loginId: 'aarav.patil.150616', emailType: 'none', team: 't1', dateOfBirth: '2016-06-15', gender: 'Male', guardian: { name: 'Sunita', phone: '9876543210' } },
      pendingEmailChange: null,
    };
    renderAt('/player/profile');
    expect(await screen.findByText('aarav.patil.150616')).toBeInTheDocument();
    expect(screen.getByLabelText(/date of birth/i)).toBeDisabled();
    expect(screen.getByLabelText(/parent\/guardian name/i)).toHaveValue('Sunita');
    expect(screen.getByText(/your coach approves the new address/i)).toBeInTheDocument();
  });

  it('an admin edits one name, and has no phone or guardian fields', async () => {
    h.account = { userType: 'admin', user: { name: 'Org One', email: 'org@example.com' }, pendingEmailChange: null };
    renderAt('/admin/profile');
    expect(await screen.findByLabelText(/^name/i)).toHaveValue('Org One');
    expect(screen.queryByLabelText(/phone number/i)).toBeNull();
    expect(screen.queryByLabelText(/guardian/i)).toBeNull();
  });

  it('a password change stores the new session token', async () => {
    h.account = { userType: 'coach', user: { firstName: 'Ravi', email: 'ravi@example.com' }, pendingEmailChange: null };
    h.api.changePassword.mockImplementation(() => respond({ token: 'fresh', user: { firstName: 'Ravi' } }));
    renderAt('/coach/profile');
    await screen.findByLabelText(/^current password/i, { selector: '#account-currentPassword' });

    fireEvent.change(document.getElementById('account-currentPassword'), { target: { value: 'CorrectHorse1' } });
    fireEvent.change(document.getElementById('account-newPassword'), { target: { value: 'NewPassword9' } });
    fireEvent.change(document.getElementById('account-confirmPassword'), { target: { value: 'NewPassword9' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(h.api.changePassword).toHaveBeenCalledWith('CorrectHorse1', 'NewPassword9'));
    await waitFor(() => expect(h.login).toHaveBeenCalledWith({ firstName: 'Ravi' }, 'fresh', 'coach'));
  });

  it('shows the code step while an email change waits for its code', async () => {
    h.account = {
      userType: 'coach',
      user: { firstName: 'Ravi', email: 'ravi@example.com' },
      pendingEmailChange: { newEmail: 'new@example.com', status: 'awaiting-code' },
    };
    h.api.confirmEmailChange.mockImplementation(() => respond({ status: 'done' }));
    renderAt('/coach/profile');
    expect(await screen.findByText('new@example.com')).toBeInTheDocument();

    fireEvent.change(document.getElementById('account-code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => expect(h.api.confirmEmailChange).toHaveBeenCalledWith('123456'));
  });

  it('says so while a player waits for the coach', async () => {
    h.account = {
      userType: 'player',
      user: { firstName: 'Aarav', loginId: 'aarav.patil.150616', emailType: 'none' },
      pendingEmailChange: { newEmail: 'parent@example.com', status: 'awaiting-coach' },
    };
    renderAt('/player/profile');
    expect(await screen.findByText(/waiting for your coach/i)).toBeInTheDocument();
  });

  it("a player says whose email the new one is", async () => {
    h.account = { userType: 'player', user: { firstName: 'Aarav', loginId: 'a.p.1', emailType: 'self', email: 'a@example.com' }, pendingEmailChange: null };
    h.api.requestEmailChange.mockImplementation(() => respond({ newEmail: 'parent@example.com', status: 'awaiting-code' }));
    renderAt('/player/profile');
    await screen.findByText('a.p.1');

    fireEvent.click(screen.getByRole('radio', { name: /parent's \/ guardian's/i }));
    fireEvent.change(document.getElementById('account-newEmail'), { target: { value: 'parent@example.com' } });
    fireEvent.change(document.getElementById('account-emailPassword'), { target: { value: 'CorrectHorse1' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(h.api.requestEmailChange).toHaveBeenCalledWith({
      newEmail: 'parent@example.com', currentPassword: 'CorrectHorse1', emailType: 'guardian',
    }));
  });
});
