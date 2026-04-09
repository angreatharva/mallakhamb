import { expect, test } from '@playwright/test';
import { jsonResponse, mockApi } from './helpers';

const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDB9.signature';

test.describe('Visual regression - scoring page', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await mockApi(page, [
      {
        match: (pathname, method) => pathname.endsWith('/judge/login') && method === 'POST',
        response: jsonResponse(200, {
          token: validToken,
          judge: {
            _id: 'judge-1',
            name: 'Judge Demo',
            judgeType: 'Execution',
            gender: 'Male',
            ageGroup: 'Senior',
            competitionTypes: ['competition_1'],
          },
        }),
      },
      {
        match: (pathname, method) => pathname.endsWith('/public/submitted-teams') && method === 'GET',
        response: jsonResponse(200, {
          teams: [
            {
              _id: 'team-1',
              name: 'Team Phoenix',
              coach: { name: 'Coach One' },
              players: [
                {
                  ageGroup: 'Senior',
                  player: {
                    _id: 'player-1',
                    firstName: 'Aarav',
                    lastName: 'Patel',
                    gender: 'Male',
                  },
                },
              ],
            },
          ],
        }),
      },
      {
        match: (pathname, method) => pathname.endsWith('/public/save-score') && method === 'POST',
        response: jsonResponse(200, { success: true }),
      },
    ]);
  });

  test('judge scoring page matches baseline', async ({ page }, testInfo) => {
    await page.goto('/judge/login');
    await page.locator('#judge-username').fill('judgeuser');
    await page.locator('#judge-password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/judge\/scoring$/, { timeout: 15000 });
    await expect(page.getByText('Select Competition Type')).toBeVisible();
    if (testInfo.project.name === 'visual-mobile') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page).toHaveScreenshot('judge-scoring.png', {
        clip: { x: 0, y: 0, width: 375, height: 700 },
        mask: [page.locator('svg')],
        timeout: 20000,
      });
      return;
    }

    await expect(page.locator('main')).toHaveScreenshot('judge-scoring.png', {
      mask: [page.locator('svg')],
      timeout: 20000,
    });
  });
});
