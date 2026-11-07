/**
 * Time Keeper → Scorer, both screens against one fake socket.
 *
 *   - The Time Keeper's Stop sends exactly the seconds on the display.
 *   - The Scorer's sheet fills that athlete's Time from it (deduction and all),
 *     and fills the Time Keeper and Scorer names itself.
 *   - The Scorer's sheet no longer lists the judges panel, and no longer
 *     repeats the team and apparatus under every athlete's name.
 */
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  const handlers = {};
  const socket = {
    connected: true,
    emit: vi.fn(),
    on: (event, fn) => { (handlers[event] ||= []).push(fn); },
    off: (event, fn) => { handlers[event] = (handlers[event] || []).filter((f) => f !== fn); },
    disconnect: vi.fn(),
    fire: (event, data) => (handlers[event] || []).forEach((fn) => fn(data)),
    reset: () => { Object.keys(handlers).forEach((k) => delete handlers[k]); },
  };
  return { socket, navigate: () => {}, state: { location: null, judge: null, judges: null } };
});

vi.mock('socket.io-client', () => ({ io: () => h.socket }));
// Stable, like the real hook: both pages have effects that depend on it.
vi.mock('react-router-dom', () => ({
  useNavigate: () => h.navigate,
  useLocation: () => ({ state: h.state.location, pathname: '/judge/scoring' }),
}));
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: {
    getItem: (key) => (key === 'judge_user' ? JSON.stringify(h.state.judge) : 'token'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));
vi.mock('@/hooks/useCompetitionLock', () => ({ useCompetitionLock: () => ({ locked: false }) }));
vi.mock('@/components/competition/CompetitionLockBanner', () => ({ default: () => null }));
vi.mock('@/services/user/admin.api', () => ({
  createAdminAPI: () => ({
    getJudges: () => Promise.resolve({ data: { data: h.state.judges || [
      { _id: 's1', judgeType: 'Senior Judge', name: 'Ravi Gaikwad', email: 'ravi.g@gmail.com', apparatus: 'Rope Mallakhamb' },
      { _id: 's2', judgeType: 'Judge 1', name: 'Yatin Nachre', email: 'yatin.n@gmail.com', apparatus: 'Rope Mallakhamb' },
      { _id: 's3', judgeType: 'Judge 2', name: 'Swapnil Chaugole', email: 'swapnil.c@gmail.com', apparatus: 'Rope Mallakhamb' },
      { _id: 's6', judgeType: 'Scorer', name: 'Asha Patil', apparatus: 'Rope Mallakhamb' },
      { _id: 's7', judgeType: 'Time Keeper', name: 'Kiran More', apparatus: 'Rope Mallakhamb' },
    ] } }),
    getAllJudgesSummary: () => Promise.resolve({ data: { data: { summary: [] } } }),
    getTeamScores: () => Promise.resolve({ data: { data: [] } }),
    saveScores: vi.fn(),
  }),
}));

import TimeKeeperScoring from './TimeKeeperScoring';
import ScorerScoring from './ScorerScoring';

const TEAM = {
  _id: 'team-a',
  name: 'SGAM-TRIALS-TEAM-A',
  coach: { name: 'Sandeep Kadam' },
  players: [
    { player: { _id: 'p1', firstName: 'Riya', lastName: 'Mane', gender: 'Female' }, ageGroup: 'Above16', apparatus: { competition_1: ['Rope Mallakhamb'] } },
    { player: { _id: 'p2', firstName: 'Purva', lastName: 'Thorat', gender: 'Female' }, ageGroup: 'Above16', apparatus: { competition_1: ['Rope Mallakhamb'] } },
  ],
};

const SESSION = {
  selectedTeam: TEAM,
  selectedCompetitionType: { value: 'competition_1', label: 'Competition I' },
  apparatus: 'Rope Mallakhamb',
  gender: 'Female',
  ageGroup: 'Above16',
};

const seat = (judgeType) => ({
  judgeType, gender: 'Female', ageGroup: 'Above16', competitionTypes: ['competition_1'], apparatus: 'Rope Mallakhamb',
});

beforeEach(() => {
  h.socket.reset();
  h.socket.emit.mockClear();
  sessionStorage.clear();
  localStorage.clear();
  h.state.judges = null;
});

