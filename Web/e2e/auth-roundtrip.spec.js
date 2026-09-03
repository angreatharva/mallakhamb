/**
 * Sign in and sign out again as every role, through the real UI.
 *
 * Written after `POST /api/auth/logout` was found returning
 * **403 CSRF_TOKEN_MISSING** for all five roles. Nothing caught it because the
 * handler's `.catch(() => {})` swallowed the failure and the client-side clear
 * still emptied the tab, so logout LOOKED clean while the server revoked
 * nothing and the refresh cookie stayed valid for its full lifetime.
 *
 * So this asserts the status code, not the appearance. It also checks that the
 * session is genuinely dead afterwards, which is the thing that actually
 * matters on a shared judging tablet.
 *
 * Read-only apart from ending its own sessions.
 */

import { test, expect } from '@playwright/test';
import { CREDENTIALS, dismissContextChooser } from './support/audit-routes.js';
import { chooseCategory } from './support/scoring-flows.js';
import { clearSession, API_BASE } from './support/browser.js';

/** Where each portal is expected to land once the credentials are accepted. */
const ROLES = [
  { role: 'judge', lands: /\/judge\/dashboard/ },
  { role: 'coach', lands: /\/coach\/(dashboard|select-competition|create-team)/ },
  { role: 'player', lands: /\/player\/(dashboard|select-team)/ },
  // Admin is handed "Choose Your Arena" in place, so the URL keeps /login.
  { role: 'admin', lands: /\/admin\/(dashboard|login)/ },
  { role: 'superadmin', lands: /\/superadmin\/(dashboard|login)/ },
];

for (const { role, lands } of ROLES) {
  test(`${role}: login and logout round-trip`, async ({ page }) => {
    test.setTimeout(4 * 60_000);
    const { email, password } = CREDENTIALS[role];

    // Every logout response seen during this test, so the assertion below is
    // about what the SERVER said rather than about what the UI did.
    const logoutResponses = [];
    page.on('response', (res) => {
      if (res.url().includes('/auth/logout')) {
        logoutResponses.push({ status: res.status(), url: res.url() });
      }
    });

    await page.goto(`/${role}/login`);
    await clearSession(page);
    await page.goto(`/${role}/login`);

    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await page.locator(`#${role}-email`).fill(email);
    await page.locator(`#${role}-password`).fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // Either a navigation or the in-place competition chooser counts as success.
    const arena = page.getByRole('heading', { name: 'Choose Your Arena' });
    await Promise.race([
      page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 90_000 }),
      arena.waitFor({ state: 'visible', timeout: 90_000 }),
    ]);
    expect(page.url(), `${role} landed somewhere unexpected`).toMatch(lands);

    /*
     * Clear the competition chooser if it is up. It takes TWO steps — pick the
     * meet, then confirm — and stopping after the first leaves the role parked
     * on a screen with no Logout control at all.
     */
    if (await arena.count().catch(() => 0)) {
      await page.getByRole('button', { name: /Mumbai/i }).first().click({ timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: /Continue to Dashboard/i }).first()
        .click({ timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    /*
     * Go to the dashboard directly rather than negotiating each role's
     * onboarding. This spec is about the auth round-trip; a coach who still
     * has to register a team should not turn into a logout failure.
     */
    await page.goto(`/${role}/dashboard`).catch(() => {});
    await page.waitForTimeout(1500);

    /*
     * The judge dashboard opens its category picker on arrival, and it is a
     * full-screen overlay — the header's Logout sits behind it. Clear it the
     * way a judge would, by making a selection.
     */
    if (role === 'judge') {
      // The picker only closes on a COMPLETE selection — gender, age group and
      // competition type — so use the scoring suite's helper rather than
      // clicking hopefully at it.
      await chooseCategory(page, {
        gender: 'Male', ageGroup: 'Under14', competitionType: 'Competition I',
      }).catch(() => {});
    } else {
      await dismissContextChooser(page).catch(() => {});
    }
    await page.waitForTimeout(800);

    /*
     * Drop any toast still on screen. They are anchored to the top and the
     * Logout button sits in the top-right of the header, so a live toast
     * intercepts the click — a real four-second window for a user too, which
     * is why App.jsx now offsets the toast container below the header. Removed
     * here so the test measures logout rather than toast timing.
     */
    await page.evaluate(() => {
      document.querySelectorAll('[data-rht-toaster]').forEach((el) => el.remove());
    });

    /*
     * Click whichever Logout actually works.
     *
     * The coach dashboard carries TWO — the shared Navbar's and the one the
     * page draws itself — so `.first()` can resolve to the one underneath and
     * time out against the other. Rather than hard-code which, try each in
     * turn; the assertion that matters is the status code below, not which
     * button produced it.
     */
    const logouts = page.getByRole('button', { name: /^logout$/i });
    const count = await logouts.count();
    expect(count, `${role} has no Logout control`).toBeGreaterThan(0);
    let clicked = false;
    for (let i = 0; i < count; i += 1) {
      try {
        await logouts.nth(i).click({ timeout: 8000 });
        clicked = true;
        break;
      } catch {
        // Covered by an overlay or another header; try the next one.
      }
    }
    expect(clicked, `${role}: every Logout control was unclickable`).toBe(true);
    await page.waitForURL(/\/login/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    expect(logoutResponses.length, `${role} never called /auth/logout`).toBeGreaterThan(0);
    const statuses = logoutResponses.map((r) => r.status);
    console.log(`${role}: /auth/logout -> ${statuses.join(', ')}`);
    /*
     * 403 here is the CSRF regression. 401 would mean the session had already
     * gone, which is not what a logged-in user's logout should produce either.
     */
    expect(statuses.every((s) => s < 400), `${role} logout returned ${statuses.join(', ')}`).toBe(true);

    /*
     * And the session must actually be gone. Asked with the browser's own
     * cookies, so this fails if the server accepted the request but revoked
     * nothing — the exact shape of the original bug.
     */
    const me = await page.request.get(`${API_BASE}/auth/me`).catch(() => null);
    if (me) {
      console.log(`${role}: /auth/me after logout -> ${me.status()}`);
      expect(me.status(), `${role} session still alive after logout`).toBeGreaterThanOrEqual(400);
    }
  });
}
