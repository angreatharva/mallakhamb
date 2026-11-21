/**
 * Walk-in desk v2 (docs/walk-in-desk-v2-plan.md): unlocking a submitted
 * team, the three ways to add players, and the new-players-only price.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { deskAPI } from '@/services/user/desk.api';
import DeskTeamStatusStep from './DeskTeamStatusStep';
import DeskFormStep from './DeskFormStep';
import DeskPayStep from './DeskPayStep';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/services/user/desk.api', () => ({
  deskAPI: {
    teamStatus: vi.fn(), unlockTeam: vi.fn(), importExcel: vi.fn(), excelTemplate: vi.fn(),
    defaultPassword: vi.fn(), saveRows: vi.fn(), submit: vi.fn(), getDraft: vi.fn(), scan: vi.fn(),
  },
}));

const coach = { _id: 'k1', firstName: 'Ravi', lastName: 'Kale', team: { _id: 't1', name: 'Shivaji Club' } };

const draft = (extra = {}) => ({
  _id: 'd1', status: 'draft', rows: [], scans: [], blocking: 0, imports: [], squad: [],
  coach: { _id: 'k1', name: 'Ravi Kale' }, team: { name: 'Shivaji Club' },
  competition: { formPages: [], sections: [], customAgeGroups: [], feePhase: 'regular', lateFeePerPlayer: 0 },
  ...extra,
});

describe('DeskTeamStatusStep', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the paid squad and unlocks only with a reason', async () => {
    deskAPI.teamStatus.mockResolvedValue({ data: { data: {
      isSubmitted: true, paymentStatus: 'completed', paymentAmount: 400, players: 4, paidPlayers: 4,
      feeWindow: { canPay: true, isLate: true, lateFeePerPlayer: 50 },
      squad: [{ _id: 'p1', name: 'Aarav Patil', loginId: 'aarav.patil.150614', gender: 'Male', ageGroup: 'Under12', paid: true }],
    } } });
    deskAPI.unlockTeam.mockResolvedValue({ data: { data: { paidPlayers: 4 } } });
    const onUnlocked = vi.fn();
    render(<DeskTeamStatusStep competitionId="c1" coach={coach} onUnlocked={onUnlocked} onBack={vi.fn()} />);

    expect(await screen.findByText(/Aarav Patil/)).toBeInTheDocument();
    expect(screen.getByText(/late fee of ₹50 per new player/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Unlock team/ }));
    const confirm = screen.getByRole('button', { name: /^Unlock$/ });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Two players walked in' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledWith(coach));
    expect(deskAPI.unlockTeam).toHaveBeenCalledWith({ competitionId: 'c1', coachId: 'k1', reason: 'Two players walked in' });
  });

  it('a closed fee window disables the unlock', async () => {
    deskAPI.teamStatus.mockResolvedValue({ data: { data: { isSubmitted: true, players: 1, squad: [], feeWindow: { canPay: false } } } });
    render(<DeskTeamStatusStep competitionId="c1" coach={coach} onUnlocked={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /Unlock team/ })).toBeDisabled();
  });
});

describe('DeskFormStep: three ways to add players', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the desk shows Scan, Excel and Register player; a coach sees only the scan', () => {
    const { unmount } = render(<DeskFormStep draft={draft()} ocr={{ enabled: true, healthy: true }} onDraft={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Scan form' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Excel' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Register player' })).toBeInTheDocument();
    unmount();
    render(<DeskFormStep draft={draft()} ocr={{ enabled: true, healthy: true }} onDraft={vi.fn()} who="coach" />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Photograph the form')).toBeInTheDocument();
  });

  it('an Excel file from the coach step is imported once, and bad cells are listed by row', async () => {
    const file = new File(['x'], 'ravi.xlsx');
    const onDraft = vi.fn();
    const onExcelUsed = vi.fn();
    deskAPI.importExcel.mockResolvedValue({ data: { data: {
      draft: draft({ imports: [{ fileName: 'ravi.xlsx', rows: 2 }] }), added: 2, skipped: 0,
      errors: [{ excelRow: 4, field: 'dateOfBirth', message: 'Could not read "31-02-2014" as a date (use DD-MM-YYYY)' }],
    } } });
    render(<DeskFormStep draft={draft()} ocr={null} onDraft={onDraft} excelFile={file} onExcelUsed={onExcelUsed} />);
    expect(await screen.findByText(/Excel row 4: Could not read/)).toBeInTheDocument();
    expect(deskAPI.importExcel).toHaveBeenCalledTimes(1);
    expect(deskAPI.importExcel).toHaveBeenCalledWith('d1', file);
    expect(onExcelUsed).toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Excel' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Register player shows the coach\'s default password on request', async () => {
    deskAPI.defaultPassword.mockResolvedValue({ data: { data: { readable: true, password: 'Shivaji2026' } } });
    render(<DeskFormStep draft={draft()} ocr={null} onDraft={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Register player' }));
    fireEvent.click(screen.getByRole('button', { name: /Show default password/ }));
    expect(await screen.findByText('Shivaji2026')).toBeInTheDocument();
    expect(deskAPI.defaultPassword).toHaveBeenCalledWith('k1');
  });

  it('players already in the squad are listed as paid', () => {
    render(<DeskFormStep draft={draft({ squad: [{ _id: 'p1', name: 'Om Joshi', loginId: 'om.joshi.010114', gender: 'Male', ageGroup: 'Under12', paid: true }] })} ocr={null} onDraft={vi.fn()} />);
    expect(screen.getByText('Already in the squad')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });
});

describe('DeskPayStep: only new players are charged', () => {
  it('shows the new-player fee and the late fee per new player', () => {
    render(<DeskPayStep onDraft={vi.fn()} draft={draft({
      status: 'submitted',
      competition: { feePhase: 'late', lateFeePerPlayer: 50 },
      registration: { players: 5, paidPlayers: 4, amountDue: 150, fees: { newPlayers: 1, paidPlayers: 4, entryFees: 100, lateFeePerPlayer: 50, lateFeeTotal: 50, total: 150 } },
    })} />);
    expect(screen.getByText('Entry fee · 1 new player')).toBeInTheDocument();
    expect(screen.getByText('Late fee · ₹50 × 1')).toBeInTheDocument();
    expect(screen.getByText(/4 players · not charged again/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Take payment · ₹150/ })).toBeInTheDocument();
  });

  it('nothing new to pay: submit without payment', () => {
    render(<DeskPayStep onDraft={vi.fn()} draft={draft({
      status: 'submitted',
      registration: { players: 4, paidPlayers: 4, amountDue: 0, fees: { newPlayers: 0, paidPlayers: 4, entryFees: 0, lateFeePerPlayer: 0, lateFeeTotal: 0, total: 0 } },
    })} />);
    expect(screen.getByRole('button', { name: /nothing new to pay/ })).toBeInTheDocument();
  });
});
