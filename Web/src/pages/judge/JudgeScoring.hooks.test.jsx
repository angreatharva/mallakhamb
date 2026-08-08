/**
 * Verification for HIGH-W1 in docs/AUDIT.md.
 *
 * STATUS: FIXED 2026-08-07.
 *
 * JudgeScoring used to return <ScorerScoring /> at line ~215, before seventeen
 * hook calls. React requires an identical hook sequence on every render of a
 * component instance, so when `isScorer` changed between renders of the SAME
 * instance React threw and the tree unmounted — and with only one root
 * ErrorBoundary (HIGH-W2) that blanked the whole app.
 *
 * The fix split the file: `JudgeScoring` is now a hook-free dispatcher whose
 * only hook is an unconditional `useLocation`, and the slip body lives in
 * `JudgeSlip`. Flipping the branch swaps which CHILD renders, which React
 * unmounts and remounts cleanly.
 *
 * These are now plain `it()` regression guards asserting the fixed behaviour.
 * Everything below the component under test is stubbed; the hook-count
 * mismatch came from JudgeScoring's own useState/useRef calls, so stubbing the
 * child hooks does not weaken the guard.
 */
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mutable router state, flipped between renders -------------------------
let mockLocation = { state: null, pathname: '/judge/scoring' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => mockLocation,
}));

// --- Session storage: no stored judge, so `isScorer` depends solely on
//     location.state (the exact condition described in the audit).
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('../../contexts/CompetitionContext', () => ({
  useCompetition: () => ({ clearCompetitionContext: vi.fn() }),
}));
vi.mock('@/hooks/useResponsive', () => ({ useReducedMotion: () => true }));

// The Scorer branch — rendering it must not itself call hooks, so the count
// difference measured is purely JudgeScoring's own.
vi.mock('./ScorerScoring', () => ({ default: () => <div data-testid="scorer-view" /> }));

// Child hooks stubbed to inert values; JudgeScoring's own ~13 hooks stay real.
vi.mock('./useJudgePanelData', () => ({
  useJudgeSession: () => ({
    activeSessionData: {},
    selectedTeam: { _id: 't1' },
    selectedPlayer: { _id: 'p1' },
    selectedCompetitionType: 'competition_1',
    selectedApparatus: 'Pole Mallakhamb',
    selectedGender: 'Male',
    selectedAgeGroup: 'Under14',
  }),
  useJudgeInfo: () => ({ judgeType: 'Judge 1', gender: 'Male', ageGroup: 'Under14' }),
  useJudgePanelData: () => ({
    panelScores: {},
    setPanelScores: vi.fn(),
    finalized: false,
    socket: null,
    isConnected: false,
  }),
}));

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

// JudgeScoring now reaches the network only through judgeAPI (HIGH-W3).
// Mocked here so the test never pulls in api-client, which builds real axios
// instances at module load — this suite is about hook ordering, not transport.
vi.mock('@/services/public/judge.api', () => ({
  judgeAPI: {
    getJudges: vi.fn().mockResolvedValue({ data: { data: [] } }),
    getSubmittedTeams: vi.fn().mockResolvedValue({ data: { data: [] } }),
    getTeamScores: vi.fn().mockResolvedValue({ data: { data: [] } }),
    saveScore: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import JudgeScoring from './JudgeScoring';

describe('HIGH-W1 — conditional hooks in JudgeScoring', () => {
  let consoleError;

  beforeEach(() => {
    // React logs the hook-order violation before throwing; keep the run quiet.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLocation = { state: null, pathname: '/judge/scoring' };
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('routes a Scorer to the Scorer view', () => {
    // A Scorer arrives from the dashboard, which passes `isScorer: true` in
    // router state (JudgeDashboard.jsx:262).
    mockLocation = { state: { isScorer: true }, pathname: '/judge/scoring' };
    const { getByTestId } = render(<JudgeScoring />);

    expect(getByTestId('scorer-view')).toBeInTheDocument();
  });

  /**
   * The HIGH-W1 regression guard. Previously this threw
   * "Rendered more hooks than during the previous render", because the Scorer
   * branch returned early from inside the component that owns the ~17 hooks.
   * The branch now lives in a hook-free dispatcher, so flipping it swaps the
   * child component and React remounts cleanly.
   */
  it('tolerates isScorer changing between renders of the same instance', () => {
    mockLocation = { state: { isScorer: true }, pathname: '/judge/scoring' };
    const { rerender, getByTestId, queryByTestId } = render(<JudgeScoring />);
    expect(getByTestId('scorer-view')).toBeInTheDocument();

    // The same instance re-renders with router state that no longer carries the
    // flag (browser Back, or a redirect that rebuilds state). With no stored
    // judge to fall back on, isScorer is now false.
    mockLocation = { state: {}, pathname: '/judge/scoring' };

    expect(() => rerender(<JudgeScoring />)).not.toThrow();
    // It really did switch branches, rather than silently re-rendering the
    // Scorer view — otherwise this would pass without proving anything.
    expect(queryByTestId('scorer-view')).not.toBeInTheDocument();
  });

  it('does not log a React hook-order error while switching branches', () => {
    mockLocation = { state: { isScorer: true }, pathname: '/judge/scoring' };
    const { rerender } = render(<JudgeScoring />);

    mockLocation = { state: {}, pathname: '/judge/scoring' };
    rerender(<JudgeScoring />);

    const logged = consoleError.mock.calls.map((args) => String(args[0] ?? '')).join('\n');
    expect(logged).not.toMatch(/Rendered more hooks|change in the order of Hooks/);
  });
});
