import { expect, test } from '@playwright/test';
import { jsonResponse, mockApi } from './helpers';

const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDB9.signature';

test.describe('Visual regression - dashboard page', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await mockApi(page, [
      {
        match: (pathname, method) => pathname.endsWith('/superadmin/login') && method === 'POST',
        response: jsonResponse(200, {
          token: validToken,
          admin: { _id: 'super-1', name: 'Super Admin', email: 'superadmin@example.com' },
        }),
      },
      {
        match: (pathname, method) => pathname.endsWith('/superadmin/dashboard') && method === 'GET',
        response: jsonResponse(200, {
          data: {
            totalCompetitions: 1,
            totalTeams: 12,
            totalPlayers: 96,
            totalJudges: 8,
          },
        }),
      },
    ]);
  });

  test('superadmin dashboard matches baseline', async ({ page }) => {
    await page.goto('/superadmin/login');
    await page.getByRole('textbox', { name: 'Email *' }).fill('superadmin@example.com');
    await page.getByRole('textbox', { name: 'Password *' }).fill('Password123!');
    await page.getByRole('button', { name: /Enter Command Center|Sign In/i }).click();

    await expect(page).toHaveURL(/\/superadmin\/dashboard$/, { timeout: 15000 });
    await expect(page).toHaveScreenshot('superadmin-dashboard.png', { fullPage: true, timeout: 20000 });
  });
});
