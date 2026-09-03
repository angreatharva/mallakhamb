/**
 * The judging-category ladder — what the picker is allowed to offer.
 *
 * Three things were wrong at once and each is covered here: a judge seated at
 * two meets was never asked which one, the age groups were a merged list that
 * ignored the chosen gender, and the apparatus question could not be reached.
 */

import { describe, it, expect } from 'vitest';
import {
  seatCoversCategory,
  competitionsForJudge,
  gendersForJudge,
  ageGroupsForJudge,
  competitionTypesForJudge,
  apparatusOptionsForJudge,
} from './judgeCategoryOptions';

const seat = (overrides = {}) => ({
  competition: 'meet-1',
  gender: 'Male',
  ageGroup: 'Under14',
  competitionTypes: ['competition_1'],
  apparatus: null,
  judgeType: 'Judge 1',
  judgeNo: 2,
  ...overrides,
});

describe('seatCoversCategory', () => {
  it('treats a seat with no competition types as covering all of them', () => {
    const scorer = seat({ judgeType: 'Scorer', judgeNo: 6, competitionTypes: [] });
    expect(seatCoversCategory(scorer, { competitionType: 'competition_3' })).toBe(true);
  });

  it('treats a seat with no apparatus as covering every apparatus', () => {
    expect(seatCoversCategory(seat(), { apparatus: 'Rope Mallakhamb' })).toBe(true);
  });

  it('refuses an apparatus the seat is not for', () => {
    const roped = seat({ apparatus: 'Rope Mallakhamb' });
    expect(seatCoversCategory(roped, { apparatus: 'Pole Mallakhamb' })).toBe(false);
  });

  it('matches a competition that arrives populated as well as one that arrives as an id', () => {
    const populated = seat({ competition: { _id: 'meet-1', name: 'Nationals' } });
    expect(seatCoversCategory(populated, { competitionId: 'meet-1' })).toBe(true);
    expect(seatCoversCategory(seat(), { competitionId: 'meet-1' })).toBe(true);
    expect(seatCoversCategory(seat(), { competitionId: 'meet-2' })).toBe(false);
  });
});

describe('competitionsForJudge', () => {
  it('lists every meet the judge is seated at, once each', () => {
    const meets = competitionsForJudge([
      seat({ competition: { _id: 'meet-1', name: 'Nationals' } }),
      seat({ competition: { _id: 'meet-1', name: 'Nationals' }, ageGroup: 'Under18' }),
      seat({ competition: { _id: 'meet-2', name: 'State' } }),
    ]);

    expect(meets.map((m) => m.name)).toEqual(['Nationals', 'State']);
  });

  it('still yields an entry when the assignment carried only an id', () => {
    expect(competitionsForJudge([seat()])).toEqual([{ _id: 'meet-1' }]);
  });
});

describe('gendersForJudge', () => {
  it('offers only the genders held at the chosen meet', () => {
    const assignments = [
      seat({ competition: 'meet-1', gender: 'Male' }),
      seat({ competition: 'meet-2', gender: 'Female', ageGroup: 'Under16' }),
    ];

    expect(gendersForJudge(assignments, { competitionId: 'meet-1' })).toEqual(['Male']);
    expect(gendersForJudge(assignments, { competitionId: 'meet-2' })).toEqual(['Female']);
  });
});

describe('ageGroupsForJudge', () => {
  const bothGenders = [
    seat({ gender: 'Male', ageGroup: 'Under18' }),
    seat({ gender: 'Male', ageGroup: 'Above18' }),
    seat({ gender: 'Male', ageGroup: 'Under12' }),
    seat({ gender: 'Female', ageGroup: 'Under16' }),
    seat({ gender: 'Female', ageGroup: 'Above16' }),
  ];

  it('offers a Male category only the brackets boys run, in age order', () => {
    expect(ageGroupsForJudge(bothGenders, { gender: 'Male' }))
      .toEqual(['Under12', 'Under18', 'Above18']);
  });

  it('offers a Female category only the brackets girls run', () => {
    expect(ageGroupsForJudge(bothGenders, { gender: 'Female' }))
      .toEqual(['Under16', 'Above16']);
  });

  it('keeps a bracket the judge really is seated in even when the gender does not run it', () => {
    // Only reachable through legacy data — the admin screen derives its own
    // list from the same rule. Hiding it would strand a real panel.
    const odd = [seat({ gender: 'Male', ageGroup: 'Under14' }), seat({ gender: 'Male', ageGroup: 'Under16' })];
    expect(ageGroupsForJudge(odd, { gender: 'Male' })).toEqual(['Under14', 'Under16']);
  });

  it('falls back to age order across both lists when no gender is chosen yet', () => {
    expect(ageGroupsForJudge(bothGenders, {}))
      .toEqual(['Under12', 'Under16', 'Under18', 'Above16', 'Above18']);
  });
});

