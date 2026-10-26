/**
 * The sentences above the Stats graphs are what most people actually read, so
 * every one of them is pinned here against small, hand-checkable inputs.
 */
import { describe, expect, it } from 'vitest';
import {
  athleteCards, biggestGapSentence, careerSeries, checklistMisses, deviationWords, filterPerformances,
  leanDetail, leanSentence, meetsOf, styleWord, summarize, trainingFocus, trendSentence,
} from './statsModel';

const perf = (over) => ({
  key: `${over.competitionId}-${over.apparatus}-${over.playerId || 'p1'}`,
  playerId: 'p1',
  playerName: 'Aarav Patil',
  teamId: 't1',
  teamName: 'Akola',
  gender: 'Male',
  ageGroup: 'Under14',
  apparatus: 'Pole Mallakhamb',
  sections: { difficulty: 3.0, combination: 1.4, execution: 3.2, bonus: 0 },
  ...over,
});

const M1 = { competitionId: 'm1', competitionName: 'District', date: '2025-11-01' };
const M2 = { competitionId: 'm2', competitionName: 'State', date: '2026-01-01' };
const M3 = { competitionId: 'm3', competitionName: 'Nationals', date: '2026-08-01' };

describe('filters and meets', () => {
  const list = [
    perf({ ...M2, finalScore: 8 }),
    perf({ ...M1, finalScore: 7.5 }),
    perf({ ...M1, apparatus: 'Rope Mallakhamb', finalScore: 7.1 }),
  ];

  it('orders meets by date, not by arrival', () => {
    expect(meetsOf(list).map((m) => m.name)).toEqual(['District', 'State']);
  });

  it('filters by meet and apparatus; an empty apparatus set means all', () => {
    expect(filterPerformances(list, { meet: 'm1' })).toHaveLength(2);
    expect(filterPerformances(list, { apparatus: new Set(['Rope Mallakhamb']) })).toHaveLength(1);
    expect(filterPerformances(list, { meet: 'all', apparatus: new Set() })).toHaveLength(3);
  });
});

describe('career line', () => {
  const list = [
    perf({ ...M1, finalScore: 7.5, rank: 9, fieldSize: 20 }),
    perf({ ...M2, finalScore: 8.0, rank: 4, fieldSize: 22 }),
    perf({ ...M2, finalScore: 8.2, competitionType: 'Competition II' }),
    perf({ ...M3, finalScore: 8.3 }),
    perf({ ...M1, apparatus: 'Rope Mallakhamb', finalScore: 7.0 }),
    perf({ ...M3, apparatus: 'Rope Mallakhamb', finalScore: 7.9 }),
  ];

  it('one line per apparatus, the best score at each meet, and the personal best', () => {
    const { meets, series, best } = careerSeries(list);
    expect(meets).toHaveLength(3);
    const pole = series.find((s) => s.id === 'Pole Mallakhamb');
    expect(pole.points.map((p) => p.y)).toEqual([7.5, 8.2, 8.3]);
    expect(pole.slot).toBe(1);
    const rope = series.find((s) => s.id === 'Rope Mallakhamb');
    expect(rope.points.map((p) => p.x)).toEqual([0, 2]);
    expect(best).toMatchObject({ seriesId: 'Pole Mallakhamb', score: 8.3, meet: 'Nationals' });
  });

  it('says which apparatus moved most', () => {
    expect(trendSentence(careerSeries(list).series)).toBe('Rope is up 0.90 since your first meet.');
    expect(trendSentence([{ label: 'Pole', points: [{ y: 8 }] }])).toBeNull();
  });
});

describe('sections', () => {
  it('names the section with the most points left on the table', () => {
    const list = [perf({ ...M1, sections: { difficulty: 3.4, combination: 1.6, execution: 3.0 } })];
    // D leaves 0.40, C 0.00, E 1.40.
    expect(biggestGapSentence(list)).toBe('Most points are left in Execution: on average you win 68% of its 4.40, leaving 1.40 on the table.');
  });

  it('marks the section where an athlete trails the SQUAD, not the one everyone finds hard', () => {
    const list = [
      perf({ ...M1, playerId: 'a', playerName: 'A', sections: { difficulty: 3.6, combination: 1.6, execution: 3.0 } }),
      perf({ ...M1, playerId: 'b', playerName: 'B', sections: { difficulty: 3.0, combination: 1.6, execution: 3.0 } }),
    ];
    const focus = trainingFocus(list);
    expect(focus.find((f) => f.name === 'A').weakest).toBeNull();
    expect(focus.find((f) => f.name === 'B').weakest).toBe('difficulty');
  });
});

describe('summaries', () => {
  it('headline numbers and improvement from first to latest meet', () => {
    const s = summarize([perf({ ...M1, finalScore: 7.5, rank: 9 }), perf({ ...M2, finalScore: 8.1, rank: 2 })]);
    expect(s.best.finalScore).toBe(8.1);
    expect(s.bestRank.rank).toBe(2);
    expect(s.podiums).toBe(1);
    expect(s.improvement).toBeCloseTo(0.6, 6);
  });

  it('coach cards put the most improved first', () => {
    const cards = athleteCards([
      perf({ ...M1, playerId: 'a', playerName: 'A', finalScore: 8 }),
      perf({ ...M2, playerId: 'a', playerName: 'A', finalScore: 8.1 }),
      perf({ ...M1, playerId: 'b', playerName: 'B', finalScore: 7 }),
      perf({ ...M2, playerId: 'b', playerName: 'B', finalScore: 7.8 }),
    ]);
    expect(cards.map((c) => c.name)).toEqual(['B', 'A']);
  });

  it('counts a checklist item as missed when most counted judges marked it so', () => {
    const list = [
      perf({ ...M1, checklist: { of: 2, items: [{ id: 1, metBy: 0 }, { id: 2, metBy: 1 }] } }),
      perf({ ...M2, checklist: { of: 2, items: [{ id: 1, metBy: 2 }, { id: 2, metBy: 2 }] } }),
    ];
    const [pole] = checklistMisses(list, { 'Pole Mallakhamb': [{ id: 1, rule: 'One' }, { id: 2, rule: 'Two' }] });
    expect(pole.items.find((i) => i.id === 1).missed).toBe(1);
    expect(pole.items.find((i) => i.id === 2).missed).toBe(0);
  });
});

describe('judge wording', () => {
  it('describes style without judging it', () => {
    expect(styleWord(-0.3).word).toBe('Stricter than the panel');
    expect(styleWord(0.05).word).toBe('In line with the panel');
    expect(styleWord(0.2).word).toBe('More generous than the panel');
    expect(deviationWords(-0.12)).toBe('0.12 below the panel');
  });

  it('states a lean as a plain sentence, with no pronouns', () => {
    expect(leanSentence({ judgeName: 'Priya Deshmukh', teamName: 'Akola', lean: 0.4 }))
      .toBe('Priya Deshmukh marks Akola higher than other teams');
    expect(leanSentence({ judgeName: 'R', teamName: 'T', lean: -0.4 })).toBe('R marks T lower than other teams');
    expect(leanDetail({ groupMean: 0.42, othersMean: 0.02, n: 8 }))
      .toBe('On 8 performances: +0.42 against the rest of the panel for this team, +0.02 for every other team.');
  });
});
