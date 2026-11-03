/**
 * Recover from a deploy that happened while the page was open.
 *
 * Screens are separate files with a content hash in their name. A tab loaded
 * before a deploy still asks for the OLD names, which the new deploy no longer
 * serves (404), so opening a screen threw and the error boundary showed
 * "Something went wrong". One reload fetches the new index and its new file
 * names. Only once per window: if the files are genuinely missing, a reload
 * loop would be worse than the error screen.
 */

const RELOADED_AT_KEY = 'mk_stale_chunk_reload_at';
const ONCE_WINDOW_MS = 30_000;

/** The messages browsers give for a lazy screen whose file could not be loaded. */
const STALE_CHUNK_MESSAGE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|is not a valid JavaScript MIME type/i;

/** @param {unknown} error @returns {boolean} */
export const isStaleChunkError = (error) => STALE_CHUNK_MESSAGE.test(String(error?.message ?? error ?? ''));

/**
 * Reload the page, unless this tab already did so in the last 30 seconds.
 * @param {{ storage?: Storage, reload?: () => void, now?: number }} [deps] - for tests
 * @returns {boolean} whether a reload was started
 */
export const reloadOnceForNewDeploy = ({
  storage = window.sessionStorage,
  reload = () => window.location.reload(),
  now = Date.now(),
} = {}) => {
  try {
    const last = storage.getItem(RELOADED_AT_KEY);
    if (last !== null && now - Number(last) < ONCE_WINDOW_MS) return false;
    storage.setItem(RELOADED_AT_KEY, String(now));
  } catch {
    // No session storage (private mode quirks): never risk a loop.
    return false;
  }
  reload();
  return true;
};

/**
 * Vite fires `vite:preloadError` when a lazy screen (or its CSS) fails to load.
 * Reload once instead of letting the import throw into the error boundary.
 */
export const installStaleChunkReload = () => {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForNewDeploy()) event.preventDefault();
  });
};
