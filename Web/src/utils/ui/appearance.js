/**
 * Appearance (dark | light) — the preference, where it is kept, and how it is
 * put on the page.
 *
 * "Appearance", never "theme": `ThemeProvider`/`useTheme` already mean the
 * per-role ACCENT colour, and the two are separate axes that meet in CSS as
 * `html[data-appearance][data-role]` (see Web/docs/RESPONSIVE_UIUX_PLAN.md §14).
 *
 * The first paint is done by `public/appearance-init.js`, a classic script that
 * runs before any stylesheet. It cannot import this module, so it restates the
 * key, the default and the two theme-colour values; keep them in step.
 */

import looksMeta from '@/styles/generated/looks.meta.json';

export const APPEARANCE_STORAGE_KEY = 'mk-appearance';

/** What a person can choose. `system` follows the device. */
export const APPEARANCE_PREFERENCES = ['dark', 'light', 'system'];

/** Existing users see nothing change until they choose (plan D5). */
export const DEFAULT_APPEARANCE_PREFERENCE = 'dark';

/**
 * Browser-chrome colour per look and resolved appearance: each look's `--bg`,
 * read from the generated looks.meta.json (`npm run looks`), so a pack edit
 * reaches the browser chrome too.
 */
export const THEME_COLOR_BY_LOOK = Object.fromEntries(Object.entries(looksMeta.looks).map(([look, byAppearance]) => [
  look,
  { dark: byAppearance.dark.bg, light: byAppearance.light.bg },
]));

/** The default look's colours — what public/appearance-init.js paints first. */
export const THEME_COLOR = THEME_COLOR_BY_LOOK['prime-time'];

/**
 * Point the theme-color tags at the current look and appearance. `system`
 * hands the two media-scoped tags back to the browser (each its own colour).
 * Called when the appearance changes and when a route changes the look.
 */
export const syncThemeColor = (resolved, preference) => {
  if (typeof document === 'undefined') return;
  const look = document.documentElement.getAttribute('data-look');
  const colours = THEME_COLOR_BY_LOOK[look] || THEME_COLOR;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute('media') || '';
    const own = media.includes('light') ? colours.light : colours.dark;
    meta.setAttribute('content', preference === 'system' ? own : colours[resolved]);
  });
};

const LIGHT_QUERY = '(prefers-color-scheme: light)';

export const isAppearancePreference = (value) => APPEARANCE_PREFERENCES.includes(value);

/**
 * Put the role accent on the document — which of the five palettes in
 * index.css `--accent`, `--accent-fg`, `--on-accent` and the focus ring use.
 *
 * Taken from the URL, the same source ThemeProvider and the API client read,
 * so the CSS accent matches the JS theme on every screen (each ThemeProvider
 * mount passes its own route's role). No role — home, public scores, the
 * password pages — removes the attribute, and `:root`'s public palette applies,
 * exactly as useTheme's default does.
 *
 * On <html> and nowhere else: `--accent` is derived where `data-appearance` is
 * declared, so a `data-role` on an inner element would never reach it.
 */
export const applyRoleAccent = (role) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (role) root.setAttribute('data-role', role);
  else root.removeAttribute('data-role');
};

/**
 * The stored preference, or the default.
 *
 * Plain localStorage, not obfuscatedStorage: it is not sensitive, the bootstrap
 * has to read it before the bundle exists, and it must outlive logout (which
 * clears sessionStorage only). Every access is guarded because some private
 * modes throw on storage.
 */
export const readAppearancePreference = () => {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearancePreference(stored) ? stored : DEFAULT_APPEARANCE_PREFERENCE;
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCE;
  }
};

/** @returns {boolean} whether it was persisted (false = in memory only). */
export const writeAppearancePreference = (preference) => {
  if (!isAppearancePreference(preference)) return false;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
};

export const systemAppearance = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
};

/** `dark | light | system` → `dark | light`. */
export const resolveAppearance = (preference) =>
  (preference === 'system' ? systemAppearance() : preference === 'light' ? 'light' : 'dark');

/** Subscribe to the device switching scheme; returns the unsubscribe. */
export const onSystemAppearanceChange = (callback) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(LIGHT_QUERY);
  const handler = () => callback(query.matches ? 'light' : 'dark');
  query.addEventListener?.('change', handler);
  return () => query.removeEventListener?.('change', handler);
};

/**
 * Put an appearance on the document: an attribute flip, never a reload or a
 * remount, so a judge mid-slip keeps every mark (plan §14.8, R15).
 *
 * `suppressTransitions` holds every transition off for one frame so a switch
 * does not cross-fade two hundred elements at once — the class it sets is
 * matched by the single `!important` rule in index.css.
 */
export const applyAppearance = (resolved, preference, { suppressTransitions = false } = {}) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (suppressTransitions) root.classList.add('appearance-switching');

  root.setAttribute('data-appearance', resolved);
  root.style.colorScheme = resolved;

  syncThemeColor(resolved, preference);

  if (suppressTransitions) {
    const release = () => root.classList.remove('appearance-switching');
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(release));
    } else {
      release();
    }
  }
};
