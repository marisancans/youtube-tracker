import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, 'packages/extension/dist');
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8000';

export default defineConfig({
  testDir: './tests/e2e',
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
    // API tests - run anywhere (headless OK)
    {
      name: 'api',
      testMatch: /api\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
    // Extension tests - require display (headed mode)
    {
      name: 'extension',
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
  ],

  // Ensure backend is running
  webServer: {
    command: 'docker compose up -d && sleep 3',
    cwd: __dirname,
    url: 'http://localhost:8000/health',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
