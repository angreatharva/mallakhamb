/**
 * The Judge fairness board reads as sentences: a flagged pair is one line an
 * organiser can act on, a clean meet says so, and an admin with no meet chosen
 * is told to choose one rather than shown everyone's judges.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ judgeFairness: vi.fn() }));
vi.mock('@/services/api', () => ({ statsAPI: { judgeFairness: h.judgeFairness } }));

import AdminJudgeFairness from './AdminJudgeFairness';

const thresholds = { minPerformances: 6, minLean: 0.3, confidence: 0.9, minOtherJudges: 2 };
const priya = { id: 'j1', name: 'Priya Deshmukh', stateUnit: 'Maharashtra', performances: 45, strictness: { mean: 0.11 }, agreement: 0.17, inferredShare: 0, homeState: null, flaggedTeams: 1 };
const rakesh = { id: 'j2', name: 'Rakesh Verma', stateUnit: 'Madhya Pradesh', performances: 45, strictness: { mean: -0.27 }, agreement: 0.28, inferredShare: 0, homeState: null, flaggedTeams: 0 };
const flaggedCell = { judgeId: 'j1', teamId: 't1', teamName: 'Akola Krida Mandal', stateUnit: 'Maharashtra', isHomeState: true, n: 8, others: 37, lean: 0.51, ci: [0.41, 0.61], enough: true, flagged: true, groupMean: 0.53, othersMean: 0.02 };
const quietCell = { judgeId: 'j2', teamId: 't1', teamName: 'Akola Krida Mandal', isHomeState: false, n: 8, others: 37, lean: 0.03, ci: [-0.1, 0.16], enough: true, flagged: false, groupMean: -0.25, othersMean: -0.28 };

const board = (over = {}) => ({
  scope: { competitionId: 'c1' },
  competitions: [{ id: 'c1', name: 'Nationals 2026' }],
  thresholds,
  performances: 45,
  judges: [priya, rakesh],
  teams: [{ id: 't1', name: 'Akola Krida Mandal', stateUnit: 'Maharashtra', performances: 16 }],
  cells: [flaggedCell, quietCell],
  flags: [{ kind: 'team', judgeName: 'Priya Deshmukh', ...flaggedCell }],
  ...over,
});

beforeEach(() => h.judgeFairness.mockReset());

describe('AdminJudgeFairness', () => {
  it('turns a flagged pair into one plain sentence with its evidence', async () => {
    h.judgeFairness.mockResolvedValue({ data: { data: board() } });
    render(<AdminJudgeFairness competitionId="c1" />);

    expect(await screen.findByText('Priya Deshmukh marks Akola Krida Mandal higher than other teams')).toBeInTheDocument();
    expect(h.judgeFairness).toHaveBeenCalledWith('c1');
    expect(screen.getAllByText('Needs a look').length).toBeGreaterThan(0);
    expect(screen.getByText(/On 8 performances: \+0\.53 against the rest of the panel/)).toBeInTheDocument();
    // A strict-with-everyone judge is described, not accused.
    expect(screen.getByText('Stricter than the panel (−0.27)')).toBeInTheDocument();
  });

  it('says plainly when nothing needs a look', async () => {
    h.judgeFairness.mockResolvedValue({ data: { data: board({ flags: [], cells: [quietCell], judges: [rakesh] }) } });
    render(<AdminJudgeFairness competitionId="c1" />);
    expect(await screen.findByText('Nothing needs a look')).toBeInTheDocument();
  });

  it('asks an admin with no competition chosen to choose one, without calling the API', async () => {
    render(<AdminJudgeFairness competitionId={null} />);
    expect(screen.getByText('Choose a competition')).toBeInTheDocument();
    await waitFor(() => expect(h.judgeFairness).not.toHaveBeenCalled());
  });

  it('lets a super admin look across every competition', async () => {
    h.judgeFairness.mockResolvedValue({ data: { data: board({ scope: { competitionId: null } }) } });
    render(<AdminJudgeFairness isSuperAdmin competitionId={null} />);
    await screen.findByText('Judge fairness');
    expect(h.judgeFairness).toHaveBeenCalledWith(null);
  });
});
