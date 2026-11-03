/**
 * The role popup: a judge seated as BOTH Scorer and Time Keeper in the chosen
 * category is asked which one they are working as, and the dashboard — the
 * team list, Set Sequence and where a team opens — follows the answer.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  seats: [],
  competition: null,
}));

const COMP = 'comp-1';
const seat = (judgeType) => ({
  _id: `seat-${judgeType}`,
  judgeType,
  gender: 'Female',
  ageGroup: 'Above16',
  competitionTypes: ['competition_1'],
  apparatus: 'Rope Mallakhamb',
  competition: { _id: COMP, name: 'SGAM-TRIALS-1' },
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => h.navigate,
}));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connected: false }),
}));
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: {
    getItem: (key) => {
      if (key === 'judge_user') {
        return JSON.stringify({
          name: 'Preetesh Gamre', ...h.seats[0], competition: COMP, allAssignments: h.seats,
        });
      }
      if (key === 'judge_current_competition') return h.competition ? JSON.stringify(h.competition) : null;
      return 'token';
    },
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn(), login: vi.fn() }) }));
vi.mock('../../contexts/CompetitionContext', () => ({
  useCompetition: () => ({ clearCompetitionContext: vi.fn() }),
}));
vi.mock('@/hooks/useResponsive', () => ({ useReducedMotion: () => true }));
vi.mock('@/components/competition/CompetitionLockBanner', () => ({ default: () => null }));
vi.mock('@/services/ordering/lots.api', () => ({
  judgeLotsAPI: { getOrder: () => Promise.resolve({ data: { data: null } }) },
}));
vi.mock('@/services/public/judge.api', () => ({
  judgeAPI: {
    getAssignments: () => Promise.resolve({ data: { data: h.seats } }),
    getSubmittedTeams: () => Promise.resolve({ data: { data: [
      { _id: 'team-a', name: 'SGAM-TRIALS-TEAM-A', players: [] },
    ] } }),
    setCompetition: vi.fn(),
    getProfile: () => Promise.resolve({ data: { data: {
      name: 'Preetesh Gamre', email: 'preetesh@example.test', assignments: [],
    } } }),
  },
}));
vi.mock('@/services/api', () => ({
  statsAPI: { judge: () => Promise.resolve({ data: { data: null } }) },
}));

// jsdom has no IntersectionObserver; the dashboard's FadeIn needs one. Report
// everything as in view immediately.
globalThis.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }]); }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
};

import { MemoryRouter } from 'react-router-dom';
import JudgeDashboard from './JudgeDashboard';

// The masthead links home, so the screen needs a router around it.
const renderDashboard = () => render(<MemoryRouter><JudgeDashboard /></MemoryRouter>);

/** The category as a judge who already chose it would have it stored. */
const storeCategory = () => {
  sessionStorage.setItem('judge_category_selected', 'true');
  sessionStorage.setItem('judge_selected_competition', COMP);
  sessionStorage.setItem('judge_selected_comp_type', 'competition_1');
  sessionStorage.setItem('judge_selected_gender', 'Female');
  sessionStorage.setItem('judge_selected_age_group', 'Above16');
  sessionStorage.setItem('judge_selected_apparatus', 'Rope Mallakhamb');
};

beforeEach(() => {
  sessionStorage.clear();
  h.navigate.mockClear();
  h.competition = null;
});