describe('competitionTypesForJudge', () => {
  it('offers every type the judge holds a seat for in this category', () => {
    const assignments = [
      seat({ competitionTypes: ['competition_1'] }),
      seat({ competitionTypes: ['competition_3'], judgeNo: 3 }),
      seat({ gender: 'Female', ageGroup: 'Under16', competitionTypes: ['competition_2'] }),
    ];

    expect(competitionTypesForJudge(assignments, { gender: 'Male', ageGroup: 'Under14' }))
      .toEqual(['competition_1', 'competition_3']);
  });

  it('gives a Scorer every type, since their seat names none', () => {
    const scorer = [seat({ judgeType: 'Scorer', judgeNo: 6, competitionTypes: [] })];
    expect(competitionTypesForJudge(scorer, { gender: 'Male', ageGroup: 'Under14' }))
      .toEqual(['competition_1', 'competition_2', 'competition_3']);
  });
});

describe('apparatusOptionsForJudge', () => {
  const category = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

  it("offers the meet's configured apparatus, in COP order", () => {
    // Panels are seated for a category, so this is the normal case: no seat
    // names an apparatus and the meet's own config decides what is on offer.
    expect(apparatusOptionsForJudge([seat()], category, {
      configured: ['Rope Mallakhamb', 'Pole Mallakhamb'],
      registered: ['Hanging Mallakhamb'],
    })).toEqual(['Pole Mallakhamb', 'Rope Mallakhamb']);
  });

  it('falls back to what the entered athletes are registered for', () => {
    expect(apparatusOptionsForJudge([seat()], category, {
      configured: [],
      registered: ['Rope Mallakhamb'],
    })).toEqual(['Rope Mallakhamb']);
  });

  it('never offers an "all apparatus" answer', () => {
    const options = apparatusOptionsForJudge([seat()], category, {
      configured: ['Pole Mallakhamb', 'Rope Mallakhamb'],
    });

    expect(options).not.toContain('');
    expect(options.every((name) => name.endsWith('Mallakhamb'))).toBe(true);
  });

  it('narrows to a legacy apparatus-scoped seat, ignoring the meet config', () => {
    // Admins cannot create these any more, but rows written before panels
    // became category-wide still carry an apparatus, and a judge holding only
    // the Rope seat must not be offered Pole.
    const roped = [seat({ apparatus: 'Rope Mallakhamb', competitionTypes: ['competition_3'] })];

    expect(apparatusOptionsForJudge(
      roped,
      { ...category, competitionType: 'competition_3' },
      { configured: ['Pole Mallakhamb', 'Rope Mallakhamb'] }
    )).toEqual(['Rope Mallakhamb']);
  });

  it('does not narrow when one covering seat is category-wide', () => {
    // A null-apparatus seat covers every apparatus — the server says so in
    // `assignmentCoversCategory` — so a mixture must not hide the rest.
    const mixed = [seat({ apparatus: 'Rope Mallakhamb' }), seat({ judgeNo: 3 })];

    expect(apparatusOptionsForJudge(mixed, category, {
      configured: ['Pole Mallakhamb', 'Rope Mallakhamb'],
    })).toEqual(['Pole Mallakhamb', 'Rope Mallakhamb']);
  });

  it("drops Hanging Mallakhamb from a women's category (COP §11 / 1.8.2)", () => {
    expect(apparatusOptionsForJudge(
      [seat({ gender: 'Female', ageGroup: 'Under16' })],
      { ...category, gender: 'Female', ageGroup: 'Under16' },
      { configured: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'] }
    )).toEqual(['Pole Mallakhamb', 'Rope Mallakhamb']);
  });

  it('canonicalizes the short names a seat may have been written with', () => {
    expect(apparatusOptionsForJudge([seat({ apparatus: 'Rope' })], category, {}))
      .toEqual(['Rope Mallakhamb']);
  });
});