describe('Time Keeper screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    h.state.judge = { name: 'Kiran More', ...seat('Time Keeper'), allAssignments: [seat('Time Keeper')] };
    h.state.location = { ...SESSION, isTimeKeeper: true };
  });
  afterEach(() => vi.useRealTimers());

  it('counts in seconds and sends exactly the stopped time for the chosen athlete', () => {
    render(<TimeKeeperScoring />);
    act(() => h.socket.fire('connect'));

    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    act(() => { vi.advanceTimersByTime(92_600); });
    expect(screen.getByTestId('timer-seconds')).toHaveTextContent('92');

    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));

    expect(h.socket.emit).toHaveBeenCalledWith('time_record', {
      roomId: 'scoring_Female_Above16_competition_1',
      playerId: 'p1',
      teamId: 'team-a',
      apparatus: 'Rope Mallakhamb',
      seconds: 92,
    });
  });

  it('shows the stopwatch first, then the athletes', () => {
    render(<TimeKeeperScoring />);
    const clock = screen.getByText('SECONDS');
    const athletes = screen.getByText('Athletes');
    // DOCUMENT_POSITION_FOLLOWING: the athletes come after the clock.
    expect(clock.compareDocumentPosition(athletes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pausing holds the clock', () => {
    render(<TimeKeeperScoring />);
    act(() => h.socket.fire('connect'));
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    act(() => { vi.advanceTimersByTime(30_000); });
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByTestId('timer-seconds')).toHaveTextContent('30');
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByTestId('timer-seconds')).toHaveTextContent('35');
  });
});

describe('Scorer sheet', () => {
  beforeEach(() => {
    h.state.judge = { name: 'Asha Patil', ...seat('Scorer'), allAssignments: [seat('Scorer')] };
    h.state.location = { ...SESSION, isScorer: true };
  });

  const loaded = async () => {
    render(<ScorerScoring />);
    await screen.findByText('Riya Mane');
    // The names are auto-filled only once the sheet has finished loading.
    await waitFor(() => expect(screen.getByLabelText(/^Scorer/)).toHaveValue('Asha Patil'));
  };

  it('fills the athlete\'s Time from the Time Keeper, with its deduction', async () => {
    await loaded();
    act(() => h.socket.fire('time_recorded', {
      playerId: 'p1', teamId: 'team-a', apparatus: 'Rope Mallakhamb', seconds: 95, timeKeeperName: 'Kiran More',
    }));

    await waitFor(() => expect(screen.getAllByPlaceholderText('00:00')[0]).toHaveValue('95'));
    // 5 s over 90 → the time deduction is filled like a typed time.
    const deduction = screen.getAllByDisplayValue(/^0\.\d0$/);
    expect(deduction.length).toBeGreaterThan(0);
  });

  it('keeps a time that arrives while the sheet is still loading', async () => {
    render(<ScorerScoring />);
    // Fired before the saved scores have loaded — the moment that used to be
    // wiped by the load resetting every row.
    act(() => h.socket.fire('time_recorded', {
      playerId: 'p2', teamId: 'team-a', apparatus: 'Rope Mallakhamb', seconds: 84,
    }));
    await screen.findByText('Purva Thorat');
    await waitFor(() => expect(screen.getAllByPlaceholderText('00:00')[1]).toHaveValue('84'));
  });

  it('a time short of 60 s fills its deduction too', async () => {
    await loaded();
    act(() => h.socket.fire('time_recorded', {
      playerId: 'p1', teamId: 'team-a', apparatus: 'Rope Mallakhamb', seconds: 55,
    }));
    await waitFor(() => expect(screen.getAllByPlaceholderText('00:00')[0]).toHaveValue('55'));
    // 5 s short → 0.30, the same band as 5 s over.
    expect(screen.getAllByDisplayValue('0.30').length).toBeGreaterThan(0);
  });

  it('ignores a time meant for another team', async () => {
    await loaded();
    act(() => h.socket.fire('time_recorded', {
      playerId: 'p1', teamId: 'team-b', apparatus: 'Rope Mallakhamb', seconds: 88,
    }));
    expect(screen.getAllByPlaceholderText('00:00')[0]).toHaveValue('');
  });

  it('fills the Time Keeper and Scorer names itself', async () => {
    await loaded();
    await waitFor(() => expect(screen.getByLabelText(/Time Keeper/)).toHaveValue('Kiran More'));
    expect(screen.getByLabelText(/^Scorer/)).toHaveValue('Asha Patil');
  });

  it('no longer lists the judges panel or repeats the team under each name', async () => {
    await loaded();
    expect(screen.queryByText('Judges Panel')).not.toBeInTheDocument();
    expect(screen.queryByText('ravi.g@gmail.com')).not.toBeInTheDocument();
    // The team is named once, at the top — not under every athlete.
    expect(screen.getAllByText(/SGAM-TRIALS-TEAM-A/)).toHaveLength(1);
  });
});

