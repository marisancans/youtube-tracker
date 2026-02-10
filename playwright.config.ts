import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, 'packages/extension/dist');
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  timeout: 60000,
  
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry',
    baseURL: apiBaseUrl,
  },

  projects: [
    // Comprehensive API tests - all sync endpoints
    {
      name: 'api-complete',
      testDir: './tests/api',
      testMatch: /sync-complete\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
    // Basic API tests
    {
      name: 'api',
      testDir: './tests/e2e',
      testMatch: /api\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
    // Extension tests - require display (headed mode)
    {
      name: 'extension',
      testDir: './tests/e2e',
      testMatch: /tracking\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
          ],
        },
      },
    },
    // Sync flow E2E tests - full pipeline
    {
      name: 'sync-flow',
      testDir: './tests/e2e',
      testMatch: /sync-flow\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
          ],
        },
      },
    },
    // Live YouTube tests - tests on real YouTube
    {
      name: 'live-youtube',
      testDir: './tests',
      testMatch: /live-youtube\.spec\.ts/,
      timeout: 120000, // 2 minutes per test (YouTube can be slow)
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // Must be headed for extensions
      },
    },
  ],

  // Ensure backend is running (skip in Docker - handled by docker-compose)
  webServer: process.env.API_BASE_URL ? undefined : {
    command: 'docker compose up -d && sleep 3',
    cwd: __dirname,
    url: 'http://localhost:8000/health',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
