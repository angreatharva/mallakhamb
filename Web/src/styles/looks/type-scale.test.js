/**
 * The type scale keeps the plan's rules in every look (docs/design-language/PLAN.md §5.4, §8).
 */
import { describe, expect, it } from 'vitest';
import { TYPE_STEPS } from './contract.js';
import { resolvedLooks } from './index.js';
import { lookTokens, resolveTokens } from './build.js';

/** The smallest px a size can resolve to: a px value, or the min of clamp(). */
const minPx = (size) => {
  const clamp = size.match(/^clamp\(\s*([\d.]+)px/);
  if (clamp) return Number(clamp[1]);
  const px = size.match(/^([\d.]+)px$/);
  if (px) return Number(px[1]);
  throw new Error(`unexpected size ${size}`);
};

describe.each(resolvedLooks().map((look) => [look.id, look]))('type scale — look "%s"', (id, look) => {
  const tokens = resolveTokens(look, 'dark');
  const raw = Object.fromEntries(lookTokens(look));
  const step = (s, prop) => tokens[`type-${s}-${prop}`];
  // Which font token a step names (classic's two fonts are both Inter, so compare references).
  const face = (s) => raw[`type-${s}-family`];

  it('sets the display face only at 24px and up (Teko is poor small)', () => {
    for (const s of TYPE_STEPS) {
      if (face(s) === 'var(--font-display)') expect(minPx(step(s, 'size')), s).toBeGreaterThanOrEqual(24);
    }
  });

  it('never sets inputs, body text or tags in the display face', () => {
    for (const s of ['body', 'body-s', 'caption', 'tag', 'button', 'input']) {
      expect(face(s), s).toBe('var(--font-text)');
    }
  });

  it('keeps text at 12px or more, tags at 11px or more', () => {
    for (const s of TYPE_STEPS) expect(minPx(step(s, 'size')), s).toBeGreaterThanOrEqual(s === 'tag' ? 11 : 12);
  });

  it('keeps inputs at 16px on touch, so iOS does not zoom on focus', () => {
    expect(minPx(step('input', 'size'))).toBeGreaterThanOrEqual(16);
  });

  it('uppercases only display steps and tags (never body text: COP wording keeps its case)', () => {
    for (const s of TYPE_STEPS) {
      const upper = step(s, 'transform') === 'uppercase';
      expect(upper, s).toBe(s.startsWith('display-') || s === 'tag');
    }
  });

  it('sets the numbers that are the point of a screen in tabular figures', () => {
    for (const s of ['num-l', 'num-m']) expect(step(s, 'numeric')).toBe('tabular-nums');
  });
});
