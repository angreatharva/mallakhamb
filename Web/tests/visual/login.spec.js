import { expect, test } from '@playwright/test';

test.describe('Visual regression - login page', () => {
  test.setTimeout(60000);

  test('player login page matches baseline', async ({ page }) => {
    await page.goto('/player/login');
    await expect(page.locator('#player-email')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveScreenshot('player-login.png', { fullPage: true, timeout: 20000 });
  });
});
