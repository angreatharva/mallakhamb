import { expect, test } from '@playwright/test';

const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDB9.signature';

test('coach team creation flow', async ({ page }) => {
  await page.route('http://localhost:5000/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

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

    if (pathname.endsWith('/coaches/status') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ step: 'create-team' }),
      });
      return;
    }

    if (pathname.endsWith('/coaches/team') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            _id: 'team-1',
            name: 'Team Phoenix',
            description: 'Sample team',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/coaches/competitions/open') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          competitions: [
            { _id: 'comp-1', name: 'District Championship', competitionType: 'competition_1' },
          ],
        }),
      });
      return;
    }

    if (
      pathname.includes('/coaches/team/') &&
      pathname.endsWith('/register-competition') &&
      method === 'POST'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Team registered for competition successfully!' }),
      });
      return;
    }

    if (pathname.endsWith('/coaches/dashboard') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            team: { _id: 'team-1', name: 'Team Phoenix', players: [] },
            paymentStatus: 'paid',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto('/coach/login');
  await page.locator('#coach-email').fill('coach@example.com');
  await page.locator('#coach-password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/coach\/create-team$/);

  await page.locator('#team-name').fill('Team Phoenix');
  await page.locator('#team-desc').fill('Sample team description');
  await page.getByRole('button', { name: 'Create Team' }).click();

  await expect(page).toHaveURL(/\/coach\/select-competition$/);
});
