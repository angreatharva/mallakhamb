import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the browser-driven workflows in `e2e/`.
 *
 * These specs are NOT pure tests — they drive the real UI against a real API
 * and write to whatever database the Server is pointed at. Treat them as
 * seeding/verification runbooks, and only ever run them against a local or
 * disposable environment.
 *
 * Vitest owns `src/**` (see vite.config.js `test.include`); Playwright owns
 * `e2e/**`. The two never see each other's files.
 */
export default defineConfig({
  testDir: './e2e',

  // Registration mutates shared state (a unique email, a team roster), so the
  // specs are deliberately serial and never retried — a retry would replay a
  // registration that already succeeded and fail on "email already exists".
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  /**
   * Starts the Vite dev server only if nothing is already serving baseURL.
   * The API (Server/, default :5000) is NOT managed here — start it yourself
   * with `npm start` in Server/ before running these specs.
   */
  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL || 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