describe('JudgeDashboard — Scorer or Time Keeper', () => {
  it('asks for the role when the category seats this judge as both', async () => {
    h.seats = [seat('Scorer'), seat('Time Keeper')];
    storeCategory();
    renderDashboard();

    expect(await screen.findByText('Select Your Role')).toBeInTheDocument();
    // The team list waits for the answer.
    expect(screen.queryByPlaceholderText('Search teams by name...')).not.toBeInTheDocument();
  });

  it('as Time Keeper: no Set Sequence, and a team opens the stopwatch', async () => {
    h.seats = [seat('Scorer'), seat('Time Keeper')];
    storeCategory();
    renderDashboard();

    fireEvent.click(await screen.findByText('Time Keeper', { selector: 'p' }));
    await waitFor(() => expect(screen.queryByText('Select Your Role')).not.toBeInTheDocument());

    expect(screen.queryByText('Set Sequence')).not.toBeInTheDocument();
    expect(screen.getByText('Change Role')).toBeInTheDocument();
    expect(sessionStorage.getItem('judge_selected_role')).toBe('Time Keeper');

    fireEvent.click(await screen.findByText('SGAM-TRIALS-TEAM-A'));
    expect(h.navigate).toHaveBeenCalledWith('/judge/scoring', expect.objectContaining({
      state: expect.objectContaining({ isTimeKeeper: true }),
    }));
  });

  it('as Scorer: Set Sequence is offered and a team opens the score sheet', async () => {
    h.seats = [seat('Scorer'), seat('Time Keeper')];
    storeCategory();
    renderDashboard();

    fireEvent.click(await screen.findByText('Scorer', { selector: 'p' }));
    await waitFor(() => expect(screen.queryByText('Select Your Role')).not.toBeInTheDocument());

    expect(screen.getByText('Set Sequence')).toBeInTheDocument();
    fireEvent.click(await screen.findByText('SGAM-TRIALS-TEAM-A'));
    expect(h.navigate).toHaveBeenCalledWith('/judge/scoring', expect.objectContaining({
      state: expect.objectContaining({ isScorer: true }),
    }));
  });

  it('remembers the answer across a refresh', async () => {
    h.seats = [seat('Scorer'), seat('Time Keeper')];
    storeCategory();
    sessionStorage.setItem('judge_selected_role', 'Scorer');
    renderDashboard();

    expect(await screen.findByText('SGAM-TRIALS-TEAM-A')).toBeInTheDocument();
    expect(screen.queryByText('Select Your Role')).not.toBeInTheDocument();
  });

  it('never asks a judge who holds only one of the two seats', async () => {
    h.seats = [seat('Scorer')];
    storeCategory();
    renderDashboard();

    expect(await screen.findByText('SGAM-TRIALS-TEAM-A')).toBeInTheDocument();
    expect(screen.queryByText('Select Your Role')).not.toBeInTheDocument();
    expect(screen.queryByText('Change Role')).not.toBeInTheDocument();
  });
});

describe('JudgeDashboard — no panel seat', () => {
  it('shows the judge home, not the category picker', async () => {
    h.seats = [];
    renderDashboard();

    expect(await screen.findByTestId('judge-home')).toBeInTheDocument();
    expect(screen.getByText('No panel seat yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check for a panel/ })).toBeInTheDocument();
    // The picker never opens for someone with nothing to pick.
    expect(screen.queryByText('Select Your Role')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search teams by name...')).not.toBeInTheDocument();
  });
});

describe('JudgeDashboard — a finished competition', () => {
  it('is view only: no Set Sequence, and the strip says so', async () => {
    h.seats = [seat('Scorer')];
    h.competition = { _id: COMP, name: 'SGAM-TRIALS-1', endDate: '2020-01-05T00:00:00.000Z' };
    storeCategory();
    renderDashboard();

    expect(await screen.findByText('SGAM-TRIALS-TEAM-A')).toBeInTheDocument();
    expect(screen.getByText('Completed — view only')).toBeInTheDocument();
    expect(screen.queryByText('Set Sequence')).not.toBeInTheDocument();
  });
});

describe('JudgeDashboard — which competition', () => {
  it('names the meet even when the judge is seated at only one', async () => {
    h.seats = [seat('Scorer')];
    storeCategory();
    renderDashboard();

    expect(await screen.findByTestId('judge-current-meet')).toHaveTextContent('SGAM-TRIALS-1');
    expect(screen.getByText('Meet')).toBeInTheDocument();
  });
});

