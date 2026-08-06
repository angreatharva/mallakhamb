/**
 * Verification for HIGH-W1 in docs/AUDIT.md.
 *
 * JudgeScoring returns <ScorerScoring /> at line ~215, before roughly sixteen
 * hook calls. React requires an identical hook sequence on every render of a
 * component instance, so if `isScorer` changes between renders of the SAME
 * instance, React throws and the tree unmounts — and with only one root
 * ErrorBoundary (HIGH-W2) that blanks the whole app.
 *
 * The first test positively demonstrates the crash against the real component.
 * The second is written with `test.fails`, so it passes while the bug exists
 * and turns red the moment the early return is lifted above the hooks — at
 * which point swap it for a plain `it` and it becomes a permanent guard.
 *
 * Everything below the component under test is stubbed. The hook-count
 * mismatch comes from JudgeScoring's own useState/useRef calls, so stubbing
 * the child hooks does not weaken the reproduction.
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

  it('demonstrates the crash: isScorer flipping between renders throws', () => {
    // Render 1 — a Scorer arrives from the dashboard, which passes
    // `isScorer: true` in router state (JudgeDashboard.jsx:262).
    mockLocation = { state: { isScorer: true }, pathname: '/judge/scoring' };
    const { rerender, getByTestId } = render(<JudgeScoring />);

    // The early return took effect: none of the ~16 later hooks ran.
    expect(getByTestId('scorer-view')).toBeInTheDocument();

    // Render 2 — the same component instance re-renders with router state that
    // no longer carries the flag (browser Back, or a redirect that rebuilds
    // state). With no stored judge to fall back on, isScorer is now false.
    mockLocation = { state: {}, pathname: '/judge/scoring' };

    expect(() => rerender(<JudgeScoring />)).toThrow(/Rendered more hooks/);
  });

  it.fails('should tolerate isScorer changing between renders', () => {
    mockLocation = { state: { isScorer: true }, pathname: '/judge/scoring' };
    const { rerender } = render(<JudgeScoring />);

    mockLocation = { state: {}, pathname: '/judge/scoring' };
    rerender(<JudgeScoring />);
  });
});
