/**
 * The public results card shows one breakdown — Difficulty, Combination,
 * Execution, Originality — at every panel size, averaged over the slips the
 * panel rule counts (see averageSlipBreakdown).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useResponsive', () => ({ useReducedMotion: () => true }));
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return { ...actual, useInView: () => true };
});

import PlayerRankingBoard from './PlayerRankingBoard';

const slip = (judgeRole, difficulty, combination, execution) => ({
  judgeRole,
  difficultyScore: difficulty,
  combinationScore: combination,
  executionScore: execution,
  bonusScore: 0,
  total: difficulty + combination + execution,
});

const row = (panelSize, judgeSlips) => ({
  uid: `r${panelSize}`,
  playerId: 'p1',
  playerName: 'Riya Mane',
  teamName: 'SGAM-TRIALS-TEAM-A',
  rank: 1,
  finalScore: 8.5,
  panelSize,
  judgeSlips,
});

/** The value shown on a pill, found by its label. */
const pill = (label) => screen.getByText(label).previousElementSibling.textContent;

describe('PlayerRankingBoard — score breakdown', () => {
  it('5 judges: the middle two of Judges 1–4, Senior Judge excluded', () => {
    render(<PlayerRankingBoard players={[row(5, [
      slip('SR_JUDGE', 1.0, 1.0, 1.0),
      slip('J1', 3.8, 1.6, 4.0),
      slip('J2', 3.8, 1.6, 3.0),
      slip('J3', 3.6, 1.4, 2.6),
      slip('J4', 2.0, 1.0, 1.0),
    ])]} />);

    expect(pill('Difficulty')).toBe('3.70');
    expect(pill('Combination')).toBe('1.50');
    expect(pill('Execution')).toBe('2.80');
    expect(pill('Originality')).toBe('0.00');
    expect(screen.getByText(/Senior Judge excluded, highest and lowest dropped/)).toBeInTheDocument();
    // The per-judge marks it used to list for 4/5-judge panels are gone.
    expect(screen.queryByText('J1')).not.toBeInTheDocument();
  });

  it('3 judges: every slip, each section divided by 3', () => {
    render(<PlayerRankingBoard players={[row(3, [
      slip('SR_JUDGE', 3.8, 1.6, 3.0),
      slip('J1', 3.6, 1.4, 2.7),
      slip('J2', 3.4, 1.2, 2.4),
    ])]} />);

    expect(pill('Difficulty')).toBe('3.60');
    expect(pill('Execution')).toBe('2.70');
    expect(screen.getByText('Averaged from 3 judge slips')).toBeInTheDocument();
  });
});
