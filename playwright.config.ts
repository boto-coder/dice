import { defineConfig, devices } from '@playwright/test';

// Firefox and WebKit (Safari's engine) are opt-in: `npm run test:firefox` and
// `npm run test:webkit`. They need `npx playwright install firefox webkit` once;
// WebKit also needs system libraries that Playwright only installs on
// Ubuntu/Debian (`npx playwright install-deps`) and macOS.
const otherBrowsers = process.env.ALL_BROWSERS
  ? [
      { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
      { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
    ]
  : [];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    ...otherBrowsers,
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
