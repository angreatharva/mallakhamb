/**
 * Super Admin → Player teams: a correction blocked by open squad entries
 * offers to remove them first (docs/team-per-level-plan.md step 3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { superAdminAPI } from '@/services/api';
import SuperAdminPlayerTeams from './SuperAdminPlayerTeams';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/api', () => ({
  superAdminAPI: {
    getAllTeams: vi.fn(),
    playerTeams: { search: vi.fn(), detail: vi.fn(), correct: vi.fn(), removeEntries: vi.fn(), conflicts: vi.fn(), resolveConflict: vi.fn(), history: vi.fn() },
  },
}));

const levels = ['district', 'state', 'national', 'international', 'dso', 'university'].map((level) => ({
  level, label: level === 'dso' ? 'DSO' : level[0].toUpperCase() + level.slice(1),
  team: level === 'district' ? { _id: 't1', name: 'Wrong Club' } : null, via: 'squad-entry', setAt: '2026-10-01',
}));
const player = { _id: 'p1', name: 'Aarav Patil', loginId: 'aarav.patil.140313', gender: 'Male', levels, entries: [], conflicts: [] };

describe('SuperAdminPlayerTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    superAdminAPI.getAllTeams.mockResolvedValue({ data: { data: [{ _id: 't1', name: 'Wrong Club' }, { _id: 't2', name: 'Right Club' }] } });
    superAdminAPI.playerTeams.search.mockResolvedValue({ data: { data: { players: [player] } } });
    superAdminAPI.playerTeams.detail.mockResolvedValue({ data: { data: player } });
  });

  it('search → player → correct; blocked by open entries, remove them, then save', async () => {
    superAdminAPI.playerTeams.correct
      .mockRejectedValueOnce({ response: { data: { error: { details: { reason: 'ENTERED_FOR_OLD_TEAM', competitions: [{ _id: 'c1', name: 'Pune District Open' }] } } } } })
      .mockResolvedValueOnce({ data: { data: { ...player, levels: levels.map((l) => (l.level === 'district' ? { ...l, team: { _id: 't2', name: 'Right Club' } } : l)) } } });
    superAdminAPI.playerTeams.removeEntries.mockResolvedValue({ data: { data: { removed: [{ _id: 'c1', name: 'Pune District Open', paid: false }], player } } });

    render(<SuperAdminPlayerTeams />);
    fireEvent.change(screen.getByLabelText('Name, Player ID or email'), { target: { value: 'aarav' } });
    fireEvent.click(screen.getByText('Search'));
    fireEvent.click(await screen.findByText('Aarav Patil'));

    const district = await screen.findByTestId('level-district');
    fireEvent.click(district.querySelector('button'));
    fireEvent.change(screen.getByLabelText(/District team/), { target: { value: 't2' } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Paper form misread' } });
    fireEvent.click(screen.getByText('Save correction'));

    fireEvent.click(await screen.findByText('Remove from those squads'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(superAdminAPI.playerTeams.removeEntries).toHaveBeenCalledWith('p1', { level: 'district' }));

    fireEvent.click(screen.getByText('Save correction'));
    await waitFor(() => expect(superAdminAPI.playerTeams.correct).toHaveBeenLastCalledWith('p1', { level: 'district', teamId: 't2', reason: 'Paper form misread' }));
    expect(await screen.findByText('Right Club')).toBeInTheDocument();
  });
});
