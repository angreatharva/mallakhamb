/**
 * Back from a signed-in screen: the step is undone and sign-out is offered,
 * the chooser never mounts, and the dashboard never remounts. Driven through
 * real browser history (jsdom), because the guard reads React Router's `idx`
 * from `history.state` and undoes the step with `history.go`.
 */
import { useEffect } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { isSignedInScreen, useSignOutOnBack } from './useSignOutOnBack';

const mounts = { dashboard: 0, chooser: 0 };
let go;

const Dashboard = () => {
  useEffect(() => { mounts.dashboard += 1; }, []);
  return <p>dashboard</p>;
};
const Chooser = () => {
  useEffect(() => { mounts.chooser += 1; }, []);
  return <p>chooser</p>;
};
const Navigator = () => {
  go = useNavigate();
  return null;
};

const Harness = ({ role }) => {
  const { location, prompting, dismiss } = useSignOutOnBack({ signedInRole: role });
  return (
    <>
      <Navigator />
      <Routes location={location}>
        <Route path="/:role/select-competition" element={<Chooser />} />
        <Route path="/:role/select-level" element={<Chooser />} />
        <Route path="/:role/login" element={<Chooser />} />
        <Route path="/:role/dashboard" element={<Dashboard />} />
        <Route path="/:role/team/:id" element={<p>team</p>} />
      </Routes>
      {prompting && <button type="button" onClick={dismiss}>stay</button>}
    </>
  );
};

const start = async (role, signedIn = true) => {
  window.history.replaceState(null, '', `/${role}/select-competition`);
  render(<BrowserRouter><Harness role={signedIn ? role : null} /></BrowserRouter>);
  await act(async () => { go(`/${role}/dashboard`); });
  expect(screen.getByText('dashboard')).toBeInTheDocument();
  mounts.chooser = 0; // the render we started on, before the dashboard
};

const back = async (steps = 1) => {
  await act(async () => { window.history.go(-steps); });
};

beforeEach(() => {
  mounts.dashboard = 0;
  mounts.chooser = 0;
});

describe('isSignedInScreen', () => {
  it('counts dashboards and the pages under them, not the way in', () => {
    expect(isSignedInScreen('/admin/dashboard/teams', 'admin')).toBe(true);
    expect(isSignedInScreen('/judge/scoring/panel-review', 'judge')).toBe(true);
    expect(isSignedInScreen('/coach/payment', 'coach')).toBe(true);
    for (const p of ['login', 'register', 'select-level', 'select-competition', 'select-team', 'create-team']) {
      expect(isSignedInScreen(`/player/${p}`, 'player')).toBe(false);
    }
    expect(isSignedInScreen('/admin', 'admin')).toBe(false);
    expect(isSignedInScreen('/', 'admin')).toBe(false);
  });

  it('never reads a super admin path as an admin one', () => {
    expect(isSignedInScreen('/superadmin/dashboard', 'admin')).toBe(false);
    expect(isSignedInScreen('/superadmin/dashboard', 'superadmin')).toBe(true);
  });
});

describe.each(['player', 'coach', 'judge', 'admin', 'superadmin'])('%s: Back from the dashboard', (role) => {
  it('asks to sign out and stays on the dashboard, which never remounts', async () => {
    await start(role);
    const mountedBefore = mounts.dashboard;

    await back();

    expect(await screen.findByRole('button', { name: 'stay' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe(`/${role}/dashboard`));
    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(mounts.chooser).toBe(0);
    expect(mounts.dashboard).toBe(mountedBefore);

    // Dismissed: same page, and Back asks again.
    await act(async () => { screen.getByRole('button', { name: 'stay' }).click(); });
    expect(screen.queryByRole('button', { name: 'stay' })).toBeNull();
    await back();
    expect(await screen.findByRole('button', { name: 'stay' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe(`/${role}/dashboard`));
  });
});

describe('what Back still does normally', () => {
  it('moves between signed-in pages without asking', async () => {
    await start('judge');
    await act(async () => { go('/judge/team/t1'); });
    await back();
    await waitFor(() => expect(screen.getByText('dashboard')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'stay' })).toBeNull();
  });

  it('undoes a multi-step jump from deep inside, back to the exact page', async () => {
    await start('judge');
    await act(async () => { go('/judge/team/t1'); });
    await back(2);
    expect(await screen.findByRole('button', { name: 'stay' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/judge/team/t1'));
    expect(screen.getByText('team')).toBeInTheDocument();
    expect(mounts.chooser).toBe(0);
  });

  it('lets Back leave a chooser the user opened from the dashboard', async () => {
    await start('admin');
    await act(async () => { go('/admin/select-level'); });
    await back();
    await waitFor(() => expect(screen.getByText('dashboard')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'stay' })).toBeNull();
  });

  it('does nothing once signed out', async () => {
    await start('coach', false);
    await back();
    await waitFor(() => expect(screen.getByText('chooser')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'stay' })).toBeNull();
  });

  it('puts the screen back by replace when the entry has no router index', async () => {
    // select-level is written before the router starts, so it carries no idx;
    // the router stamps one only on the entry it starts on.
    window.history.replaceState(null, '', '/player/select-level');
    window.history.pushState(null, '', '/player/select-competition');
    render(<BrowserRouter><Harness role="player" /></BrowserRouter>);
    await act(async () => { go('/player/dashboard'); });
    mounts.chooser = 0;
    const spy = vi.spyOn(window.history, 'go');
    await back(2);
    expect(await screen.findByRole('button', { name: 'stay' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/player/dashboard'));
    expect(spy).toHaveBeenCalledTimes(1); // ours, from back(); the guard replaced instead
    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(mounts.chooser).toBe(0);
    vi.restoreAllMocks();
  });
});
