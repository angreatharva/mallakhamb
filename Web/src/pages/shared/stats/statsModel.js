/**
 * Pure helpers that turn the /api/stats payloads into what the graphs draw and
 * the plain-English sentences above them. No React here, so every sentence a
 * user reads is unit-tested (statsModel.test.js).
 */
import { APPARATUS, APPARATUS_ORDER, SECTIONS, apparatusLabel, fmt, signed } from '@/components/charts/chartTheme';

const byDate = (a, b) => new Date(a.date || 0) - new Date(b.date || 0);
const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

/** Performances matching the filter row. `meet` 'all' or a competition id; `apparatus` a Set of keys (empty = all). */
export function filterPerformances(performances, { meet = 'all', apparatus = new Set(), team = 'all' } = {}) {
  return performances.filter((p) => (meet === 'all' || p.competitionId === meet)
    && (apparatus.size === 0 || apparatus.has(p.apparatus))
    && (team === 'all' || p.teamId === team));
}

/** The apparatus that appear, in the fixed Pole / Rope / Hanging order. */
export const apparatusPresent = (performances) =>
  APPARATUS_ORDER.filter((key) => performances.some((p) => p.apparatus === key));

/** The meets a set of performances spans, oldest first. */
export function meetsOf(performances) {
  const seen = new Map();
  for (const p of performances) {
    if (!seen.has(p.competitionId)) seen.set(p.competitionId, { id: p.competitionId, name: p.competitionName, date: p.date });
  }
  return [...seen.values()].sort(byDate);
}

/**
 * One line per apparatus across meets: the best final score at each meet.
 * @returns {{meets: Array, series: Array, best: {seriesId, x, score, meet}|null}}
 */
export function careerSeries(performances, valueOf = (p) => p.finalScore) {
  const meets = meetsOf(performances);
  const index = new Map(meets.map((m, i) => [m.id, i]));
  let best = null;
  const series = apparatusPresent(performances).map((app) => {
    const points = [];
    for (const m of meets) {
      const here = performances.filter((p) => p.apparatus === app && p.competitionId === m.id);
      if (!here.length) continue;
      const top = here.reduce((a, b) => (valueOf(b) > valueOf(a) ? b : a));
      const y = valueOf(top);
      const point = { x: index.get(m.id), y, tip: top.rank ? `${ordinalShort(top.rank)} of ${top.fieldSize}` : undefined };
      points.push(point);
      if (!best || y > best.score) best = { seriesId: app, x: point.x, score: y, meet: m.name };
    }
    return { id: app, label: apparatusLabel(app), slot: APPARATUS[app].slot, dash: APPARATUS[app].dash, points };
  });
  return { meets, series, best };
}

const ordinalShort = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** First-to-latest change per apparatus, for the takeaway. */
export function trendSentence(series) {
  const parts = series
    .filter((s) => s.points.length >= 2)
    .map((s) => ({ label: s.label, delta: s.points[s.points.length - 1].y - s.points[0].y }));
  if (parts.length === 0) return null;
  const strongest = parts.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
  if (Math.abs(strongest.delta) < 0.005) return `${strongest.label} is holding steady across your meets.`;
  return strongest.delta > 0
    ? `${strongest.label} is up ${fmt(strongest.delta)} since your first meet.`
    : `${strongest.label} is down ${fmt(-strongest.delta)} since your first meet.`;
}

/** Average share of each section's maximum won, across performances. */
export function sectionShares(performances) {
  const withSections = performances.filter((p) => p.sections);
  return SECTIONS.map((s) => {
    const avg = mean(withSections.map((p) => p.sections[s.key]));
    return { ...s, average: avg, share: avg == null ? null : avg / s.max, left: avg == null ? null : s.max - avg };
  });
}

/** "Your biggest gap is Execution…" — the section with the most points left on the table. */
export function biggestGapSentence(performances) {
  const shares = sectionShares(performances).filter((s) => s.average != null);
  if (shares.length === 0) return null;
  const gap = shares.reduce((a, b) => (b.left > a.left ? b : a));
  return `Most points are left in ${gap.label}: on average you win ${Math.round(gap.share * 100)}% of its ${fmt(gap.max)}, leaving ${fmt(gap.left)} on the table.`;
}

