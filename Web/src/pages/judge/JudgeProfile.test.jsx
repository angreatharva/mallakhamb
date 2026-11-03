/**
 * My Profile in the same shell as every other role: the masthead (Account,
 * Logout), the identity, and Profile | Panels | Marking insights tabs, with a
 * finished competition's seats marked view only.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ profile: {} }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/contexts/CompetitionContext', () => ({ useCompetition: () => ({ clearCompetitionContext: vi.fn() }) }));
vi.mock('@/services/public/judge.api', () => ({
  judgeAPI: { getProfile: () => Promise.resolve({ data: { data: h.profile } }), updateProfile: vi.fn() },
}));
vi.mock('@/services/api', () => ({
  accountAPI: { get: () => Promise.resolve({ data: { data: {} } }) },
  statsAPI: { judge: () => Promise.resolve({ data: { data: null } }) },
}));
vi.mock('@/pages/shared/account/AccountSections', () => ({
  PasswordSection: () => <section>Password section</section>,
  EmailSection: () => <section>Email section</section>,
  SectionHeading: ({ children }) => <h2>{children}</h2>,
}));

import JudgeProfile from './JudgeProfile';

const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><JudgeProfile /></MemoryRouter>);

beforeEach(() => {
  h.profile = {
    name: 'ath ang',
    email: 'ath@example.test',
    assignments: [
      {
        _id: 's1', judgeType: 'Senior Judge', gender: 'Male', ageGroup: 'Under14', competitionTypes: ['competition_1'],
        competition: { _id: 'm1', name: 'Old Meet', level: 'state', endDate: '2020-01-05T00:00:00.000Z' },
      },
    ],
  };
});

describe('JudgeProfile', () => {
  it('has the shared masthead and three tabs', async () => {
    renderAt('/judge/profile');
    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Panels' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Marking insights' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Logout/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('My profile')).toBeInTheDocument();
  });

  it('Panels lists past seats, marked view only', async () => {
    renderAt('/judge/profile?tab=panels');
    expect(await screen.findByText('Old Meet')).toBeInTheDocument();
    expect(screen.getByText('Senior Judge')).toBeInTheDocument();
    expect(screen.getByText('Completed · view only')).toBeInTheDocument();
  });

  it('switching tabs keeps the profile reachable', async () => {
    renderAt('/judge/profile?tab=panels');
    fireEvent.click(await screen.findByRole('tab', { name: 'Profile' }));
    expect(await screen.findByText('Password section')).toBeInTheDocument();
  });
});
