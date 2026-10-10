/**
 * Loading the look fonts (docs/design-language/PLAN.md §5.4).
 *
 * The @font-face rules live in ./look-fonts.js, a separate CSS chunk, and load
 * only with what is drawn in them — never on a classic route (see that file).
 * A browser then downloads a font file only when text is actually set in it.
 *
 * On a route whose look uses web fonts, `loadLookFonts` (App.jsx, beside
 * `applyLook`) does two things as early as possible:
 *   - preloads the two latin first-paint files (the font budget, §5.4);
 *   - loads the @font-face chunk.
 */
import archivoLatin from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url';
import tekoLatin600 from '@fontsource/teko/files/teko-latin-600-normal.woff2?url';

/** The latin files a prime-time first screen is set in — the font budget (§5.4). */
export const FIRST_PAINT_FONTS = [archivoLatin, tekoLatin600];

/** Looks whose screens are set in the web fonts. */
const LOOKS_WITH_WEB_FONTS = new Set(['prime-time']);

const preloaded = new Set();

/** Add a preload link per first-paint file, once per page load. */
export const preloadFirstPaintFonts = () => {
  if (typeof document === 'undefined') return [];
  const added = [];
  for (const href of FIRST_PAINT_FONTS) {
    if (preloaded.has(href)) continue;
    preloaded.add(href);
    const link = document.createElement('link');
    // Attributes, not properties: `as` is not reflected everywhere (jsdom).
    link.setAttribute('rel', 'preload');
    link.setAttribute('as', 'font');
    link.setAttribute('type', 'font/woff2');
    link.setAttribute('crossorigin', 'anonymous');
    link.setAttribute('href', href);
    document.head.appendChild(link);
    added.push(href);
  }
  return added;
};

let fontFaces = null;

/**
 * Everything a look needs to draw its type: a no-op for a look without web fonts.
 * @param {string} look
 * @returns {Promise<unknown>|null} the @font-face chunk loading, or null
 */
export const loadLookFonts = (look) => {
  if (!LOOKS_WITH_WEB_FONTS.has(look)) return null;
  preloadFirstPaintFonts();
  fontFaces ??= import('./look-fonts.js');
  return fontFaces;
};