/** Headline numbers for a list of performances (mirrors the server summary). */
export function summarize(performances) {
  if (!performances.length) return null;
  const best = performances.reduce((a, b) => (b.finalScore > a.finalScore ? b : a));
  const ranked = performances.filter((p) => p.rank);
  const bestRank = ranked.length ? ranked.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
  const meets = meetsOf(performances);
  const meetAvg = meets.map((m) => mean(performances.filter((p) => p.competitionId === m.id).map((p) => p.finalScore)));
  return {
    best,
    bestRank,
    average: mean(performances.map((p) => p.finalScore)),
    meets: meets.length,
    count: performances.length,
    podiums: performances.filter((p) => p.rank && p.rank <= 3).length,
    improvement: meetAvg.length >= 2 ? meetAvg[meetAvg.length - 1] - meetAvg[0] : null,
    trend: meetAvg,
  };
}

/** One card per athlete for the coach grid, most improved first. */
export function athleteCards(performances) {
  const byAthlete = new Map();
  for (const p of performances) {
    if (!byAthlete.has(p.playerId)) byAthlete.set(p.playerId, []);
    byAthlete.get(p.playerId).push(p);
  }
  return [...byAthlete.entries()].map(([playerId, list]) => {
    const s = summarize(list);
    return {
      playerId,
      name: list[0].playerName,
      teamId: list[0].teamId,
      teamName: list[0].teamName,
      category: `${list[0].gender === 'Female' ? 'Girls' : 'Boys'} ${list[0].ageGroup}`,
      ...s,
    };
  }).sort((a, b) => (b.improvement ?? -99) - (a.improvement ?? -99) || b.average - a.average);
}

/**
 * Each athlete's share of each section's maximum at one meet — the coach's
 * training-focus grid. `weakest` names the section where the athlete is
 * furthest below the squad's own average (null when nowhere noticeably).
 */
export function trainingFocus(performances) {
  const squad = Object.fromEntries(sectionShares(performances).map((s) => [s.key, s.share]));
  return athleteCards(performances).map((athlete) => {
    const mine = performances.filter((p) => p.playerId === athlete.playerId);
    const shares = Object.fromEntries(sectionShares(mine).map((s) => [s.key, s.share]));
    // Weakest RELATIVE to the squad: a section every athlete finds hard (say,
    // Execution) is not this athlete's particular weakness.
    const gaps = SECTIONS.filter((s) => shares[s.key] != null && squad[s.key] != null)
      .map((s) => ({ key: s.key, gap: shares[s.key] - squad[s.key] }));
    const worst = gaps.length ? gaps.reduce((a, b) => (b.gap < a.gap ? b : a)) : null;
    const weakest = worst && worst.gap < -0.02 ? worst.key : null;
    return { ...athlete, shares, weakest };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** How many performances missed each combination checklist item, per apparatus. */
export function checklistMisses(performances, checklists = {}) {
  const out = [];
  for (const app of apparatusPresent(performances)) {
    const items = checklists[app] || [];
    const withList = performances.filter((p) => p.apparatus === app && p.checklist);
    if (!withList.length) continue;
    out.push({
      apparatus: app,
      total: withList.length,
      items: items.map((item) => ({
        ...item,
        missed: withList.filter((p) => {
          const hit = p.checklist.items.find((i) => i.id === item.id);
          return hit && hit.metBy * 2 < p.checklist.of;
        }).length,
      })).sort((a, b) => b.missed - a.missed),
    });
  }
  return out;
}

/** Strict / generous / in line with the panel, from an average deviation. */
export function styleWord(mean) {
  if (mean == null) return { word: 'Not enough marks yet', tone: null };
  if (mean <= -0.15) return { word: 'Stricter than the panel', tone: 'down' };
  if (mean >= 0.15) return { word: 'More generous than the panel', tone: 'up' };
  return { word: 'In line with the panel', tone: null };
}

/** "marks 0.12 below the panel" in words. */
export function deviationWords(value) {
  if (value == null) return '—';
  if (Math.abs(value) < 0.005) return 'level with the panel';
  return `${fmt(Math.abs(value))} ${value > 0 ? 'above' : 'below'} the panel`;
}

/** The one-line story of a flagged judge-team pair, without pronouns. */
export function leanSentence({ judgeName, teamName, lean }) {
  const direction = lean > 0 ? 'higher' : 'lower';
  return `${judgeName} marks ${teamName} ${direction} than other teams`;
}

export const leanDetail = ({ groupMean, othersMean, n }) =>
  `On ${n} performances: ${signed(groupMean)} against the rest of the panel for this team, ${signed(othersMean)} for every other team.`;
