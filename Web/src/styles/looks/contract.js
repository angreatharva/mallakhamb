/**
 * The look contract: the stable interface between looks and components.
 *
 * A *look* (docs/design-language/PLAN.md §4) is one pack of values. Components
 * never read a pack; they read the CSS custom properties named here. So this
 * file is the whole promise a look makes: every pack defines every token below,
 * for both appearances, and meets the contrast pairs at the bottom. The tests in
 * looks.contract.test.js and looks.contrast.test.js hold every pack to it.
 *
 * Three scopes, because three things vary independently:
 *   - ROLE_TOKENS vary by role (html[data-role]) and appearance;
 *   - APPEARANCE_TOKENS vary by appearance (dark | light), islands included;
 *   - LOOK_TOKENS are the same in both appearances (type, shape, motion).
 *
 * Types:
 *   triplet  RGB channels "r g b" (a pack may write #hex; the generator converts),
 *            so Tailwind's `/50` modifiers work: rgb(var(--x) / 0.5)
 *   color    any CSS colour, or an expression over other tokens
 *   alpha    a number 0…1 used inside a colour expression
 *   raw      any value (a shadow list, a colour-scheme keyword)
 *   font · length · easing · duration
 *
 * Adding a token here makes every pack that lacks it fail the contract test,
 * which then names each pack to fix. That is the point (plan §11).
 */

export const ROLES = ['public', 'player', 'coach', 'admin', 'judge', 'superadmin'];
export const APPEARANCES = ['dark', 'light'];

/**
 * Per role × appearance. Emitted on the role blocks as `--role-<appearance>`,
 * `--role-<appearance>-fg`, `--ident-<appearance>`, `--ident-<appearance>-fg`;
 * the appearance blocks pick their half into `--accent`, `--accent-fg`,
 * `--ident`, `--ident-fg`.
 */
export const ROLE_TOKENS = {
  accent: { type: 'triplet', purpose: 'the colour you press (fills)' },
  'accent-fg': { type: 'triplet', purpose: 'the accent as text and focus ring' },
  ident: { type: 'triplet', purpose: 'the role tag fill (the role is shown, never pressed)' },
  'ident-fg': { type: 'triplet', purpose: 'the role colour as text' },
};

/** Per appearance. `colorScheme` is a real property, set beside the tokens. */
export const APPEARANCE_TOKENS = {
  bg: { type: 'triplet', purpose: 'the page' },
  surface: { type: 'triplet', purpose: 'panels, bands' },
  'surface-raised': { type: 'triplet', purpose: 'hover, selected, menus' },
  'surface-sunken': { type: 'triplet', purpose: 'wells, table heads' },
  'surface-overlay': { type: 'triplet', purpose: 'dialogs' },
  scrim: { type: 'color', purpose: 'behind a dialog' },
  'shadow-raised': { type: 'raw', purpose: 'elevation of raised surfaces' },
  'fg-root': { type: 'color', purpose: 'the document text colour' },

  ink: { type: 'triplet', purpose: 'what text and hairlines are made of' },
  'a-fg-secondary': { type: 'alpha', purpose: 'ink alpha for secondary text' },
  'a-fg-muted': { type: 'alpha', purpose: 'ink alpha for muted text' },
  'a-fg-subtle': { type: 'alpha', purpose: 'ink alpha for disabled/decorative text' },
  'a-line': { type: 'alpha', purpose: 'ink alpha for hairlines' },
  'a-line-strong': { type: 'alpha', purpose: 'ink alpha for input rings' },

  fg: { type: 'color', purpose: 'primary text' },
  'fg-secondary': { type: 'color', purpose: 'secondary text' },
  'fg-muted': { type: 'color', purpose: 'muted text' },
  'fg-subtle': { type: 'color', purpose: 'disabled, decorative' },
  line: { type: 'color', purpose: 'hairline' },
  'line-strong': { type: 'color', purpose: 'input rings (WCAG 1.4.11)' },

  accent: { type: 'triplet', purpose: 'the colour you press' },
  'accent-fg': { type: 'triplet', purpose: 'accent as text' },
  'on-accent': { type: 'triplet', purpose: 'label on an accent fill' },
  ident: { type: 'triplet', purpose: 'role tag fill' },
  'ident-fg': { type: 'triplet', purpose: 'role colour as text' },
  'on-ident': { type: 'triplet', purpose: 'label on an ident fill' },
  'focus-ring': { type: 'color', purpose: 'the focus outline' },

  'success-fg': { type: 'triplet', purpose: 'status text' },
  'warning-fg': { type: 'triplet', purpose: 'status text' },
  'danger-fg': { type: 'triplet', purpose: 'status text' },
  'info-fg': { type: 'triplet', purpose: 'status text' },
  'status-on': { type: 'triplet', purpose: 'label on a status fill' },
  'success-fill': { type: 'triplet', purpose: 'status fill' },
  'warning-fill': { type: 'triplet', purpose: 'status fill' },
  'danger-fill': { type: 'triplet', purpose: 'status fill' },
  'info-fill': { type: 'triplet', purpose: 'status fill' },
  'success-on': { type: 'triplet', purpose: 'label on the fill' },
  'warning-on': { type: 'triplet', purpose: 'label on the fill' },
  'danger-on': { type: 'triplet', purpose: 'label on the fill' },
  'info-on': { type: 'triplet', purpose: 'label on the fill' },
  'success-tint': { type: 'color', purpose: 'status background tint' },
  'warning-tint': { type: 'color', purpose: 'status background tint' },
  'danger-tint': { type: 'color', purpose: 'status background tint' },
  'info-tint': { type: 'color', purpose: 'status background tint' },

  'brand-fg': { type: 'triplet', purpose: 'brand saffron as text' },
  'brand-fg-soft': { type: 'triplet', purpose: 'lighter brand saffron as text' },
  'brand-gold-fg': { type: 'triplet', purpose: 'brand gold as text' },
  'danger-fg-soft': { type: 'triplet', purpose: 'soft red status text ("Locked")' },
  'success-fg-soft': { type: 'triplet', purpose: 'soft green text' },

  'cat-blue': { type: 'triplet', purpose: 'Difficulty' },
  'cat-purple': { type: 'triplet', purpose: 'Combination' },
  'cat-purple-soft': { type: 'triplet', purpose: 'Combination, soft' },
  'cat-green': { type: 'triplet', purpose: 'Originality' },
  'cat-red': { type: 'triplet', purpose: 'deductions' },
  'cat-pink': { type: 'triplet', purpose: 'girls' },
  'cat-violet': { type: 'triplet', purpose: 'admin stat cards, the Female pill' },
  'cat-blue-soft': { type: 'triplet', purpose: 'evaluation-judge badge' },
  'medal-gold': { type: 'triplet', purpose: 'first place' },
  'medal-silver': { type: 'triplet', purpose: 'second place' },
  'medal-bronze': { type: 'triplet', purpose: 'third place' },

  'scrollbar-track': { type: 'color', purpose: 'scrollbar' },
  'scrollbar-thumb': { type: 'color', purpose: 'scrollbar' },
  'scrollbar-thumb-hover': { type: 'color', purpose: 'scrollbar' },
};

