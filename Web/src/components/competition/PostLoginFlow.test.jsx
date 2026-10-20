/**
 * The post-login level → competition flow, for every role (players pick a
 * team in between: Level → Team → Competition).
 *
 *   - The level chooser shows it is still counting, instead of "0 competitions"
 *     on every card until the fetch lands.
 *   - One competition at the chosen level: straight through to the dashboard,
 *     the list never drawn. More than one: the list, as before.
 *   - A coach passes through only into a meet the team is already entered in;
 *     entering a new one stays a deliberate tap.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  ctx: {},
  user: { _id: 'u1' },
  judgeList: null,
  playerList: null,
  coachList: [],
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }));
vi.mock('@/contexts/CompetitionContext', () => ({ useCompetition: () => h.ctx }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user, login: vi.fn() }) }));
vi.mock('@/hooks/useResponsive', () => ({ useReducedMotion: () => true }));
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: { getItem: () => 'token', setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('@/services/public/judge.api', () => ({
  judgeAPI: {
    getAssignedCompetitions: () => h.judgeList,
    setCompetition: vi.fn(() => Promise.resolve({ data: { data: { token: 't', competition: {} } } })),
    getAssignments: () => Promise.resolve({ data: { data: [] } }),
  },
}));
vi.mock('@/services/auth/auth.api', () => ({
  authAPI: { setCompetition: vi.fn(() => Promise.resolve({ data: { data: { token: 't' } } })) },
}));
vi.mock('@/services/api', () => ({
  playerAPI: { getOpenCompetitions: () => h.playerList },
  coachAPI: {
    getOpenCompetitions: () => Promise.resolve({ data: h.coachList }),
    getTeams: () => Promise.resolve({ data: [{ _id: 'team-1', name: 'SGAM-A' }] }),
    registerTeamForCompetition: vi.fn(),
  },
}));

import LevelSelectionScreen from './LevelSelectionScreen';
import CompetitionSelectionScreen from './CompetitionSelectionScreen';

const meet = (id, level = 'district', name = `Meet ${id}`) => ({ _id: id, name, level, place: 'Mumbai' });
const reply = (list) => Promise.resolve({ data: { data: list } });

beforeEach(() => {
  h.navigate.mockClear();
  h.user = { _id: 'u1' };
  h.ctx = {
    assignedCompetitions: [],
    selectedLevel: 'district',
    setSelectedLevel: vi.fn(),
    isLoading: false,
    switchCompetition: vi.fn(() => Promise.resolve()),
    mergeAssignedAndSelectCompetition: vi.fn(),
    fetchAssignedCompetitions: vi.fn(() => Promise.resolve()),
  };
});

describe('Level chooser — counting', () => {
  it('shows "Counting…" on every card until the competitions arrive, then the counts', async () => {
    let resolve;
    h.judgeList = new Promise((r) => { resolve = r; });
    render(<LevelSelectionScreen userType="judge" />);

    expect(screen.getAllByText('Counting…')).toHaveLength(6);
    expect(screen.queryByText('0 competitions')).not.toBeInTheDocument();

    await act(async () => resolve({ data: { data: [meet('c1'), meet('c2', 'state')] } }));
    expect(screen.queryByText('Counting…')).not.toBeInTheDocument();
    expect(screen.getAllByText('1 competition')).toHaveLength(2);
  });
});

describe('Level chooser — where a player goes next', () => {
  const pickDistrictAndContinue = async () => {
    h.playerList = reply([meet('c1')]);
    render(<LevelSelectionScreen userType="player" />);
    await screen.findByText('1 competition');
    screen.getByText('District').click();
    screen.getByText('Continue').click();
  };

  it('no team yet: the team comes next', async () => {
    await pickDistrictAndContinue();
    expect(h.navigate).toHaveBeenCalledWith('/player/select-team');
  });

  it('already on a team: straight to the competition', async () => {
    h.user = { _id: 'u1', team: { _id: 'team-1' } };
    await pickDistrictAndContinue();
    expect(h.navigate).toHaveBeenCalledWith('/player/select-competition');
  });
});

describe('Competition chooser — one competition goes straight through', () => {
  it('judge: one meet at the level opens the dashboard without drawing the list', async () => {
    h.judgeList = reply([meet('c1', 'district', 'SGAM-TRIALS-1')]);
    render(<CompetitionSelectionScreen userType="judge" />);

    expect(await screen.findByText('Opening SGAM-TRIALS-1…')).toBeInTheDocument();
    expect(screen.queryByText(/Continue to Dashboard/i)).not.toBeInTheDocument();
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/judge/dashboard?competitionId=c1'));
  });

  it('judge: two meets at the level show the list', async () => {
    h.judgeList = reply([meet('c1'), meet('c2')]);
    render(<CompetitionSelectionScreen userType="judge" />);

    expect(await screen.findByText('Meet c1')).toBeInTheDocument();
    expect(screen.getByText('Meet c2')).toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('never flashes "nothing at this level" while the list is still loading', () => {
    h.judgeList = new Promise(() => {});
    render(<CompetitionSelectionScreen userType="judge" />);
    expect(screen.getByText('Loading competitions...')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing at/)).not.toBeInTheDocument();
  });

  it('player with no team: sent to pick a team first (Level → Team → Competition)', async () => {
    h.playerList = reply([meet('c1')]);
    render(<CompetitionSelectionScreen userType="player" />);
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/player/select-team', { replace: true }));
    expect(h.navigate).not.toHaveBeenCalledWith(expect.stringContaining('competitionId'));
  });

  it('player with a team: one meet the team is in opens the dashboard', async () => {
    h.user = { _id: 'u1', team: 'team-1' };
    h.ctx.assignedCompetitions = [meet('c1')];
    render(<CompetitionSelectionScreen userType="player" />);
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/player/dashboard?competitionId=c1'));
  });

  it('admin: one assigned meet goes straight to the dashboard', async () => {
    h.ctx.assignedCompetitions = [meet('c1')];
    render(<CompetitionSelectionScreen userType="admin" />);
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/admin/dashboard?competitionId=c1'));
  });

  it('coach: one meet the team is NOT in yet stays a choice (it would register the team)', async () => {
    h.coachList = [meet('c1')];
    h.ctx.assignedCompetitions = [];
    render(<CompetitionSelectionScreen userType="coach" />);

    expect(await screen.findByText('Meet c1')).toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('coach: one meet the team is already in goes straight through', async () => {
    h.coachList = [meet('c1')];
    h.ctx.assignedCompetitions = [meet('c1')];
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { token: 't' } }) }));
    render(<CompetitionSelectionScreen userType="coach" />);

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/coach/dashboard?competitionId=c1'));
  });
});

