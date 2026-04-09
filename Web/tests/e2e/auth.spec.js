import { expect, test } from '@playwright/test';

const apiPattern = 'http://localhost:5000/api/**';
const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDB9.signature';

async function mockCommonApi(page) {
  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname.endsWith('/coaches/status') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ step: 'create-team' }),
      });
      return;
    }

    if (pathname.endsWith('/coaches/login') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: validToken,
          coach: { _id: 'coach-1', name: 'Coach Demo', email: 'coach@example.com' },
        }),
      });
      return;
    }

    if (pathname.endsWith('/players/login') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: validToken,
          player: { _id: 'player-1', firstName: 'Player', lastName: 'Demo', team: null },
        }),
      });
      return;
    }

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

    if (pathname.endsWith('/coaches/register') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          token: validToken,
          coach: { _id: 'coach-2', name: 'New Coach', email: 'newcoach@example.com' },
        }),
      });
      return;
    }

    if (pathname.endsWith('/players/register') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          token: validToken,
          player: { _id: 'player-2', firstName: 'New', lastName: 'Player', team: null },
        }),
      });
      return;
    }

    if (pathname.endsWith('/public/submitted-teams') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ teams: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

test.describe('Authentication flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockCommonApi(page);
  });

  test('player login redirects to team selection', async ({ page }) => {
    await page.goto('/player/login');

    await page.locator('#player-email').fill('player@example.com');
    await page.locator('#player-password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/player\/select-team$/);
  });

  test('coach login redirects to create team', async ({ page }) => {
    await page.goto('/coach/login');

    await page.locator('#coach-email').fill('coach@example.com');
    await page.locator('#coach-password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/coach\/create-team$/);
  });

  test('judge login redirects to scoring', async ({ page }) => {
    await page.goto('/judge/login');

    await page.locator('#judge-username').fill('judgeuser');
    await page.locator('#judge-password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/judge\/scoring$/);
    await expect(page.getByText('Select Competition Type')).toBeVisible();
  });

  test('player registration redirects to team selection', async ({ page }) => {
    await page.goto('/player/register');

    await page.locator('#player-reg-firstName').fill('Aarav');
    await page.locator('#player-reg-lastName').fill('Patel');
    await page.locator('#player-reg-email').fill('aarav@example.com');
    await page.locator('#player-reg-phone').fill('9999999999');
    await page.locator('#player-reg-dateOfBirth').fill('2008-04-01');
    await page.locator('#player-reg-gender').selectOption('Male');
    await page.locator('#player-reg-password').fill('Password123!');
    await page.locator('#player-reg-confirmPassword').fill('Password123!');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(/\/player\/select-team$/);
  });

  test('coach registration redirects to create team', async ({ page }) => {
    await page.goto('/coach/register');

    await page.locator('#coach-reg-name').fill('Coach One');
    await page.locator('#coach-reg-email').fill('coach1@example.com');
    await page.locator('#coach-reg-phone').fill('8888888888');
    await page.locator('#coach-reg-organization').fill('Demo Club');
    await page.locator('#coach-reg-password').fill('Password123!');
    await page.locator('#coach-reg-confirmPassword').fill('Password123!');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(/\/coach\/create-team$/);
  });
});
