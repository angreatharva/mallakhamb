/**
 * `prime-time` — the landing page's broadcast language, for the whole site
 * (docs/design-language/PLAN.md §1, §5).
 *
 * Dark is Home's stage: black, teak bands, chalk type, saffron the one colour
 * you press. Light is its designed counterpart, "chalk paper" — the same
 * materials inverted, not a colour flip. Saffron is the action colour for every
 * role (D3); the role shows as an *ident* tag, text plus colour.
 *
 * Every ratio below is re-checked by looks.contrast.test.js on every commit;
 * change a value and run `npm run looks`, then that test (plan §11).
 */
import { defineLook } from './define.js';
import { typeScaleTokens } from './type-scale.js';

/* Raw material. Only this file names these; components read semantic tokens. */
const P = {
  stage: '#000000',
  teak: '#140E09',
  teak2: '#20160E',
  chalk: '#F3EEE6',
  ash: '#A9A198',
  saffron: '#FF6B00',
  saffronDeep: '#9A2C06',
  paper: '#FBF8F3',
  band: '#E8E0D4',
  white: '#FFFFFF',
  inkLight: '#140E09',
  ashLight: '#544B42',
  black: '#000000',
};

/* Saffron fills for everyone (D3); the ident carries the role. */
const role = (identDark, identLight) => ({
  dark: { accent: P.saffron, 'accent-fg': P.saffron, ident: identDark, 'ident-fg': identDark },
  light: { accent: P.saffron, 'accent-fg': P.saffronDeep, ident: identLight, 'ident-fg': identLight },
});

const violet = role('#A78BFA', '#6D28D9');

