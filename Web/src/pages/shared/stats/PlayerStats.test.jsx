/**
 * The player's Stats tab: a career view across meets, one meet explained when
 * a meet is chosen, and an invitation — not an error — before any result is
 * published.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ player: vi.fn() }));
vi.mock('@/services/api', () => ({ statsAPI: { player: h.player } }));

import PlayerStats from './PlayerStats';

const performance = (over) => ({
  key: over.competitionId,
  competitionType: 'Competition I',
  gender: 'Male',
  ageGroup: 'Under14',
  apparatus: 'Pole Mallakhamb',
  teamName: 'Akola',
  playerId: 'p1',
  playerName: 'Aarav Patil',
  sections: { difficulty: 3.2, combination: 1.4, execution: 3.4, bonus: 0 },
  deductions: { time: 0, other: 0 },
  category: { average: 7.9, best: 8.6, sectionAverage: { difficulty: 3.1, combination: 1.5, execution: 3.3 }, sectionBest: { difficulty: 3.6, combination: 1.6, execution: 3.7 } },
  checklist: { of: 2, items: [{ id: 1, metBy: 2 }, { id: 2, metBy: 0 }] },
  elements: { a: 4, b: 5, c: 1 },
  panel: [{ seat: 'Senior Judge', total: 8, counted: false }, { seat: 'Judge 1', total: 8.1, counted: true }],
  ...over,
});

const payload = {
  player: { id: 'p1', name: 'Aarav Patil' },
  competitions: [{ id: 'm1', name: 'District 2025', date: '2025-11-01' }, { id: 'm2', name: 'State 2026', date: '2026-01-01' }],
  performances: [
    performance({ competitionId: 'm1', competitionName: 'District 2025', date: '2025-11-01', finalScore: 7.6, rank: 9, fieldSize: 20 }),
    performance({ competitionId: 'm2', competitionName: 'State 2026', date: '2026-01-01', finalScore: 8.3, rank: 3, fieldSize: 22 }),
  ],
  checklists: { 'Pole Mallakhamb': [{ id: 1, rule: 'All parts of the Pole should be properly utilized.', penalty: 0.1 }, { id: 2, rule: 'At least B mount.', penalty: 0.1 }] },
};

const renderAt = (search = '') => render(
  <MemoryRouter initialEntries={[`/player/profile?tab=stats${search}`]}>
    <PlayerStats />
  </MemoryRouter>
);

beforeEach(() => h.player.mockReset());

describe('PlayerStats', () => {
  it('shows the career: personal best, best placing and the meet-by-meet line', async () => {
    h.player.mockResolvedValue({ data: { data: payload } });
    renderAt();
    expect(await screen.findByText('Score, meet by meet')).toBeInTheDocument();
    expect(screen.getByText('8.30')).toBeInTheDocument();
    expect(screen.getByText('3rd')).toBeInTheDocument();
    expect(screen.getByText(/Your best: 8\.30 on Pole at State 2026\. Pole is up 0\.70 since your first meet\./)).toBeInTheDocument();
    expect(screen.getByText('Where the points come from')).toBeInTheDocument();
  });

  it('explains one meet: sections against the category, and the missed requirement', async () => {
    h.player.mockResolvedValue({ data: { data: payload } });
    renderAt('&meet=m2');
    expect(await screen.findByText('Combination requirements — 1 missed')).toBeInTheDocument();
    expect(screen.getByLabelText(/Difficulty: 3\.20 of 3\.80, category average 3\.10, category best 3\.60/)).toBeInTheDocument();
    expect(screen.getByLabelText('Missed')).toBeInTheDocument();
    expect(screen.queryByText('Score, meet by meet')).not.toBeInTheDocument();
  });

  it('invites rather than errors before anything is published', async () => {
    h.player.mockResolvedValue({ data: { data: { ...payload, performances: [], competitions: [] } } });
    renderAt();
    expect(await screen.findByText('No published scores yet')).toBeInTheDocument();
  });
});
