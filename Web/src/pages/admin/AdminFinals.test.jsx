/**
 * Admin → Finals (docs/qualification-plan.md): the lists the engine filled,
 * the team-cap note, withdraw (the next in rank fills in), a stale warning.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { adminAPI } from '@/services/user/admin.api';
import { withAllAges, typesForAgeGroup, ageMatches } from '@/hooks/useAgeGroups';
import AdminFinals from './AdminFinals';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/user/admin.api', () => ({
  adminAPI: { finals: { list: vi.fn(), recompute: vi.fn(), withdraw: vi.fn(), reinstate: vi.fn(), draw: vi.fn(), finalize: vi.fn(), finalizeAll: vi.fn(), reopen: vi.fn() } },
}));
vi.mock('@/services/user/super-admin.api', () => ({ superAdminAPI: { finals: {} } }));
vi.mock('@/contexts/CompetitionContext', () => ({ useCompetition: () => ({ currentCompetition: null }) }));

const final = {
  _id: 'f1', label: 'Competition III (Apparatus) — Boys Under 14 · Pole', competitionType: 'competition_3', gender: 'Male',
  ageGroup: 'Under14', apparatus: 'Pole Mallakhamb', status: 'set', blockers: [],
  qualifiers: [
    { player: 'p1', playerName: 'Aarav Patil', team: { _id: 't1', name: 'SGAM' }, rank: 1, score: 9.4 },
    { player: 'p2', playerName: 'Rohan Joshi', team: { _id: 't1', name: 'SGAM' }, rank: 2, score: 9.1 },
  ],
  tied: [], skipped: [{ player: 'p3', playerName: 'Omkar Rane', team: { name: 'SGAM' }, reason: 'team_cap' }],
  withdrawn: [], slices: [], waitingFor: [], staleSince: null, staleNote: '',
};

describe('AdminFinals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAPI.finals.list.mockResolvedValue({ data: { data: { finals: [final, { ...final, _id: 'f2', competitionType: 'competition_2', gender: 'Male', ageGroup: 'AllAges', label: 'Competition II (All Round) — Boys All ages', qualifiers: [], skipped: [], status: 'waiting', waitingFor: ['Under 12: SGAM has not locked Competition I Pole'] }] } } });
  });

  it('shows the qualifiers with their team, and who the team cap passed over', async () => {
    render(<AdminFinals competitionId="c1" />);
    expect(await screen.findByText('Aarav Patil')).toBeInTheDocument();
    expect(screen.getByText(/Passed over \(2 per team already in\): Omkar Rane \(SGAM\)/)).toBeInTheDocument();
  });

  it('withdraw asks first, then the list reloads', async () => {
    adminAPI.finals.withdraw.mockResolvedValue({ data: { data: {} } });
    render(<AdminFinals competitionId="c1" />);
    fireEvent.click((await screen.findAllByText('Withdraw'))[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(adminAPI.finals.withdraw).toHaveBeenCalledWith('f1', { playerId: 'p1', competitionId: 'c1' }));
    expect(adminAPI.finals.list).toHaveBeenCalledTimes(2);
  });

  it('Finalize all shows what it will enter first, then finalizes', async () => {
    adminAPI.finals.finalizeAll.mockResolvedValue({ data: { data: { finalized: [{ _id: 'f1' }], notReady: [{ _id: 'f2' }] } } });
    render(<AdminFinals competitionId="c1" />);
    fireEvent.click(await screen.findByText('Finalize all ready finals'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('finalize-summary').textContent).toMatch(/Aarav Patil \(SGAM\).*Passed over: Omkar Rane/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finalize all ready' }));
    await waitFor(() => expect(adminAPI.finals.finalizeAll).toHaveBeenCalledWith('c1'));
  });

  it('a final that is not ready has no Finalize button, and says why', async () => {
    adminAPI.finals.list.mockResolvedValue({ data: { data: { finals: [{ ...final, blockers: ['SGAM: Competition I Pole not locked yet'] }] } } });
    render(<AdminFinals competitionId="c1" />);
    expect(await screen.findByText(/Not ready: SGAM: Competition I Pole not locked yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finalize' })).toBeNull();
  });

  it('a waiting Competition II final says what it waits for', async () => {
    render(<AdminFinals competitionId="c1" />);
    fireEvent.click(await screen.findByText('II · All Round'));
    expect(await screen.findByText('Under 12: SGAM has not locked Competition I Pole')).toBeInTheDocument();
  });
});

describe('All ages in category pickers', () => {
  const meet = { competitionTypes: ['competition_1', 'competition_2'] };
  const types = [{ value: 'competition_1' }, { value: 'competition_2' }];

  it('adds All ages only to a meet running Competition II (not a legacy one)', () => {
    expect(withAllAges([{ value: 'Under14' }], meet).map((o) => o.value)).toEqual(['Under14', 'AllAges']);
    expect(withAllAges([{ value: 'Under14' }], { ...meet, legacyFinals: true }).map((o) => o.value)).toEqual(['Under14']);
  });

  it('All ages is Competition II only, and Competition II is All ages only', () => {
    expect(typesForAgeGroup(types, { value: 'AllAges' }, meet).map((o) => o.value)).toEqual(['competition_2']);
    expect(typesForAgeGroup(types, { value: 'Under14' }, meet).map((o) => o.value)).toEqual(['competition_1']);
  });

  it('every age group belongs to All ages', () => {
    expect(ageMatches('Under10', 'AllAges')).toBe(true);
    expect(ageMatches('Under10', 'Under12')).toBe(false);
  });
});