export default defineLook({
  id: 'prime-time',

  roles: {
    public: role(P.chalk, P.inkLight),
    player: role(P.saffron, P.saffronDeep),
    coach: role('#22C55E', '#166534'),
    admin: violet,
    judge: violet,
    superadmin: role('#F5A623', '#92400E'),
  },

  shared: {
    fg: 'rgb(var(--ink) / 1)',
    'fg-subtle': 'rgb(var(--ink) / var(--a-fg-subtle))',
    line: 'rgb(var(--ink) / var(--a-line))',
    'line-strong': 'rgb(var(--ink) / var(--a-line-strong))',

    'success-fill': 'var(--success-fg)',
    'warning-fill': 'var(--warning-fg)',
    'danger-fill': 'var(--danger-fg)',
    'info-fill': 'var(--info-fg)',
    'success-on': 'var(--status-on)',
    'warning-on': 'var(--status-on)',
    'danger-on': 'var(--status-on)',
    'info-on': 'var(--status-on)',
    'success-tint': 'rgb(var(--success-fg) / 0.12)',
    'warning-tint': 'rgb(var(--warning-fg) / 0.12)',
    'danger-tint': 'rgb(var(--danger-fg) / 0.12)',
    'info-tint': 'rgb(var(--info-fg) / 0.12)',

    'scrollbar-track': 'rgb(var(--bg))',
    'scrollbar-thumb': 'rgb(var(--ink) / 0.22)',
    'scrollbar-thumb-hover': 'rgb(var(--ink) / 0.36)',
    'shadow-raised': 'none',
    'focus-ring': 'rgb(var(--accent-fg))',
  },

  appearances: {
    dark: {
      bg: P.stage,
      surface: P.teak,
      'surface-raised': P.teak2,
      'surface-sunken': P.stage,
      'surface-overlay': P.teak2,
      scrim: 'rgb(0 0 0 / 0.72)',
      'fg-root': P.chalk,

      ink: P.chalk,
      // Two text levels, as on Home: hierarchy comes from type, not from fading.
      // Secondary and muted share one value; the contract keeps two tokens so a
      // later look can split them. (The two ink alphas below are then unused.)
      'fg-secondary': P.ash,
      'fg-muted': P.ash,
      'a-fg-secondary': '1',
      'a-fg-muted': '1',
      'a-fg-subtle': '0.5',
      'a-line': '0.16',
      'a-line-strong': '0.55',

      'on-accent': P.black,
      'on-ident': P.black,

      'success-fg': '#22C55E',
      'warning-fg': '#F59E0B',
      'danger-fg': '#F87171',
      'info-fg': '#60A5FA',
      'status-on': P.black,

      'brand-fg': P.saffron,
      'brand-fg-soft': '#FF8C38',
      'brand-gold-fg': '#F5A623',
      'danger-fg-soft': '#F87171',
      'success-fg-soft': '#4ADE80',

      'cat-blue': '#60A5FA',
      'cat-purple': '#C084FC', // #A855F7 is 4.49 on teak-2
      'cat-purple-soft': '#D8B4FE',
      'cat-green': '#22C55E',
      'cat-red': '#F87171',
      'cat-pink': '#EC4899',
      'cat-violet': '#A78BFA',
      'cat-blue-soft': '#93C5FD',
      'medal-gold': '#F5A623',
      'medal-silver': '#C0C0C0',
      'medal-bronze': '#CD7F32',
    },

    light: {
      bg: P.chalk,
      surface: P.paper,
      'surface-raised': P.white,
      'surface-sunken': P.band,
      'surface-overlay': P.white,
      scrim: 'rgb(20 14 9 / 0.45)',
      'fg-root': P.inkLight,

      ink: P.inkLight,
      'fg-secondary': P.ashLight,
      'fg-muted': P.ashLight,
      'a-fg-secondary': '1',
      'a-fg-muted': '1',
      'a-fg-subtle': '0.5',
      'a-line': '0.14',
      'a-line-strong': '0.5',

      'on-accent': P.black,
      'on-ident': P.white,

      // The -800 shades: today's -700 success/warning are 4.34 / 4.35 on chalk.
      'success-fg': '#166534',
      'warning-fg': '#92400E',
      'danger-fg': '#B91C1C',
      'info-fg': '#1D4ED8',
      'status-on': P.white,

      'brand-fg': P.saffronDeep,
      'brand-fg-soft': P.saffronDeep,
      'brand-gold-fg': '#92400E',
      'danger-fg-soft': '#B91C1C',
      'success-fg-soft': '#166534',

      'cat-blue': '#1D4ED8',
      'cat-purple': '#7E22CE',
      'cat-purple-soft': '#7E22CE',
      'cat-green': '#166534',
      'cat-red': '#B91C1C',
      'cat-pink': '#BE185D',
      'cat-violet': '#6D28D9',
      'cat-blue-soft': '#1D4ED8',
      'medal-gold': '#92400E',
      'medal-silver': '#475569',
      'medal-bronze': '#9A3412',
    },
  },

  look: {
    // No metric-matched fallback faces in these stacks: listing one cost ~80-90 ms
    // before first render on the phone profile (measured on Home, 2026-10-08;
    // `npm run fonts:metrics` regenerates them if a wave ever shows a font-swap
    // shift). Prime-time routes preload the fonts, which arrive before first render.
    'font-root': "'Archivo Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
    'font-text': "'Archivo Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
    'font-display': "Teko, 'Arial Narrow', Impact, sans-serif",

    // Square: sm…lg 2px, xl…3xl 4px; `rounded-full` stays round (dots, avatars).
    'radius-sm': '2px',
    radius: '2px',
    'radius-md': '2px',
    'radius-lg': '2px',
    'radius-xl': '4px',
    'radius-2xl': '4px',
    'radius-3xl': '4px',

    // No shadows: elevation is a surface step plus a hairline.
    'shadow-sm': '0 0 #0000',
    shadow: '0 0 #0000',
    'shadow-md': '0 0 #0000',
    'shadow-lg': '0 0 #0000',
    'shadow-xl': '0 0 #0000',
    'shadow-2xl': '0 0 #0000',
    'shadow-inner': '0 0 #0000',

    // No glass (D6).
    'backdrop-blur-sm': '0px',
    'backdrop-blur': '0px',
    'backdrop-blur-md': '0px',
    'backdrop-blur-lg': '0px',
    'backdrop-blur-xl': '0px',
    'backdrop-blur-2xl': '0px',
    'backdrop-blur-3xl': '0px',

    ease: 'cubic-bezier(.22,1,.36,1)',
    'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
    'ease-out': 'cubic-bezier(.22,1,.36,1)',
    'ease-in-out': 'cubic-bezier(.62,0,.12,1)',
    'ease-cut': 'cubic-bezier(.62,0,.12,1)',

    'duration-default': '160ms',
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

    ...typeScaleTokens(),

    // Square, ruled, flat (§5.5): 2px controls, square panels, a 3px accent
    // rule for "live", a 1.5px inset ring, a 3px focus ring, no hover lift.
    'radius-control': '2px',
    'radius-panel': '0px',
    rule: '3px',
    ring: '1.5px',
    'focus-width': '3px',
    'focus-offset': '2px',
    'control-h': '44px',
    'control-h-mouse': '36px',
    pad: 'clamp(16px, 4vw, 56px)',
    'grain-opacity': '0.075',
    'hover-lift': '0px',
  },

  // One switch for everything: every duration is 0 under reduced motion.
  reduceMotion: true,

  contrastExceptions: [],
});
