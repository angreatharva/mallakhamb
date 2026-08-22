import { expect } from '@playwright/test';

/** Plumbing shared by every flow, regardless of role. */

/** The API origin, for reading back what the UI actually stored. */
export const API_BASE = process.env.E2E_API_URL || 'http://localhost:5000/api';

/**
 * Console noise to tolerate, so the error check stays a real signal rather than
 * a permanent red.
 *
 * Empty, and worth keeping that way. It previously held the "frame-ancestors is
 * ignored when delivered via <meta>" warning, which turned out to be a genuine
 * misconfiguration rather than noise — the directive was doing nothing. Moving
 * it to a real response header (vite.config.js, render.yaml) removed the
 * warning at its source. Suppressing an error is the wrong first instinct; find
 * out why it fires before adding to this list.
 */
const IGNORED_CONSOLE = [];

/** Outcomes of a registration submit, for either role. */
export const REGISTERED = 'registered';
export const ALREADY_EXISTS = 'already-exists';

/**
 * Collect genuine console errors for the lifetime of a test.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]} live array, appended to as errors arrive
 */
export const watchConsole = (page) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  return errors;
};

/**
 * Assert no console errors were seen.
 * @param {string[]} errors - the array from watchConsole
 */
export const expectNoConsoleErrors = (errors) => {
  expect(errors, `Console errors during the run:\n${errors.join('\n')}`).toEqual([]);
};

/**
 * Wipe the client-side session so the next page load is a true cold start.
 * The app keeps its token in obfuscated localStorage (secureStorage), so
 * clearing the whole store is the reliable way to sign out.
 * @param {import('@playwright/test').Page} page
 */
export const clearSession = async (page) => {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
};

/**
 * GET a JSON endpoint through the browser's cookie jar, with retries.
 *
 * page.request shares the browser context's cookies, so the httpOnly
 * access_token comes along — and it skips CORS, which a page-side fetch to the
 * API origin would otherwise have to satisfy.
 *
 * Retried because a long run reuses keep-alive sockets, and one the server has
 * already closed surfaces as ECONNRESET before any response exists. That is a
 * connection flake, not a verdict on the data.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path - e.g. '/players/profile'
 * @returns {Promise<any>} the `data` field of the response body
 */
export const apiGet = async (page, path) => {
  let response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await page.request.get(`${API_BASE}${path}`);
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await page.waitForTimeout(500 * attempt);
    }
  }

  expect(response.ok(), `GET ${path} returned ${response.status()}`).toBe(true);
  return (await response.json()).data;
};

/**
 * Click submit and read the outcome off the API response rather than a toast.
 *
 * The toast is the obvious thing to assert on and the wrong one: it is
 * transient, react-hot-toast animates it away within seconds, and a regex over
 * its text can match more than one node and blow up on strict mode. Miss that
 * window and a duplicate email surfaces as an unexplained twenty-second URL
 * timeout. The response is unambiguous and always there.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} endpoint - substring identifying the register call
 * @param {import('@playwright/test').Locator} submit
 * @returns {Promise<'registered'|'already-exists'>}
 */
export const submitAndReadOutcome = async (page, endpoint, submit) => {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes(endpoint) && r.request().method() === 'POST',
    { timeout: 20_000 }
  );
  await submit.click();
  const response = await responsePromise;

  if (response.status() === 409) return ALREADY_EXISTS;

  expect(
    response.status(),
    `POST ${endpoint} failed: ${await response.text()}`
  ).toBe(201);

  return REGISTERED;
};
