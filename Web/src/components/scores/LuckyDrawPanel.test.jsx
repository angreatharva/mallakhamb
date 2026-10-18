/**
 * The admin records a physical lucky draw (COP 1.12.4) for a tie the rules
 * left standing. The server flags the group; the panel sends the drawn order.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LuckyDrawPanel, { luckyDrawGroups } from './LuckyDrawPanel';

const tied = (playerId, playerName, extra = {}) => ({
  uid: `u-${playerId}`,
  playerId,
  playerName,
  teamName: `Team ${playerName}`,
  rank: 2,
  finalScore: 8.25,
  tieBreakInfo: { unresolved: true, awaitingLuckyDraw: true, tieGroupKey: 'a,b', method: 'identical_panel_scores' },
  ...extra,
});

describe('LuckyDrawPanel', () => {
  it('renders nothing when no tie awaits or holds a draw', () => {
    const { container } = render(
      <LuckyDrawPanel rows={[{ playerId: 'x', rank: 1, finalScore: 9 }]} onRecord={vi.fn()} onClear={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('a tie with missing data is not offered for a draw', () => {
    const row = tied('a', 'Asha', { tieBreakInfo: { unresolved: true, awaitingLuckyDraw: false, tieGroupKey: 'a,b' } });
    expect(luckyDrawGroups([row])).toEqual([]);
  });

  it('sends the order the admin set, first place first', async () => {
    const onRecord = vi.fn().mockResolvedValue();
    render(<LuckyDrawPanel rows={[tied('a', 'Asha'), tied('b', 'Bina')]} onRecord={onRecord} onClear={vi.fn()} />);

    expect(screen.getByText('Lucky draw needed')).toBeInTheDocument();
    expect(screen.getByText('Level for 2nd on 8.25')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move Bina up' }));
    fireEvent.click(screen.getByRole('button', { name: /Save draw result/ }));

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
    expect(onRecord.mock.calls[0][0].key).toBe('a,b');
    expect(onRecord.mock.calls[0][1]).toEqual(['b', 'a']);
  });

  it('a recorded draw shows its order and can be cleared', async () => {
    const drawn = (playerId, playerName, position) => tied(playerId, playerName, {
      rank: 1 + position,
      tieBreakInfo: { method: 'lucky_draw', unresolved: false, awaitingLuckyDraw: false, luckyDrawPosition: position, tieGroupKey: 'a,b' },
    });
    const onClear = vi.fn().mockResolvedValue();
    render(<LuckyDrawPanel rows={[drawn('a', 'Asha', 2), drawn('b', 'Bina', 1)]} onRecord={vi.fn()} onClear={onClear} />);

    expect(screen.getByText('Lucky draw recorded')).toBeInTheDocument();
    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names[0]).toContain('Bina');
    expect(names[1]).toContain('Asha');

    fireEvent.click(screen.getByRole('button', { name: /Clear draw/ }));
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });
});
