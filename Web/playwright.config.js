import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 4,
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    timeout: 360000,
    reuseExistingServer: !isCI,
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /e2e\/.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testMatch: /e2e\/.*\.spec\.js/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: /e2e\/.*\.spec\.js/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'visual-mobile',
      testMatch: /visual\/.*\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: 'visual-tablet',
      testMatch: /visual\/.*\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'visual-desktop',
      testMatch: /visual\/.*\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});
