/*
 * Appearance bootstrap (dark | light), run before any stylesheet.
 *
 * A CLASSIC script on purpose: module scripts are deferred, so the page would
 * paint once in the wrong appearance first. An external same-origin file rather
 * than inline, so it stays valid under `script-src 'self'` whenever the CSP
 * drops 'unsafe-inline'. Mirrors src/utils/ui/appearance.js — keep them in step.
 *
 * `?appearance=dark|light|system` sets the preference (and keeps it) — handy for
 * tests and links; people choose it from the AppearanceMenu in every shell.
 */
(function () {
  var KEY = 'mk-appearance';
  var VALID = { dark: 1, light: 1, system: 1 };
  var pref = 'dark';
  try {
    var asked = new URLSearchParams(location.search).get('appearance');
    if (VALID[asked]) {
      pref = asked;
      localStorage.setItem(KEY, asked);
    } else if (VALID[localStorage.getItem(KEY)]) {
      pref = localStorage.getItem(KEY);
    }
  } catch (e) { /* storage refused (some private modes): dark, in memory */ }

  var resolved = pref === 'system'
    ? (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : pref;
  var root = document.documentElement;
  root.setAttribute('data-appearance', resolved);
  // The default look (src/utils/ui/look.js DEFAULT_LOOK); the app then sets the
  // route's own look before its first paint (docs/design-language/PLAN.md §4.4).
  root.setAttribute('data-look', 'classic');
  root.style.colorScheme = resolved;

  // `system` leaves the two media-scoped theme-color tags to the browser; an
  // explicit choice must win over the OS, so both tags take its colour.
  if (pref !== 'system') {
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) {
      metas[i].setAttribute('content', resolved === 'light' ? '#f6f7f9' : '#0a0a0a');
    }
  }
})();
