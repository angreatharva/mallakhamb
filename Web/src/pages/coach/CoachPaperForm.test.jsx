/**
 * The coach's paper form: one form per competition, started from the page,
 * never opened by just visiting it (docs/team-per-level-plan.md step 4).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { paperFormAPI } from '@/services/user/paper-form.api';
import CoachPaperForm from './CoachPaperForm';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/user/paper-form.api', () => ({
  paperFormAPI: { current: vi.fn(), open: vi.fn(), ocrStatus: vi.fn(), formPdf: vi.fn(), cancelDraft: vi.fn(), slip: vi.fn() },
}));
vi.mock('@/contexts/CompetitionContext', () => ({ useCompetition: () => ({ currentCompetition: { _id: 'c1', name: 'Pune District Open' } }) }));
vi.mock('@/components/competition/CompetitionLockBanner', () => ({ default: () => null }));
vi.mock('@/pages/desk/DeskFormStep', () => ({ default: ({ who }) => <p>form step for {who}</p> }));

const draft = { _id: 'd1', status: 'draft', rows: [], competition: { formPages: [] }, scans: [], blocking: 0 };

describe('CoachPaperForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paperFormAPI.ocrStatus.mockResolvedValue({ data: { data: { enabled: true, healthy: true } } });
  });

  it('a visit opens nothing; Start a form opens the coach\'s form', async () => {
    paperFormAPI.current.mockResolvedValue({ data: { data: { draft: null } } });
    paperFormAPI.open.mockResolvedValue({ data: { data: draft } });
    render(<MemoryRouter><CoachPaperForm /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Start a form'));
    expect(await screen.findByText('form step for coach')).toBeInTheDocument();
    expect(paperFormAPI.open).toHaveBeenCalledTimes(1);
  });

  it('an unfinished form is resumed', async () => {
    paperFormAPI.current.mockResolvedValue({ data: { data: { draft } } });
    render(<MemoryRouter><CoachPaperForm /></MemoryRouter>);
    expect(await screen.findByText('form step for coach')).toBeInTheDocument();
    expect(paperFormAPI.open).not.toHaveBeenCalled();
  });

  it('a submitted squad says why the form is unavailable', async () => {
    paperFormAPI.current.mockResolvedValue({ data: { data: { draft: null } } });
    paperFormAPI.open.mockRejectedValue({ response: { data: { error: { message: 'Your squad for this competition is already submitted.' } } } });
    render(<MemoryRouter><CoachPaperForm /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Start a form'));
    await waitFor(() => expect(screen.getByText('Your squad for this competition is already submitted.')).toBeInTheDocument());
  });
});
