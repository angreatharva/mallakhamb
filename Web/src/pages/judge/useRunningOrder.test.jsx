import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));
vi.mock('@/services/ordering/lots.api', () => ({ judgeLotsAPI: { getOrder: vi.fn() } }));

import { useOrderedTeamRows } from './useRunningOrder';
import { indexPerformanceOrder } from '@/utils/ordering/performanceOrder';

const rows = [
  { id: 'a::pole', playerId: 'a', name: 'Aarav', apparatus: 'Pole' },
  { id: 'a::rope', playerId: 'a', name: 'Aarav', apparatus: 'Rope' },
  { id: 'b::pole', playerId: 'b', name: 'Bhavesh', apparatus: 'Pole' },
  { id: 'c::pole', playerId: 'c', name: 'Chetan', apparatus: 'Pole' },
];

describe('useOrderedTeamRows', () => {
  it('puts the team rows in running order, keeping an athlete\'s apparatus rows together', () => {
    const order = indexPerformanceOrder({ teams: [{ _id: 't1', position: 0, players: [
      { _id: 'c', position: 0, lotNo: 3 }, { _id: 'a', position: 1, lotNo: 1 }, { _id: 'b', position: 2, lotNo: 2 },
    ] }] });
    const { result } = renderHook(() => useOrderedTeamRows(rows, 't1', order));
    expect(result.current.map((r) => r.id)).toEqual(['c::pole', 'a::pole', 'a::rope', 'b::pole']);
  });

  it('re-sorts when a new order arrives (a live re-sequence)', () => {
    let order = indexPerformanceOrder({ teams: [{ _id: 't1', players: [{ _id: 'a', position: 0 }, { _id: 'b', position: 1 }, { _id: 'c', position: 2 }] }] });
    const { result, rerender } = renderHook(({ o }) => useOrderedTeamRows(rows, 't1', o), { initialProps: { o: order } });
    expect(result.current[0].playerId).toBe('a');
    order = indexPerformanceOrder({ teams: [{ _id: 't1', players: [{ _id: 'b', position: 0 }, { _id: 'c', position: 1 }, { _id: 'a', position: 2 }] }] });
    rerender({ o: order });
    expect(result.current.map((r) => r.playerId)).toEqual(['b', 'c', 'a', 'a']);
  });

  it('keeps squad order when no order has been set', () => {
    const { result } = renderHook(() => useOrderedTeamRows(rows, 't1', indexPerformanceOrder(null)));
    expect(result.current.map((r) => r.name)).toEqual(['Aarav', 'Aarav', 'Bhavesh', 'Chetan']);
  });
});
