/**
 * The type scale (docs/design-language/PLAN.md §5.4), as look tokens.
 *
 * Written against the look's own font tokens (`--font-display`, `--font-text`),
 * so every look gets the same steps in its own typefaces; a look that wants a
 * different scale overrides individual tokens in its pack. Rules the steps
 * encode:
 *   - Teko (display) only at 24px and up; never in inputs, body, COP or cells.
 *   - Numbers that are the point of a screen: num-*, tabular figures.
 *   - Text floor 12px; tags may go to 11px.
 */
const DISPLAY = 'var(--font-display)';
const TEXT = 'var(--font-text)';

/* step: [family, weight, size, leading, tracking, transform, stretch, numeric] */
const SCALE = {
  'display-xl': [DISPLAY, '600', 'clamp(52px, 8vw, 136px)', '0.85', '0', 'uppercase', 'normal', 'normal'],
  'display-l': [DISPLAY, '600', 'clamp(40px, 4.2vw, 64px)', '0.88', '0', 'uppercase', 'normal', 'normal'],
  'display-m': [DISPLAY, '600', 'clamp(28px, 2.4vw, 38px)', '0.9', '0', 'uppercase', 'normal', 'normal'],
  'display-s': [DISPLAY, '600', '26px', '0.9', '0', 'uppercase', 'normal', 'normal'],
  'num-l': [DISPLAY, '500', 'clamp(40px, 4vw, 64px)', '0.85', '0', 'none', 'normal', 'tabular-nums'],
  'num-m': [DISPLAY, '500', '30px', '0.9', '0', 'none', 'normal', 'tabular-nums'],
  body: [TEXT, '400', '16px', '1.55', '0', 'none', 'normal', 'normal'],
  'body-s': [TEXT, '400', '14.5px', '1.45', '0', 'none', 'normal', 'normal'],
  caption: [TEXT, '400', '13.5px', '1.4', '0', 'none', 'normal', 'normal'],
  tag: [TEXT, '700', '12px', '1', '0.06em', 'uppercase', '125%', 'normal'],
  button: [TEXT, '600', '14.5px', '1', '0.01em', 'none', 'normal', 'normal'],
  input: [TEXT, '400', '16px', '1.4', '0', 'none', 'normal', 'normal'],
};

const PROPS = ['family', 'weight', 'size', 'leading', 'tracking', 'transform', 'stretch', 'numeric'];

/** The scale as `type-<step>-<prop>` look tokens. */
export const typeScaleTokens = () => ({
  ...Object.fromEntries(Object.entries(SCALE).flatMap(([step, values]) =>
    PROPS.map((prop, i) => [`type-${step}-${prop}`, values[i]]))),
  'type-input-size-mouse': '15px',
});
