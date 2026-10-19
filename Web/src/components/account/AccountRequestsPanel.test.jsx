/**
 * The coach's / super admin's list of requests from players with no email:
 * approving a reset asks for the identity check first and shows the one-time
 * code once; an empty list can hide itself on the busy coach dashboard.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AccountRequestsPanel from './AccountRequestsPanel';

const respond = (data, message) => Promise.resolve({ data: { data, message } });

const reset = {
  id: 'r1', kind: 'password-reset', status: 'awaiting-coach', createdAt: '2026-10-19T10:00:00Z',
  player: { firstName: 'Aarav', lastName: 'Patil', loginId: 'aarav.patil.150616', team: 'Shivaji Club' },
};
const emailAdd = {
  id: 'r2', kind: 'email-change', status: 'awaiting-coach', newEmail: 'parent@example.com', newEmailType: 'guardian', createdAt: '2026-10-19T11:00:00Z',
  player: { firstName: 'Diya', lastName: 'Rao', loginId: 'diya.rao.010115' },
};

let api;
beforeEach(() => {
  api = { list: vi.fn(() => respond([reset, emailAdd])), approve: vi.fn(), reject: vi.fn() };
});

describe('AccountRequestsPanel', () => {
  it('lists each request with the player and what they asked for', async () => {
    render(<AccountRequestsPanel api={api} showTeam />);
    expect(await screen.findByText('Aarav Patil')).toBeInTheDocument();
    expect(screen.getByText('aarav.patil.150616')).toBeInTheDocument();
    expect(screen.getByText('Password reset')).toBeInTheDocument();
    expect(screen.getByText('Shivaji Club')).toBeInTheDocument();
    expect(screen.getByText(/parent@example.com \(parent's or guardian's\)/)).toBeInTheDocument();
  });

  it('asks for the identity check, then shows the code once', async () => {
    api.approve.mockImplementation(() => respond({ status: 'approved', code: '482913', codeExpiresAt: '2026-10-20T10:00:00Z' }));
    render(<AccountRequestsPanel api={api} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Approve' }))[0]);

    expect(screen.getByText(/checked, in person or by phone/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /yes, approve/i }));

    await waitFor(() => expect(api.approve).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText('482913')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('482913')).toBeNull();
  });

  it('rejects after confirming', async () => {
    api.reject.mockImplementation(() => respond({ status: 'rejected' }, 'Request turned down.'));
    render(<AccountRequestsPanel api={api} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Reject' }))[1]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' }).at(-1));
    await waitFor(() => expect(api.reject).toHaveBeenCalledWith('r2'));
  });

  it('hides itself when empty, if asked', async () => {
    api.list.mockImplementation(() => respond([]));
    const { container } = render(<AccountRequestsPanel api={api} hideWhenEmpty />);
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('says so when empty otherwise', async () => {
    api.list.mockImplementation(() => respond([]));
    render(<AccountRequestsPanel api={api} />);
    expect(await screen.findByText(/nobody is waiting/i)).toBeInTheDocument();
  });
});
