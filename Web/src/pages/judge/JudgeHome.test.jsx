/**
 * The home of a judge on no panel: the shared masthead, who they are, a nudge
 * to complete the staffing facts, and "Check for a panel" — which opens the
 * competition chooser once an organiser has seated them, with no sign-out.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  profile: {},
  seats: [],
  summary: null,
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => h.navigate,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/contexts/CompetitionContext', () => ({ useCompetition: () => ({ clearCompetitionContext: vi.fn() }) }));
vi.mock('@/services/public/judge.api', () => ({
  judgeAPI: {
    getProfile: () => Promise.resolve({ data: { data: h.profile } }),
    getAssignments: () => Promise.resolve({ data: { data: h.seats } }),
  },
}));
vi.mock('@/services/api', () => ({
  statsAPI: { judge: () => Promise.resolve({ data: { data: h.summary ? { summary: h.summary } : null } }) },
}));

import JudgeHome from './JudgeHome';
import { groupSeatsByMeet } from './JudgePanelHistory';

const renderHome = () => render(<MemoryRouter><JudgeHome fallbackName="ath ang" /></MemoryRouter>);

beforeEach(() => {
  h.navigate.mockClear();
  h.profile = { name: 'ath ang', email: 'ath@example.test', assignments: [] };
  h.seats = [];
  h.summary = null;
});

describe('JudgeHome', () => {
  it('greets the judge under the shared masthead', async () => {
    renderHome();
    expect(await screen.findByText('Profile Information')).toBeInTheDocument();
    expect(screen.getAllByText('ath ang').length).toBeGreaterThan(0);
    expect(screen.getByText('Awaiting panel')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Logout/ }).length).toBeGreaterThan(0);
  });

  it('asks for the staffing facts only while they are missing', async () => {
    renderHome();
    expect(await screen.findByRole('button', { name: /Complete your profile/ })).toBeInTheDocument();
  });

  it('a complete profile is not nagged', async () => {
    h.profile = { ...h.profile, certificationLevel: 'State', stateUnit: 'Maharashtra', registrationNumber: 'MFI-1' };
    renderHome();
    await screen.findByText('Profile Information');
    expect(screen.queryByRole('button', { name: /Complete your profile/ })).not.toBeInTheDocument();
  });

  it('"Check for a panel" opens the chooser once seated', async () => {
    h.seats = [{ _id: 's1', judgeType: 'Judge 1' }];
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Check for a panel/ }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/judge/select-level'));
  });

  it('"Check for a panel" stays put while there is still no seat', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Check for a panel/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Check for a panel/ })).toBeEnabled());
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('shows marking insights only to a judge with published marks', async () => {
    h.summary = { performances: 12, strictness: { mean: 0.1 }, agreement: 0.2 };
    renderHome();
    expect(await screen.findByText('Marking insights')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});

describe('groupSeatsByMeet', () => {
  it('groups seats under their meet, newest first as sent', () => {
    const a = { _id: 'm1', name: 'A' };
    const b = { _id: 'm2', name: 'B' };
    const groups = groupSeatsByMeet([
      { _id: 1, competition: b, judgeType: 'Scorer' },
      { _id: 2, competition: a, judgeType: 'Judge 1' },
      { _id: 3, competition: b, judgeType: 'Time Keeper' },
    ]);
    expect(groups.map((g) => g.id)).toEqual(['m2', 'm1']);
    expect(groups[0].seats.map((s) => s.judgeType)).toEqual(['Scorer', 'Time Keeper']);
  });

  it('keeps a seat whose meet did not resolve', () => {
    expect(groupSeatsByMeet([{ _id: 1, competition: 'm9' }])[0]).toMatchObject({ id: 'm9', competition: null });
  });
});
