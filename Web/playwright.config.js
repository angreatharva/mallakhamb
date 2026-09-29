import { defineConfig, devices } from '@playwright/test';

/**
 * iPhone and iPad Safari, for the read-only audit specs only.
 *
 * Every device includes iPhone and Safari, and WebKit is where `dvh`, autofill
 * colours, safe-area insets and the under-16px input zoom actually behave the
 * way they do on the hardware. Chromium emulating an iPhone does none of that.
 *
 * OPT-IN (`E2E_WEBKIT=1`) and RESTRICTED to the responsive/visual specs, for
 * two reasons: WebKit is a separate download (`npm run test:e2e:install:webkit`)
 * that a plain `npx playwright test` must not demand; and Playwright runs every
 * spec in every project, so an unrestricted project would replay the seeding
 * specs a second time and fail on "email already exists".
 */
function webkitProjects() {
  if (!process.env.E2E_WEBKIT) return [];
  const auditOnly = /(responsive-|visual-).*\.spec\.js$/;
  return [
    { name: 'iphone-13', testMatch: auditOnly, use: { ...devices['iPhone 13'] } },
    { name: 'ipad-mini', testMatch: auditOnly, use: { ...devices['iPad Mini'] } },
    { name: 'ipad-pro-11', testMatch: auditOnly, use: { ...devices['iPad Pro 11'] } },
    { name: 'ipad-pro-11-landscape', testMatch: auditOnly, use: { ...devices['iPad Pro 11 landscape'] } },
  ];
}

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

  /*
   * Where `toHaveScreenshot` baselines live (only visual-baseline.spec.js uses
   * it). Outside `test-results/` on purpose: Playwright empties that directory
   * at the start of every run, which would delete the baseline a run is
   * supposed to compare against. Gitignored — see .gitignore.
   */
  snapshotPathTemplate: '{testDir}/../.visual-baseline/{projectName}/{arg}{ext}',

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /*
     * Video OFF by default. `retain-on-failure` does not mean "record on
     * failure" — it records every test and throws the passes away, so a
     * two-hour seeding run pays for encoding it will never watch. The failure
     * screenshot and the error-context snapshot next to it have been enough
     * every time; set E2E_VIDEO=1 for the run where they are not.
     */
    video: process.env.E2E_VIDEO ? 'retain-on-failure' : 'off',
    actionTimeout: 15_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...webkitProjects(),
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
