/**
 * The Light/Dark switch is on EVERY page, and one choice carries across the whole site on that device.
 *
 * One browser — one device. Light is chosen once, through the switch, on Home. Then every page of every area is
 * visited at a phone and a desktop width, signing in as each role in turn (the cookies cleared between roles, as
 * a logout would; the device's storage kept). On each page:
 *   - the switch is there and visible (a page with no header must still carry it);
 *   - the page is in the chosen appearance — the attribute AND the drawn page background.
 * Then: a second tab, open all along, follows a change live; a reload keeps it; "Match device" follows the OS.
 *
 * Read-only.   npx playwright test e2e/appearance-everywhere.spec.js --project=chromium
 */
import { test, expect } from '@playwright/test';
import { ROUTES_BY_AREA, signInAs } from './support/audit-routes.js';
import { settle } from './support/responsive-audit.js';
import { chooseCategory } from './support/scoring-flows.js';

const WIDTHS = [375, 1366];
// The TRIALS category with published scores, for the pages that need one chosen.
const SHEET_CATEGORY = [
  [/^Gender/, /^Female$/], [/^Age Group/, /Above ?16/i], [/^Competition Type/, /^Competition I\b(?!I)/], [/^Apparatus/, /Rope/i],
];
const JUDGE_CATEGORY = { gender: 'Female', ageGroup: 'Above16', competitionType: 'Competition I', apparatus: 'Rope Mallakhamb' };
// Pages the audit route list does not name, all reached by URL. (Dashboard tabs share the dashboard's header.)
const EXTRA = {
  public: [{ name: 'Reset password (token link)', url: '/reset-password/not-a-real-token' }],
  admin: [{ name: 'Admin dashboard: teams tab', url: '/admin/dashboard/teams' }],
  superadmin: [{ name: 'Superadmin dashboard: lots tab', url: '/superadmin/dashboard/lots' }],
};

/** What the page shows: the switch (present, drawn, not hidden) and the appearance actually applied. */
const inspect = (page) => page.evaluate(() => {
  const switches = [...document.querySelectorAll('button[aria-label^="Appearance:"]')].filter((b) => {
    const r = b.getBoundingClientRect(); const s = getComputedStyle(b);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  });
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().split(/\s+/).map(Number);
  return {
    url: location.pathname,
    switches: switches.length,
    label: switches[0]?.getAttribute('aria-label') || '',
    attribute: document.documentElement.dataset.appearance,
    // The page background channel the whole UI is drawn on: near-white in light, near-black in dark.
    drawn: bg.length === 3 ? (bg.reduce((a, b) => a + b, 0) / 3 > 128 ? 'light' : 'dark') : '?',
  };
});

const choose = async (page, option) => {
  await page.locator('button[aria-label^="Appearance:"]').filter({ visible: true }).first().click();
  await page.getByRole('menuitemradio', { name: option, exact: option !== 'Match device' }).click();
  await page.waitForTimeout(300);
};

