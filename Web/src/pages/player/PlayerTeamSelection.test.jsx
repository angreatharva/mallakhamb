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
  playerAPI: { getTeams: vi.fn(), updateTeam: vi.fn() },
}));
vi.mock('@/contexts/CompetitionContext', () => ({
  useCompetition: () => ({ currentCompetition: null }),
}));
vi.mock('@/infrastructure/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const LOCKED = '"Spring Open" closed at the end of 2026-10-04 and is now locked. Only a super admin can make further changes.';

const renderPage = () => render(
  <MemoryRouter initialEntries={['/player/select-team?competitionId=c1']}>
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
});
