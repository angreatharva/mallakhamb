/**
 * The appearance choice survives logout and reload, with no flash (plan §23).
 *
 * Signs in (the helper clears storage first), picks Light from the shell's
 * AppearanceMenu, logs out, and checks the choice is still there; then reloads
 * while recording every value `data-appearance` takes from the very first
 * script, so a frame painted in dark before light would show up as ['dark',
 * 'light'] and fail.
 *
 *   npx playwright test e2e/appearance-persistence.spec.js --project=chromium
 */
import { test, expect } from '@playwright/test';
import { signInAs } from './support/audit-routes.js';
import { settle } from './support/responsive-audit.js';

test('Light survives logout and reload, with no dark first frame', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await signInAs(page, 'player');
  await page.goto('/player/dashboard');
  await settle(page);

  const trigger = page.getByRole('button', { name: /^Appearance:/ }).first();
  await trigger.click();
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await expect(trigger).toHaveAccessibleName('Appearance: Light');

  await page.getByRole('button', { name: 'Logout' }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/player/dashboard'), { timeout: 30_000 });
  await settle(page);
  expect(await page.evaluate(() => localStorage.getItem('mk-appearance')), 'logout dropped the choice').toBe('light');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');

  // Record every value the attribute takes from the first script on.
  await page.addInitScript(() => {
    window.__appearanceSeen = [];
    const record = () => {
      const value = document.documentElement.getAttribute('data-appearance');
      if (value && window.__appearanceSeen[window.__appearanceSeen.length - 1] !== value) window.__appearanceSeen.push(value);
    };
    // An init script runs before <html> exists, so watch the whole document for the attribute landing on it.
    new MutationObserver(() => record()).observe(document, { attributes: true, subtree: true, childList: true, attributeFilter: ['data-appearance'] });
  });
  await page.reload();
  await settle(page);
  expect(await page.evaluate(() => window.__appearanceSeen), 'a frame in the wrong appearance before light').toEqual(['light']);
  await expect(page.getByRole('button', { name: /^Appearance:/ }).first()).toHaveAccessibleName('Appearance: Light');
});
