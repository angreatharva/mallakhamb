import { describe, expect, it } from 'vitest';
import { apparatusLabel, playerScoresFor, rowFor, rowKey, sheetRows } from './adminSheet';

const team = {
  _id: 't1',
  name: 'SGAM-A',
  players: [
    {
      player: { _id: 'p1', firstName: 'Atharva', lastName: 'Angre', gender: 'Male' },
      gender: 'Male', ageGroup: 'Above18',
      apparatus: { competition_1: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'], competition_2: ['Pole Mallakhamb'] },
    },
    {
      player: { _id: 'p2', firstName: 'Mayur', lastName: 'Pashte', gender: 'Male' },
      gender: 'Male', ageGroup: 'Above18',
      apparatus: { competition_1: ['Rope Mallakhamb'] },
    },
    {
      player: { _id: 'p3', firstName: 'Other', lastName: 'Group', gender: 'Male' },
      gender: 'Male', ageGroup: 'Under14',
      apparatus: { competition_1: ['Pole Mallakhamb'] },
    },
  ],
};

describe('sheetRows', () => {
  it('gives an athlete one row per apparatus they are entered for, in this competition type', () => {
    const rows = sheetRows(team, 'Male', 'Above18', 'competition_1');
    expect(rows.map((r) => r.id)).toEqual([
      'p1|Pole Mallakhamb', 'p1|Hanging Mallakhamb', 'p1|Rope Mallakhamb', 'p2|Rope Mallakhamb',
    ]);
    expect(rows[1].name).toBe('Atharva Angre · Hanging');
    expect(rows[1].athleteName).toBe('Atharva Angre');
  });

  it('follows the competition type', () => {
    expect(sheetRows(team, 'Male', 'Above18', 'competition_2').map((r) => r.id)).toEqual(['p1|Pole Mallakhamb']);
  });

  it('puts an entry that names no apparatus on Pole, as the server does', () => {
    const bare = { _id: 't', name: 'T', players: [{ player: { _id: 'p9', firstName: 'A', lastName: 'B' }, gender: 'Male', ageGroup: 'Under10' }] };
    expect(sheetRows(bare, 'Male', 'Under10', 'competition_1').map((r) => r.id)).toEqual(['p9|Pole Mallakhamb']);
  });
});

describe('rowFor', () => {
  const rows = sheetRows(team, 'Male', 'Above18', 'competition_1');

  it('matches the athlete AND the apparatus', () => {
    expect(rowFor(rows, { playerId: 'p1', apparatus: 'Rope Mallakhamb' })).toBe('p1|Rope Mallakhamb');
  });

  it('never lands a stored Rope row on the athlete\'s Pole row', () => {
    expect(rowFor(rows, { playerId: 'p2', apparatus: 'Pole Mallakhamb' })).toBeNull();
  });

  it('reads an older row without an apparatus as Pole, as the server filed it', () => {
    expect(rowFor(rows, { playerId: 'p1' })).toBe('p1|Pole Mallakhamb');
    // No Pole row for this athlete: their only row.
    expect(rowFor(rows, { playerId: 'p2' })).toBe('p2|Rope Mallakhamb');
  });
});

describe('playerScoresFor', () => {
  it('posts every row with its apparatus — the field whose absence corrupted the sheet', () => {
    const rows = sheetRows(team, 'Male', 'Above18', 'competition_1');
    const scores = Object.fromEntries(rows.map((r, i) => [r.id, { time: '85', seniorJudge: String(8 + i / 10), judge1: '8', judge2: '8', deduction: '', otherDeduction: '' }]));
    const average = (inputs) => ({ executionAvg: 8, baseScore: 0, baseScoreApplied: false, tolerance: 0, average: Number(inputs.seniorJudge) });
    const out = playerScoresFor(rows, scores, average, (inputs) => Number(inputs.seniorJudge).toFixed(2));

    expect(out).toHaveLength(4);
    expect(out.map((r) => `${r.playerId}|${r.apparatus}`)).toEqual(rows.map((r) => r.id));
    expect(out.map((r) => r.finalScore)).toEqual([8, 8.1, 8.2, 8.3]);
    expect(out[0].playerName).toBe('Atharva Angre');
  });
});

describe('labels', () => {
  it('keys and shortens apparatus names', () => {
    expect(rowKey('p1', 'Rope Mallakhamb')).toBe('p1|Rope Mallakhamb');
    expect(rowKey('p1')).toBe('p1|Pole Mallakhamb');
    expect(apparatusLabel('Hanging Mallakhamb')).toBe('Hanging');
  });
});
