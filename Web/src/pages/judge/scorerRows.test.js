import { describe, it, expect } from 'vitest';
import { buildScorerRows } from './scorerRows';

const athlete = (id, first, apparatus, { gender = 'Male', ageGroup = 'Above18' } = {}) => ({
  player: { _id: id, firstName: first, lastName: 'Angre', gender },
  ageGroup,
  apparatus,
});

const team = (players) => ({ _id: 'team-1', name: 'SGAM-A', players });

const ALL_THREE = { competition_1: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'] };

const forCategory = (extra) => ({
  gender: 'Male',
  ageGroup: 'Above18',
  competitionType: 'competition_1',
  ...extra,
});

describe('buildScorerRows', () => {
  it('shows only the seat apparatus when the squad is entered for all three', () => {
    /*
     * The reported bug. A Scorer seated for Pole opened the sheet and found
     * nine rows for three athletes — Pole, Hanging and Rope each — under
     * columns headed with the Pole panel's judges.
     */
    const rows = buildScorerRows(forCategory({
      team: team([
        athlete('a1', 'Atharva', ALL_THREE),
        athlete('a2', 'Preetesh', ALL_THREE),
        athlete('a3', 'Mayur', ALL_THREE),
      ]),
      apparatus: 'Pole Mallakhamb',
    }));

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.apparatus === 'Pole Mallakhamb')).toBe(true);
    expect(rows.map((r) => r.name)).toEqual(['Atharva Angre', 'Preetesh Angre', 'Mayur Angre']);
  });

  it('gives each apparatus its own row id, so Rope cannot land in the Pole row', () => {
    const pole = buildScorerRows(forCategory({
      team: team([athlete('a1', 'Atharva', ALL_THREE)]),
      apparatus: 'Pole Mallakhamb',
    }));
    const rope = buildScorerRows(forCategory({
      team: team([athlete('a1', 'Atharva', ALL_THREE)]),
      apparatus: 'Rope Mallakhamb',
    }));

    expect(pole[0].id).not.toBe(rope[0].id);
    expect(pole[0].playerId).toBe(rope[0].playerId);
  });

  it('drops an athlete who is not entered for the seat apparatus', () => {
    // Rather than showing them with inputs that would record a performance
    // they are not down for.
    const rows = buildScorerRows(forCategory({
      team: team([
        athlete('a1', 'Atharva', { competition_1: ['Pole Mallakhamb'] }),
        athlete('a2', 'Preetesh', { competition_1: ['Rope Mallakhamb'] }),
      ]),
      apparatus: 'Pole Mallakhamb',
    }));

    expect(rows.map((r) => r.name)).toEqual(['Atharva Angre']);
  });

  it('keeps every apparatus when the session predates the picker', () => {
    // A session stored before the apparatus rung existed carries none, and the
    // sheet must not silently empty itself.
    const rows = buildScorerRows(forCategory({
      team: team([athlete('a1', 'Atharva', ALL_THREE)]),
      apparatus: undefined,
    }));

    expect(rows).toHaveLength(3);
  });

  it('still gives one row to an athlete with no apparatus recorded', () => {
    const rows = buildScorerRows(forCategory({
      team: team([athlete('a1', 'Atharva', undefined)]),
      apparatus: 'Pole Mallakhamb',
    }));

    expect(rows).toHaveLength(1);
    expect(rows[0].apparatus).toBe('Pole Mallakhamb');
  });

  it('names the apparatus beside the squad only when the athlete does several', () => {
    const many = buildScorerRows(forCategory({
      team: team([athlete('a1', 'Atharva', ALL_THREE)]),
      apparatus: 'Pole Mallakhamb',
    }));
    const one = buildScorerRows(forCategory({
      team: team([athlete('a1', 'Atharva', { competition_1: ['Pole Mallakhamb'] })]),
      apparatus: 'Pole Mallakhamb',
    }));

    // Narrowing must not cost the label that says WHICH of their three sheets
    // this is, so it keys off what was entered rather than what is on screen.
    expect(many[0].teamName).toBe('SGAM-A · Pole Mallakhamb');
    expect(one[0].teamName).toBe('SGAM-A');
  });

  it('leaves out the other categories in the squad', () => {
    const rows = buildScorerRows(forCategory({
      team: team([
        athlete('a1', 'Atharva', ALL_THREE),
        athlete('a2', 'Sara', ALL_THREE, { gender: 'Female', ageGroup: 'Above16' }),
        athlete('a3', 'Junior', ALL_THREE, { ageGroup: 'Under14' }),
      ]),
      apparatus: 'Pole Mallakhamb',
    }));

    expect(rows.map((r) => r.name)).toEqual(['Atharva Angre']);
  });
});
