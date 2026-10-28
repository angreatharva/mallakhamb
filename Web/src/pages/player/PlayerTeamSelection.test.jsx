/**
 * Joining a team in a meet that has closed (423 COMPETITION_LOCKED).
 *
 * The server puts the reason under `data.error.message`, and the page read only
 * `data.message`, so a player was told "Failed to join team" instead of that
 * the meet had closed. The api-client lifts the reason onto the error as
 * `competitionLockedMessage`; the toast has to use it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import { playerAPI } from '@/services/api';
import PlayerTeamSelection from './PlayerTeamSelection';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/api', () => ({
  playerAPI: { getTeams: vi.fn(), updateTeam: vi.fn(), getTeamAtLevel: vi.fn() },
}));
const h = vi.hoisted(() => ({ navigate: vi.fn(), login: vi.fn(), fetchAssigned: vi.fn(() => Promise.resolve()), level: null }));
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => h.navigate }));
vi.mock('@/contexts/CompetitionContext', () => ({
  useCompetition: () => ({ currentCompetition: null, fetchAssignedCompetitions: h.fetchAssigned, selectedLevel: h.level }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'p1', firstName: 'Aarav' }, login: h.login }),
}));
vi.mock('@/infrastructure/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const LOCKED = '"Spring Open" closed at the end of 2026-10-04 and is now locked. Only a super admin can make further changes.';

const renderPage = (path = '/player/select-team?competitionId=c1') => render(
  <MemoryRouter initialEntries={[path]}>
    <PlayerTeamSelection />
  </MemoryRouter>
);

describe('PlayerTeamSelection join errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerAPI.getTeams.mockResolvedValue({ data: { data: [{ _id: 't1', name: 'IMSA-C' }] } });
  });

  it('shows the locked-meet reason when the join is refused with 423', async () => {
    playerAPI.updateTeam.mockRejectedValue(Object.assign(new Error('Request failed with status code 423'), {
      response: { status: 423, data: { success: false, error: { code: 'COMPETITION_LOCKED', message: LOCKED } } },
      isCompetitionLocked: true,
      competitionLockedMessage: LOCKED,
    }));

    renderPage();
    fireEvent.click(await screen.findByText('IMSA-C'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(LOCKED));
  });

  it("still shows the server's message for other refusals", async () => {
    playerAPI.updateTeam.mockRejectedValue({ response: { status: 400, data: { message: 'Team is full' } } });

    renderPage();
    fireEvent.click(await screen.findByText('IMSA-C'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Team is full'));
  });

  it('Level, Team, Competition: after joining, the stored user gets the team and the meet comes next', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    playerAPI.updateTeam.mockResolvedValue({ data: { data: {} } });

    renderPage('/player/select-team');
    fireEvent.click(await screen.findByText('IMSA-C'));

    await waitFor(() => expect(h.login).toHaveBeenCalledWith(expect.objectContaining({ _id: 'p1', team: 't1' }), null, 'player'));
    expect(h.fetchAssigned).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(h.navigate).toHaveBeenCalledWith('/player/select-competition', { replace: true });
    vi.useRealTimers();
  });

  it('a meet already chosen: back to its dashboard after joining', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    playerAPI.updateTeam.mockResolvedValue({ data: { data: {} } });

    renderPage('/player/select-team?competitionId=c1');
    fireEvent.click(await screen.findByText('IMSA-C'));

    await waitFor(() => expect(h.login).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(600);
    expect(h.navigate).toHaveBeenCalledWith('/player/dashboard?competitionId=c1', { replace: true });
    vi.useRealTimers();
  });
});

describe('PlayerTeamSelection — a team is final per level', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.level = 'district';
    playerAPI.getTeams.mockResolvedValue({ data: { data: [{ _id: 't1', name: 'IMSA-C' }, { _id: 't2', name: 'SGAM' }] } });
  });

  it('a level that already has a team: shown read-only, Continue goes on to the meet', async () => {
    playerAPI.getTeamAtLevel.mockResolvedValue({ data: { data: { level: 'district', final: true, team: { _id: 't2', name: 'SGAM', coach: { name: 'Ravi Kale' } }, suggested: null } } });

    renderPage('/player/select-team');
    expect(await screen.findByText('Your District Team')).toBeInTheDocument();
    expect(screen.getByText('SGAM')).toBeInTheDocument();
    expect(screen.queryByText('IMSA-C')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/player/select-competition', { replace: true }));
    expect(h.login).toHaveBeenCalledWith(expect.objectContaining({ levelTeams: [{ level: 'district', team: 't2' }] }), null, 'player');
    expect(playerAPI.updateTeam).not.toHaveBeenCalled();
  });

  it('a level with no team yet: says the choice is final, suggests the old team, and sends the level', async () => {
    playerAPI.getTeamAtLevel.mockResolvedValue({ data: { data: { level: 'district', final: false, team: null, suggested: { _id: 't2', name: 'SGAM' } } } });
    const levelTeams = [{ level: 'district', team: 't2' }];
    playerAPI.updateTeam.mockResolvedValue({ data: { data: { player: { team: 't2', levelTeams } } } });

    renderPage('/player/select-team');
    expect(await screen.findByText('Final for District')).toBeInTheDocument();
    expect(await screen.findByText('Your team · Join')).toBeInTheDocument();

    fireEvent.click(screen.getByText('SGAM'));
    await waitFor(() => expect(playerAPI.updateTeam).toHaveBeenCalledWith({ teamId: 't2', level: 'district' }));
    await waitFor(() => expect(h.login).toHaveBeenCalledWith(expect.objectContaining({ levelTeams }), null, 'player'));
  });
});
