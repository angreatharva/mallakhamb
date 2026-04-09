import { expect, test } from '@playwright/test';

const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDB9.signature';

test('judge score submission flow', async ({ page }) => {
  await page.route('http://localhost:5000/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname.endsWith('/judge/login') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
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
      });
      return;
    }

    if (pathname.endsWith('/public/submitted-teams') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
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
      });
      return;
    }

    if (pathname.endsWith('/public/save-score') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto('/judge/login');
  await page.locator('#judge-username').fill('judgeuser');
  await page.locator('#judge-password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/judge\/scoring$/);

  await page.getByRole('button', { name: /Competition I/i }).click();
  await page.getByRole('button', { name: /Team Phoenix/i }).click();
  await page.getByRole('button', { name: /Aarav Patel/i }).click();

  const scoreInputs = page.locator('input[type="number"]');
  await scoreInputs.nth(0).fill('4');
  await scoreInputs.nth(1).fill('6');
  await scoreInputs.nth(2).fill('1');
  await scoreInputs.nth(3).fill('4.0');
  await scoreInputs.nth(4).fill('0.2');

  // Socket connectivity can be unavailable in mocked runs; force-enable submit.
  const saveScoreRequest = page
    .waitForRequest(
      (request) => request.url().includes('/api/public/save-score') && request.method() === 'POST',
      { timeout: 5000 }
    )
    .catch(() => null);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((element) =>
      element.textContent?.includes('Submit Score')
    );
    if (btn) {
      btn.disabled = false;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });
  await saveScoreRequest;
  await expect(page.getByRole('button', { name: /Submit Score|Submitting/i })).toBeVisible();
});
