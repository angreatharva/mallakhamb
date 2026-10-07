/**
 * `classic` — the design as it was before the design-language work, byte for
 * byte. Every value here was moved verbatim from src/index.css (and the Tailwind
 * scales it now feeds hold Tailwind's own defaults), so a page on `classic`
 * renders exactly as it did; the pixel gate (threshold 0) proves it.
 *
 * Retired in Phase 6 of docs/design-language/PLAN.md, once every route group
 * has moved to `prime-time`. Until then: do not "improve" a value here — a
 * classic route must not move. Change prime-time instead.
 */
import { defineLook } from './define.js';
import { typeScaleTokens } from './type-scale.js';

/* Role palettes (were index.css `:root` / `[data-role]`). Classic has no ident:
   the role colour IS the accent, so ident mirrors it. */
const role = (dark, darkFg, light, lightFg) => ({
  dark: { accent: dark, 'accent-fg': darkFg, ident: dark, 'ident-fg': darkFg },
  light: { accent: light, 'accent-fg': lightFg, ident: light, 'ident-fg': lightFg },
});

const adminJudge = role(
  '139 92 246',
  '167 139 250', /* violet-400: #8B5CF6 as text is 4.45 on #111 */
  '109 40 217',
  '109 40 217',
);

export default defineLook({
  id: 'classic',

  roles: {
    public: role(
      '59 130 246',
      '96 165 250', /* blue-400: #3B82F6 as text is 4.2–4.5 on dark tints */
      '29 78 216',
      '29 78 216',
    ),
    player: role('255 107 0', '255 107 0', '194 65 12', '194 65 12'),
    superadmin: role(
      '245 166 35',
      '245 166 35',
      '180 83 9',
      '146 64 14', /* -700 text is 4.39 on the sunken surface; -800 clears 4.5 */
    ),
    coach: role('34 197 94', '34 197 94', '21 128 61', '22 101 52'),
    admin: adminJudge,
    judge: adminJudge,
  },

  /* Derived — the same expressions in both appearances (were index.css
     `:root, [data-appearance]`). Each resolves against its own block's ink. */
  shared: {
    fg: 'rgb(var(--ink) / 1)',
    'fg-secondary': 'rgb(var(--ink) / var(--a-fg-secondary))',
    'fg-muted': 'rgb(var(--ink) / var(--a-fg-muted))',
    'fg-subtle': 'rgb(var(--ink) / var(--a-fg-subtle))',
    line: 'rgb(var(--ink) / var(--a-line))',
    'line-strong': 'rgb(var(--ink) / var(--a-line-strong))',

    'focus-ring': 'rgb(var(--accent-fg))',

    'success-fill': 'var(--success-fg)',
    'warning-fill': 'var(--warning-fg)',
    'danger-fill': 'var(--danger-fg)',
    'info-fill': 'var(--info-fg)',
    'success-on': 'var(--status-on)',
    'warning-on': 'var(--status-on)',
    'danger-on': 'var(--status-on)',
    'info-on': 'var(--status-on)',
    'success-tint': 'rgb(var(--success-fg) / 0.1)',
    'warning-tint': 'rgb(var(--warning-fg) / 0.1)',
    'danger-tint': 'rgb(var(--danger-fg) / 0.1)',
    'info-tint': 'rgb(var(--info-fg) / 0.1)',

    'scrollbar-track': 'rgb(var(--bg))',
    'scrollbar-thumb': 'rgb(var(--ink) / 0.18)',
    'scrollbar-thumb-hover': 'rgb(var(--ink) / 0.3)',

    'on-ident': 'var(--on-accent)',
  },

  appearances: {
    dark: {
      bg: '10 10 10',
      surface: '17 17 17',
      'surface-raised': '22 22 22',
      'surface-sunken': '10 10 10',
      'surface-overlay': '26 26 26',
      scrim: 'rgb(0 0 0 / 0.6)',
      'shadow-raised': 'none',
      'fg-root': '#f3f4f6',

      ink: '255 255 255',
      'a-fg-secondary': '0.7',
      'a-fg-muted': '0.55',
      'a-fg-subtle': '0.38',
      'a-line': '0.1',
      'a-line-strong': '0.38',

      'on-accent': '10 10 10',

      'success-fg': '34 197 94',
      'warning-fg': '245 158 11',
      'danger-fg': '239 68 68',
      'info-fg': '96 165 250',
      'status-on': '10 10 10',

      /* Brand saffron and gold as TEXT — the brand hexes exactly. */
      'brand-fg': '255 107 0',
      'brand-fg-soft': '255 140 56',
      'brand-gold-fg': '245 166 35',
      'danger-fg-soft': '248 113 113', /* red-400 as status text ("Locked") */

      /* Data palette — the hexes the boards already used, exactly. */
      'success-fg-soft': '74 222 128',
      'cat-blue': '96 165 250',
      'cat-purple': '168 85 247',
      'cat-purple-soft': '192 132 252',
      'cat-green': '34 197 94',
      'cat-red': '239 68 68',
      'cat-pink': '236 72 153',
      'cat-violet': '167 139 250',
      'cat-blue-soft': '147 197 253',
      'medal-gold': '245 166 35',
      'medal-silver': '192 192 192',
      'medal-bronze': '205 127 50',
    },

    light: {
      bg: '246 247 249',
      surface: '255 255 255',
      'surface-raised': '255 255 255',
      'surface-sunken': '238 240 243',
      'surface-overlay': '255 255 255',
      scrim: 'rgb(11 13 18 / 0.45)',
      'shadow-raised': '0 1px 2px rgb(11 13 18 / 0.06), 0 4px 12px rgb(11 13 18 / 0.06)',
      'fg-root': 'rgb(11 13 18)',

      ink: '11 13 18',
      'a-fg-secondary': '0.78',
      'a-fg-muted': '0.64',
      'a-fg-subtle': '0.45',
      'a-line': '0.12',
      'a-line-strong': '0.45',

      'on-accent': '255 255 255',

      'success-fg': '21 128 61',
      'warning-fg': '180 83 9',
      'danger-fg': '185 28 28',
      'info-fg': '29 78 216',
      'status-on': '255 255 255',

      /* Saffron and gold as text fail on white (2.86 and 2.03:1); the -700
         shades read 5.2 / 5.0 on white and 4.8 / 4.7 on the page. */
      'brand-fg': '180 52 8',
      'brand-fg-soft': '180 52 8',
      'brand-gold-fg': '146 64 14',
      'danger-fg-soft': '185 28 28', /* #F87171 is 2.8:1 on white */
      'success-fg-soft': '22 101 52',
      'cat-blue': '29 78 216',
      'cat-purple': '126 34 206',
      'cat-purple-soft': '126 34 206',
      'cat-green': '22 101 52',
      'cat-red': '185 28 28',
      'cat-pink': '190 24 93',
      'cat-violet': '109 40 217',
      'cat-blue-soft': '29 78 216',
      'medal-gold': '146 64 14',
      'medal-silver': '71 85 105',
      'medal-bronze': '154 52 18',
    },
  },

  /* Type, shape, motion: index.css's document font, the font-sans the Tailwind
     config declared, and Tailwind's own default scales. */
  look: {
    'font-root': 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
    'font-text': 'Inter, system-ui, sans-serif',
    'font-display': 'Inter, system-ui, sans-serif',

    'radius-sm': '0.125rem',
    radius: '0.25rem',
    'radius-md': '0.375rem',
    'radius-lg': '0.5rem',
    'radius-xl': '0.75rem',
    'radius-2xl': '1rem',
    'radius-3xl': '1.5rem',

    'shadow-sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    shadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    'shadow-md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    'shadow-lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    'shadow-xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    'shadow-2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    'shadow-inner': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',

    'backdrop-blur-sm': '4px',
    'backdrop-blur': '8px',
    'backdrop-blur-md': '12px',
    'backdrop-blur-lg': '16px',
    'backdrop-blur-xl': '24px',
    'backdrop-blur-2xl': '40px',
    'backdrop-blur-3xl': '64px',

    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
    'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
    'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
    'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
    'ease-cut': 'cubic-bezier(.62,0,.12,1)',

    'duration-default': '150ms',
    'duration-75': '75ms',
    'duration-100': '100ms',
    'duration-150': '150ms',
    'duration-200': '200ms',
    'duration-300': '300ms',
    'duration-500': '500ms',
    'duration-700': '700ms',
    'duration-1000': '1000ms',
    'dur-1': '120ms',
    'dur-2': '160ms',
    'dur-3': '300ms',
    'dur-4': '600ms',

    // New with the type scale; no classic screen uses a `type-*` utility.
    ...typeScaleTokens(),

    // Component knobs. focus-width/offset and hover-lift reproduce index.css's
    // existing 2px/2px ring and 1px lift exactly; the rest only shape the
    // primitives, which no classic screen uses (radii: the rounded-lg/-2xl the
    // app's controls and cards use today).
    'radius-control': '0.5rem',
    'radius-panel': '1rem',
    rule: '3px',
    ring: '1px',
    'focus-width': '2px',
    'focus-offset': '2px',
    'control-h': '44px',
    'control-h-mouse': '36px',
    pad: '1rem',
    'grain-opacity': '0',
    'hover-lift': '-1px',
  },

  // Classic's motion never zeroed under reduced motion; it doesn't start now.
  reduceMotion: false,

  /*
   * Pairs today's design fails, measured by looks.contrast.test.js and kept as
   * they are (a classic route must not move). They retire with classic.
   * Each is a worst-case pairing the contract measures (every text colour on
   * every surface). The in-browser contrast audit, which measures real
   * backgrounds, passes 88/88 in both appearances, so no audited screen draws
   * these. Prime-time passes all three.
   */
  contrastExceptions: [
    { fg: 'cat-purple', on: 'surface-overlay', appearance: 'dark', reason: "4.40: today's Combination purple; classic must not move" },
    { fg: 'success-fg', on: 'surface-sunken', appearance: 'light', reason: "4.39: today's green-700; classic must not move" },
    { fg: 'warning-fg', on: 'surface-sunken', appearance: 'light', reason: "4.40: today's amber-700; classic must not move" },
  ],
});
