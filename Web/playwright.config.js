import { defineConfig, devices } from '@playwright/test';

/**
 * Real device profiles, for the read-only audit specs only.
 *
 * Every device includes iPhone and Safari, and WebKit is where `dvh`, autofill
 * colours, safe-area insets and the under-16px input zoom actually behave the
 * way they do on the hardware. Chromium emulating an iPhone does none of that.
 * Android runs Chromium, so its profiles need no extra download; they bring the
 * touch, the coarse pointer and the device viewports (an Android tablet in
 * portrait is 712px wide — below `md` — which a width list never exercises).
 *
 * Each device keeps its OWN viewport: the specs do not resize a device project
 * (see `widthsFor` in e2e/support/responsive-audit.js).
 *
 * OPT-IN (`E2E_DEVICES=1`, or `E2E_WEBKIT=1` for iOS only) and RESTRICTED to
 * the responsive/visual specs, for two reasons: WebKit is a separate download
 * (`npm run test:e2e:install:webkit`) that a plain `npx playwright test` must
 * not demand; and Playwright runs every spec in every project, so an
 * unrestricted project would replay the seeding specs a second time and fail
 * on "email already exists".
 */
function deviceProjects() {
  const all = Boolean(process.env.E2E_DEVICES);
  const auditOnly = /(responsive-|visual-).*\.spec\.js$/;
  const ios = all || process.env.E2E_WEBKIT ? [
    { name: 'iphone-13', testMatch: auditOnly, use: { ...devices['iPhone 13'] } },
    { name: 'ipad-mini', testMatch: auditOnly, use: { ...devices['iPad Mini'] } },
    { name: 'ipad-pro-11', testMatch: auditOnly, use: { ...devices['iPad Pro 11'] } },
    { name: 'ipad-pro-11-landscape', testMatch: auditOnly, use: { ...devices['iPad Pro 11 landscape'] } },
  ] : [];
  const android = all ? [
    { name: 'android-phone', testMatch: auditOnly, use: { ...devices['Galaxy S24'] } },            // 360x780
    { name: 'android-tablet', testMatch: auditOnly, use: { ...devices['Galaxy Tab S4'] } },         // 712x1138, below md
    { name: 'android-fold', testMatch: auditOnly, use: { ...devices['Galaxy Z Fold 7'] } },          // 984x1016, tablet band
    { name: 'android-tablet-landscape', testMatch: auditOnly, use: { ...devices['Galaxy Tab S9 landscape'] } }, // 1024x640, coarse at lg
  ] : [];
  return [...ios, ...android];
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
   * it). Outside `test-results/`, which Playwright empties at the start of
   * every run, and now OUTSIDE THE REPOSITORY: a sibling of the checkout
   * (`../.mallakhamb-visual-baseline/`). Baselines are one machine's rendering
   * of one database, not source — and while any branch tracks them, a checkout
   * between branches overwrites and then deletes an in-repo copy, which broke a
   * run on 2026-09-30. VISUAL_BASELINE_DIR overrides the location.
   */
  snapshotPathTemplate: `${process.env.VISUAL_BASELINE_DIR || '{testDir}/../../../.mallakhamb-visual-baseline'}/{projectName}/{arg}{ext}`,

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
    ...deviceProjects(),
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