/**
 * The same in both appearances. Tailwind's radius, shadow, backdrop-blur,
 * easing, duration and font scales read these (tailwind.config.js), so a look
 * changes 600+ utility uses without editing a page.
 */
export const LOOK_TOKENS = {
  'font-root': { type: 'font', purpose: 'the document font (index.css :root)' },
  'font-text': { type: 'font', purpose: 'Tailwind font-sans' },
  'font-display': { type: 'font', purpose: 'Tailwind font-display: headings, big numbers' },

  'radius-sm': { type: 'length', purpose: 'rounded-sm' },
  radius: { type: 'length', purpose: 'rounded' },
  'radius-md': { type: 'length', purpose: 'rounded-md' },
  'radius-lg': { type: 'length', purpose: 'rounded-lg' },
  'radius-xl': { type: 'length', purpose: 'rounded-xl' },
  'radius-2xl': { type: 'length', purpose: 'rounded-2xl' },
  'radius-3xl': { type: 'length', purpose: 'rounded-3xl' },

  'shadow-sm': { type: 'raw', purpose: 'shadow-sm' },
  shadow: { type: 'raw', purpose: 'shadow' },
  'shadow-md': { type: 'raw', purpose: 'shadow-md' },
  'shadow-lg': { type: 'raw', purpose: 'shadow-lg' },
  'shadow-xl': { type: 'raw', purpose: 'shadow-xl' },
  'shadow-2xl': { type: 'raw', purpose: 'shadow-2xl' },
  'shadow-inner': { type: 'raw', purpose: 'shadow-inner' },

  'backdrop-blur-sm': { type: 'length', purpose: 'backdrop-blur-sm' },
  'backdrop-blur': { type: 'length', purpose: 'backdrop-blur' },
  'backdrop-blur-md': { type: 'length', purpose: 'backdrop-blur-md' },
  'backdrop-blur-lg': { type: 'length', purpose: 'backdrop-blur-lg' },
  'backdrop-blur-xl': { type: 'length', purpose: 'backdrop-blur-xl' },
  'backdrop-blur-2xl': { type: 'length', purpose: 'backdrop-blur-2xl' },
  'backdrop-blur-3xl': { type: 'length', purpose: 'backdrop-blur-3xl' },

  ease: { type: 'easing', purpose: 'Tailwind `ease` / `transition` default' },
  'ease-in': { type: 'easing', purpose: 'ease-in' },
  'ease-out': { type: 'easing', purpose: 'ease-out: menus, dialogs' },
  'ease-in-out': { type: 'easing', purpose: 'ease-in-out' },
  'ease-cut': { type: 'easing', purpose: 'ease-cut: wipes, rules growing, tab bars' },

  'duration-default': { type: 'duration', purpose: 'the `transition` utility' },
  'duration-75': { type: 'duration', purpose: 'duration-75' },
  'duration-100': { type: 'duration', purpose: 'duration-100' },
  'duration-150': { type: 'duration', purpose: 'duration-150' },
  'duration-200': { type: 'duration', purpose: 'duration-200' },
  'duration-300': { type: 'duration', purpose: 'duration-300' },
  'duration-500': { type: 'duration', purpose: 'duration-500' },
  'duration-700': { type: 'duration', purpose: 'duration-700' },
  'duration-1000': { type: 'duration', purpose: 'duration-1000' },
  'dur-1': { type: 'duration', purpose: 'press' },
  'dur-2': { type: 'duration', purpose: 'hover colour swap' },
  'dur-3': { type: 'duration', purpose: 'wipes, dialog in, tab bar' },
  'dur-4': { type: 'duration', purpose: 'the longest entrance on a working screen' },
};

