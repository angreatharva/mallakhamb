/**
 * The look fonts' @font-face rules, as their own CSS chunk.
 *
 * Imported by what is drawn in them: Home (statically, so its first screen has
 * them), prime-time routes (through `loadLookFonts` in ./fonts.js) and, from
 * Phase 3, the look primitives. Never by the app entry: merely declaring these
 * faces changed Chrome's anti-aliasing on a classic screen (3–7 pixels on the
 * judge profile's avatar corner — measured, design-language PLAN §14), and a
 * classic route must not move.
 *
 *   Archivo Variable (wdth + wght)   text and UI
 *   Teko 500 / 600                   display type and big numbers (≥ 24px)
 *
 * Faces are split by `unicode-range`, so Teko's Devanagari subset (≈33 KB)
 * downloads only where Marathi text appears.
 */
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/teko/500.css';
import '@fontsource/teko/600.css';