test('the switch is on every page, and one choice carries across the whole site', async ({ page, context }) => {
  test.setTimeout(45 * 60_000);
  /*
   * The sign-in helper starts every role from a WIPED browser (`localStorage.clear()` in support/browser.js) —
   * a brand-new device, which is exactly what this test must not be: the first version "found" every page dark
   * because of it. A real logout clears session storage only, and the app never calls localStorage.clear(), so
   * here the helper's wipe keeps the one key a device keeps: its appearance. Nothing in the app is changed.
   */
  await context.addInitScript(() => {
    const clear = Storage.prototype.clear;
    Storage.prototype.clear = function keepDeviceAppearance() {
      const kept = this === window.localStorage ? this.getItem('mk-appearance') : null;
      clear.call(this);
      if (kept) this.setItem('mk-appearance', kept);
    };
  });
  const rows = []; const bad = [];
  const check = async (area, name, expected) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.waitForTimeout(500);
      const s = await inspect(page);
      const problems = [];
      if (!s.switches) problems.push('NO SWITCH');
      if (s.attribute !== expected) problems.push(`attribute=${s.attribute}`);
      if (s.drawn !== expected) problems.push(`drawn ${s.drawn}`);
      const line = `  ${area.padEnd(10)} ${name} (${s.url}) @${width}: ${problems.length ? problems.join(', ') : `ok — ${s.label}`}`;
      rows.push(line);
      if (problems.length) bad.push(line);
    }
  };

  try {
  // A fresh device starts dark. Choose Light ONCE, through the switch, on Home.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await settle(page);
  expect((await inspect(page)).attribute).toBe('dark');
  await choose(page, 'Light');
  expect((await inspect(page)).attribute).toBe('light');

  // A second tab on the same device, left open on the public scores page.
  const other = await context.newPage();
  await other.goto('/scores');
  await settle(other);
  expect((await inspect(other)).attribute, 'a new tab picks the choice up').toBe('light');

  // Every page of every area.
  for (const [area, config] of Object.entries(ROUTES_BY_AREA)) {
    if (config.login) {
      await context.clearCookies(); // as a logout would; the device's own storage stays
      await page.evaluate(() => sessionStorage.clear()).catch(() => {});
      await page.setViewportSize({ width: 1366, height: 900 });
      await signInAs(page, area);
    }
    for (const route of [...config.routes, ...(EXTRA[area] || [])]) {
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.goto(route.url);
      await settle(page);
      if (route.prepare) await route.prepare(page).catch(() => {});
      await check(area, route.name, 'light');
    }
  }

  // Pages that only open once something is chosen — opened by URL they redirect, so the sweep above saw the
  // page they redirect to. Reached the way a person reaches them.
  await page.setViewportSize({ width: 1366, height: 900 });
  await context.clearCookies();
  await signInAs(page, 'admin');
  await page.goto('/admin/dashboard/scores');
  await settle(page);
  for (const [label, name] of SHEET_CATEGORY) {
    await page.locator('label', { hasText: label }).first().locator('xpath=following-sibling::*[1]')
      .locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('option', { name }).first().click();
    await page.waitForTimeout(500);
  }
  await page.getByText(/Loading data/i).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  await page.getByText(/View Details/).first().click();
  await expect(page).toHaveURL(/\/admin\/scoring/);
  // The sheet shows a full-screen loader (no header) until its data arrives — check the sheet, not the loader.
  await page.getByText('Loading scoring page…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  await expect(page.getByText('Admin Scoring', { exact: true })).toBeAttached({ timeout: 30_000 });
  await settle(page);
  await check('admin', 'Score sheet, opened from a team', 'light');

  await context.clearCookies();
  await signInAs(page, 'superadmin');
  // The payment page reads the pending registration from session storage, as the Add Player form leaves it.
  // Nothing is paid or sent: the page is only looked at.
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({
    playerData: { firstName: 'Look', lastName: 'Only', teamId: 'team', competitionId: 'meet', apparatus: {} },
    teamLabel: 'SGAM-TRIALS-TEAM-A', competitionLabel: 'SGAM-TRIALS-1', competitionPlayerFee: 500,
  })), 'mallakhamb_superadmin_player_checkout_v1');
  await page.goto('/superadmin/add-player-payment');
  await settle(page);
  await expect(page).toHaveURL(/\/superadmin\/add-player-payment/);
  await check('superadmin', 'Add player payment, with a pending registration', 'light');

  await context.clearCookies();
  await signInAs(page, 'judge');
  await page.goto('/judge/dashboard');
  await settle(page);
  await chooseCategory(page, JUDGE_CATEGORY);
  await settle(page);
  await check('judge', 'Judge dashboard, category chosen', 'light');
  await page.getByRole('button', { name: /Set Sequence/ }).click();
  await expect(page).toHaveURL(/\/judge\/sequence$/);
  await settle(page);
  await check('judge', 'Running order', 'light');
  await page.goto('/judge/dashboard');
  await settle(page);
  await page.getByRole('button', { name: /SGAM-TRIALS-TEAM-A/i }).first().click();
  await expect(page).toHaveURL(/\/judge\/team\//);
  await settle(page);
  await check('judge', 'Team athletes', 'light');

  // Flip back to Dark from deep inside the judge area: the other tab follows WITHOUT a reload.
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/judge/profile');
  await settle(page);
  await choose(page, 'Dark');
  await other.waitForTimeout(800);
  expect((await inspect(other)).attribute, 'the open tab follows the change live').toBe('dark');
  await check('judge', 'Judge profile, after choosing Dark there', 'dark');
  await page.goto('/scores');
  await settle(page);
  await check('public', 'Public scores, after choosing Dark on the judge profile', 'dark');
  await page.reload();
  await settle(page);
  await check('public', 'Public scores, after a reload', 'dark');

  // "Match device" follows the operating system, live.
  await choose(page, 'Match device');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(500);
  await check('public', 'Public scores, Match device with the OS in light', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(500);
  await check('public', 'Public scores, Match device with the OS in dark', 'dark');

  } finally {
    console.log(`\n===== appearance everywhere =====\n${rows.join('\n')}`);
  }
  expect(bad).toEqual([]);
});