describe('Stopwatch face', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    h.state.judge = { name: 'Kiran More', ...seat('Time Keeper'), allAssignments: [seat('Time Keeper')] };
    h.state.location = { ...SESSION, isTimeKeeper: true };
  });
  afterEach(() => vi.useRealTimers());

  it('draws the analog dial: 5…60 numerals and a seconds-only readout', () => {
    render(<TimeKeeperScoring />);
    for (const n of [5, 30, 55, 60]) {
      expect(screen.getAllByText(String(n)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('SECONDS')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Stopwatch at 0 seconds' })).toBeInTheDocument();
  });

  it('the right button runs the clock and the left one ends it', () => {
    render(<TimeKeeperScoring />);
    act(() => h.socket.fire('connect'));
    // Idle: Reset (disabled) and Start
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    // Running: Stop and Pause
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    act(() => { vi.advanceTimersByTime(61_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    // Stopped: Reset and Next
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByTestId('timer-seconds')).toHaveTextContent('61');
  });
});

describe('one person as both Scorer and Time Keeper', () => {
  // The dashboard's role popup decides which screen they get. Having picked
  // Scorer, it is the plain sheet — the stopwatch is the Time Keeper's screen.
  beforeEach(() => {
    h.state.judge = {
      name: 'Asha Patil', ...seat('Scorer'),
      allAssignments: [seat('Scorer'), seat('Time Keeper')],
    };
    h.state.location = { ...SESSION, isScorer: true };
  });

  it('as Scorer: the sheet, with no stopwatch on it', async () => {
    render(<ScorerScoring />);
    await screen.findByText('Riya Mane');
    await waitFor(() => expect(screen.getByLabelText(/^Scorer/)).toHaveValue('Asha Patil'));
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('as Scorer: still receives times sent from the Time Keeper screen', async () => {
    render(<ScorerScoring />);
    await screen.findByText('Riya Mane');
    act(() => h.socket.fire('time_recorded', {
      playerId: 'p1', teamId: 'team-a', apparatus: 'Rope Mallakhamb', seconds: 88,
    }));
    await waitFor(() => expect(screen.getAllByPlaceholderText('00:00')[0]).toHaveValue('88'));
  });

  it('as Time Keeper: the stopwatch screen', () => {
    h.state.location = { ...SESSION, isTimeKeeper: true };
    render(<TimeKeeperScoring />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByText('SECONDS')).toBeInTheDocument();
  });
});

// User rules 2026-11-07: on the Scorer's sheet the judges' marks are view-only
// (only the Time is the Scorer's), each athlete's time can be locked once they
// have performed, and a tolerance hit pops up as it does for the Senior Judge.
describe('Scorer sheet — view-only marks and time locks', () => {
  beforeEach(() => {
    h.state.judge = { name: 'Asha Patil', ...seat('Scorer'), allAssignments: [seat('Scorer')] };
    h.state.location = { ...SESSION, isScorer: true };
  });

  const loaded = async () => {
    render(<ScorerScoring />);
    await screen.findByText('Riya Mane');
    await waitFor(() => expect(screen.getByLabelText(/^Scorer/)).toHaveValue('Asha Patil'));
  };
  const time = (name) => screen.getByLabelText(`${name}, Time`);
  const recordTime = (playerId, seconds) => act(() => h.socket.fire('time_recorded', {
    playerId, teamId: 'team-a', apparatus: 'Rope Mallakhamb', seconds,
  }));

  it('draws every judge mark and deduction read-only; only the Time is editable', async () => {
    await loaded();
    expect(time('Riya Mane')).toBeEnabled();
    for (const cell of ['Senior Judge', 'Judge 1', 'Judge 2', 'Time deduction', 'Other deduction']) {
      expect(screen.getByLabelText(`Riya Mane, ${cell}`)).toBeDisabled();
    }
  });

  it('still shows a judge\'s mark arriving over the socket', async () => {
    await loaded();
    act(() => h.socket.fire('score_updated', {
      playerId: 'p1', apparatus: 'Rope Mallakhamb', judgeType: 'Judge 1', score: 8.5,
    }));
    await waitFor(() => expect(screen.getByLabelText('Riya Mane, Judge 1')).toHaveValue('8.5'));
  });

  it('a locked time ignores a later Time Keeper reading and survives a reload', async () => {
    await loaded();
    recordTime('p1', 75);
    await waitFor(() => expect(time('Riya Mane')).toHaveValue('75'));

    fireEvent.click(screen.getByRole('button', { name: 'Lock time for Riya Mane' }));
    expect(screen.getByRole('button', { name: 'Unlock time for Riya Mane' })).toHaveAttribute('aria-pressed', 'true');
    expect(time('Riya Mane')).toBeDisabled();

    // A late stopwatch reading for her is ignored…
    recordTime('p1', 95);
    expect(time('Riya Mane')).toHaveValue('75');
    // …and so is a reload of the saved sheet (another device saved).
    act(() => h.socket.fire('scores_saved_notification', {}));
    await screen.findByText('Riya Mane');
    await waitFor(() => expect(time('Riya Mane')).toHaveValue('75'));

    // The other athlete is untouched by her lock.
    recordTime('p2', 84);
    await waitFor(() => expect(time('Purva Thorat')).toHaveValue('84'));
  });

  it('keeps the lock across a refresh, and unlocks on a second tap', async () => {
    await loaded();
    recordTime('p1', 70);
    await waitFor(() => expect(time('Riya Mane')).toHaveValue('70'));
    fireEvent.click(screen.getByRole('button', { name: 'Lock time for Riya Mane' }));

    // A refresh: the page goes away and comes back.
    cleanup();
    await loaded();
    expect(time('Riya Mane')).toHaveValue('70');
    expect(time('Riya Mane')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Unlock time for Riya Mane' }));
    expect(time('Riya Mane')).toBeEnabled();
  });

  it('will not lock an empty time', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Lock time for Purva Thorat' }));
    expect(screen.getByRole('button', { name: 'Lock time for Purva Thorat' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Scorer sheet — tolerance popup', () => {
  beforeEach(() => {
    h.state.judge = { name: 'Asha Patil', ...seat('Scorer'), allAssignments: [seat('Scorer')] };
    h.state.location = { ...SESSION, isScorer: true };
    // A 4-judge panel: tolerance applies (COP §3.4 is 4- and 5-judge only).
    h.state.judges = [
      { _id: 's1', judgeType: 'Senior Judge', name: 'Ravi Gaikwad', apparatus: 'Rope Mallakhamb' },
      { _id: 's2', judgeType: 'Judge 1', name: 'Yatin Nachre', apparatus: 'Rope Mallakhamb' },
      { _id: 's3', judgeType: 'Judge 2', name: 'Swapnil Chaugole', apparatus: 'Rope Mallakhamb' },
      { _id: 's4', judgeType: 'Judge 3', name: 'Laxman Shinde', apparatus: 'Rope Mallakhamb' },
    ];
  });

  const mark = (judgeType, score) => act(() => h.socket.fire('score_updated', {
    playerId: 'p1', apparatus: 'Rope Mallakhamb', judgeType, score,
  }));

  it('pops up when the whole panel has marked and the Chief is out of tolerance', async () => {
    render(<ScorerScoring />);
    await screen.findByText('Riya Mane');

    // Evaluators 8.40 ×3 against a Chief of 9.40: gap 1.00, far over the band.
    mark('Senior Judge', 9.4);
    mark('Judge 1', 8.4);
    mark('Judge 2', 8.4);
    // Not yet: one seat has not marked.
    expect(screen.queryByText('Tolerance Limit Exceeded')).not.toBeInTheDocument();

    mark('Judge 3', 8.4);
    expect(await screen.findByText('Tolerance Limit Exceeded')).toBeInTheDocument();
    expect(screen.getByText('Tolerance hit — Riya Mane')).toBeInTheDocument();

    // Dismissed, it stays listed above the sheet and re-opens from there.
    fireEvent.click(screen.getByRole('button', { name: 'Understood — Dismiss' }));
    expect(screen.queryByText('Tolerance Limit Exceeded')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tolerance exceeded — Riya Mane/ }));
    expect(screen.getByText('Tolerance Limit Exceeded')).toBeInTheDocument();
  });

  it('stays quiet when the panel is within tolerance', async () => {
    render(<ScorerScoring />);
    await screen.findByText('Riya Mane');
    mark('Senior Judge', 8.5);
    mark('Judge 1', 8.4);
    mark('Judge 2', 8.5);
    mark('Judge 3', 8.6);
    // A longer wait: four socket marks re-render the sheet, slow under a full parallel run.
    await waitFor(() => expect(screen.getByLabelText('Riya Mane, Judge 3')).toHaveValue('8.6'), { timeout: 4000 });
    expect(screen.queryByText('Tolerance Limit Exceeded')).not.toBeInTheDocument();
  });
});