/**
 * Type steps (plan §5.4): one vocabulary for type, as `type-<step>` utilities
 * (tailwind.config.js) that read `--type-<step>-<prop>`. Display steps are
 * uppercase: use them only on text the site writes itself — never on COP
 * wording, stored values or people's names (protected behaviours 5 and 10).
 */
export const TYPE_STEPS = [
  'display-xl', 'display-l', 'display-m', 'display-s',
  'num-l', 'num-m',
  'body', 'body-s', 'caption', 'tag', 'button', 'input',
];
export const TYPE_PROPS = {
  family: 'font-family',
  weight: 'font-weight',
  size: 'font-size',
  leading: 'line-height',
  tracking: 'letter-spacing',
  transform: 'text-transform',
  stretch: 'font-stretch',
  numeric: 'font-variant-numeric',
};
Object.assign(LOOK_TOKENS, Object.fromEntries(TYPE_STEPS.flatMap((step) => Object.keys(TYPE_PROPS).map((prop) => [
  `type-${step}-${prop}`,
  { type: prop === 'family' ? 'font' : 'raw', purpose: `type-${step}: ${TYPE_PROPS[prop]}` },
]))));
LOOK_TOKENS['type-input-size-mouse'] = { type: 'raw', purpose: 'type-input with a mouse (16px on touch stops iOS zooming)' };

/** Tailwind duration keys that read LOOK_TOKENS (`duration-200` → `--duration-200`). */
export const DURATION_STEPS = ['75', '100', '150', '200', '300', '500', '700', '1000'];

/** The surfaces every text colour is measured against. */
export const SURFACES = ['bg', 'surface', 'surface-raised', 'surface-sunken', 'surface-overlay'];

/**
 * Contrast pairs (WCAG 2.x). `on: 'surfaces'` means every surface above; a
 * translucent foreground is composited over the surface first.
 * `perRole` pairs are checked for every role.
 */
export const CONTRAST_PAIRS = [
  { fg: 'fg', on: 'surfaces', min: 12 },
  { fg: 'fg-secondary', on: 'surfaces', min: 4.5 },
  { fg: 'fg-muted', on: 'surfaces', min: 4.5 },
  { fg: 'accent-fg', on: 'surfaces', min: 4.5, perRole: true },
  { fg: 'ident-fg', on: 'surfaces', min: 4.5, perRole: true },
  { fg: 'on-accent', on: 'accent', min: 4.5, perRole: true },
  { fg: 'on-ident', on: 'ident', min: 4.5, perRole: true },
  ...['success', 'warning', 'danger', 'info'].flatMap((s) => [
    { fg: `${s}-fg`, on: 'surfaces', min: 4.5 },
    { fg: `${s}-on`, on: `${s}-fill`, min: 4.5 },
  ]),
  ...['brand-fg', 'brand-gold-fg', 'danger-fg-soft', 'success-fg-soft',
    'cat-blue', 'cat-purple', 'cat-purple-soft', 'cat-green', 'cat-red', 'cat-pink',
    'cat-violet', 'cat-blue-soft', 'medal-gold', 'medal-silver', 'medal-bronze',
  ].map((fg) => ({ fg, on: 'surfaces', min: 4.5 })),
  { fg: 'focus-ring', on: 'surfaces', min: 3, perRole: true },
  { fg: 'line-strong', on: 'surfaces', min: 3 },
];
