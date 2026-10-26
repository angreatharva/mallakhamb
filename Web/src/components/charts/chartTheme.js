/**
 * What each chart series is, and how it is drawn.
 *
 * Colour is a viz token slot (Web/src/styles/looks/contract.js `viz-1..3`),
 * validated for colour blindness in both appearances. Slots follow the ENTITY,
 * never its rank: Difficulty is always slot 1, Pole is always slot 1, so a
 * filter that hides a series never repaints the ones left. Lines also carry a
 * dash pattern, and every series is direct-labelled, so identity never rests
 * on colour alone.
 */

export const viz = (slot, alpha) => (alpha == null ? `rgb(var(--viz-${slot}))` : `rgb(var(--viz-${slot}) / ${alpha})`);
export const vizToken = (name, alpha) => (alpha == null ? `rgb(var(--viz-${name}))` : `rgb(var(--viz-${name}) / ${alpha})`);

/** COP section ceilings: Difficulty 3.80, Combination 1.60, Execution 4.40 (bonus 0.20 on top). */
export const SECTIONS = [
  { key: 'difficulty', label: 'Difficulty', short: 'D', max: 3.8, slot: 1 },
  { key: 'combination', label: 'Combination', short: 'C', max: 1.6, slot: 2 },
  { key: 'execution', label: 'Execution', short: 'E', max: 4.4, slot: 3 },
];

export const APPARATUS = {
  'Pole Mallakhamb': { label: 'Pole', slot: 1, dash: '' },
  'Rope Mallakhamb': { label: 'Rope', slot: 2, dash: '7 4' },
  'Hanging Mallakhamb': { label: 'Hanging', slot: 3, dash: '2 4' },
};
export const APPARATUS_ORDER = Object.keys(APPARATUS);
export const apparatusLabel = (key) => APPARATUS[key]?.label || key;

/** A score to two places; an em dash for nothing. */
export const fmt = (value, digits = 2) =>
  value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits);

/** A signed difference with a real minus sign: +0.38, −0.12, ±0.00. */
export const signed = (value, digits = 2) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const v = Number(value);
  const abs = Math.abs(v).toFixed(digits);
  if (Number(abs) === 0) return `±${abs}`;
  return `${v > 0 ? '+' : '−'}${abs}`;
};

/** 1 → "1st", 2 → "2nd", 11 → "11th". */
export const ordinal = (n) => {
  if (n == null) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** A meet's short date: "Jan 2026". */
export const shortDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

/** Round axis bounds around the values, in steps of `step`, inside [floor, ceil]. */
export const niceDomain = (values, { step = 0.5, pad = 0.1, floor = 0, ceil = 10 } = {}) => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [floor, ceil];
  let lo = Math.min(...finite) - pad;
  let hi = Math.max(...finite) + pad;
  lo = Math.max(floor, Math.floor(lo / step) * step);
  hi = Math.min(ceil, Math.ceil(hi / step) * step);
  if (hi - lo < step) hi = Math.min(ceil, lo + step);
  return [lo, hi];
};

export const ticks = ([lo, hi], step) => {
  const out = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(4)));
  return out;
};
