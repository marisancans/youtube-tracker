/**
 * Extension E2E tests - require display (VNC in Docker, or local Chrome)
 * Tests the extension loading, YouTube tracking, and backend sync
 */
import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000';

// Extension path - works both locally and in Docker
const extensionPath = process.env.EXTENSION_PATH || path.join(__dirname, '../../packages/extension/dist');

test.describe.configure({ mode: 'serial' });

// Helper to dismiss YouTube consent if present
async function dismissConsent(page: Page) {
  try {
    const rejectBtn = page.locator('button:has-text("Reject all"), button:has-text("Reject")').first();
    if (await rejectBtn.isVisible({ timeout: 5000 })) {
      await rejectBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {
    // No consent dialog
  }
}

test.describe('Extension E2E Tests', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    console.log('Extension path:', extensionPath);
    console.log('API base:', API_BASE);
    
    // Launch browser with extension
    const browser = await chromium.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    
    context = await browser.newContext();
    
    // Wait for service worker to load
    await context.waitForEvent('serviceworker', { timeout: 30000 }).catch(() => {
      console.log('No service worker detected within timeout - extension may not have loaded');
    });
    
    console.log('Browser context created');
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('backend is reachable', async () => {
    const page = await context.newPage();
    try {
      const response = await page.request.get(`${API_BASE}/health`);
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.status).toBe('ok');
    } finally {
      await page.close();
    }
  });

  test('extension loads on YouTube', async () => {
    const page = await context.newPage();
    try {
      await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await dismissConsent(page);
      await page.waitForTimeout(3000);

      // Check for content script marker
      const hasContentScript = await page.evaluate(() => {
        return !!(window as any).__YT_DETOX_TRACKER__;
      });

      console.log('Content script loaded:', hasContentScript);
      // Extension should inject content script
      expect(hasContentScript).toBeTruthy();
    } finally {
      await page.close();
    }
  });

  test('tracks video watch', async () => {
    const page = await context.newPage();
    try {
      // Go to a video
      await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await dismissConsent(page);

      // Wait for video
      await page.waitForSelector('video', { timeout: 30000 });
      
      // Try to play
      await page.locator('video').first().click({ force: true }).catch(() => {});
      
      // Watch a bit
      await page.waitForTimeout(5000);

      // Check content script is tracking
      const trackerState = await page.evaluate(() => {
        const tracker = (window as any).__YT_DETOX_TRACKER__;
        return tracker ? { initialized: tracker.initialized, version: tracker.version } : null;
      });

      console.log('Tracker state:', trackerState);
      expect(trackerState).toBeTruthy();
    } finally {
      await page.close();
    }
  });

  test('sync endpoint works', async () => {
    const page = await context.newPage();
    try {
      // Test sync endpoint directly
      const testPayload = {
        userId: 'e2e-test-user',
        lastSyncTime: 0,
        data: {
          videoSessions: [{
            id: `e2e-test-${Date.now()}`,
            videoId: 'dQw4w9WgXcQ',
            title: 'E2E Test Video',
            channel: 'Test Channel',
            startedAt: Date.now() - 60000,
            endedAt: Date.now(),
            watchedSeconds: 60,
            totalDurationSeconds: 212,
            watchedPercent: 28,
            isShort: false,
            pauseCount: 1,
            seekCount: 0,
            tabSwitchCount: 0,
            wasAutoplay: false,
            timestamp: Date.now(),
          }],
          browserSessions: [],
          dailyStats: {},
          scrollEvents: [],
          thumbnailEvents: [],
          pageEvents: [],
          videoWatchEvents: [],
          recommendationEvents: [],
          interventionEvents: [],
          moodReports: [],
        },
      };

      const response = await page.request.post(`${API_BASE}/sync`, {
        data: testPayload,
        headers: { 'X-User-Id': 'e2e-test-user' },
      });

      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      console.log('Sync result:', result);
    } finally {
      await page.close();
    }
  });

  test('videos appear in API after sync', async () => {
    const page = await context.newPage();
    try {
      const response = await page.request.get(`${API_BASE}/sync/videos`, {
        headers: { 'X-User-Id': 'e2e-test-user' },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.videos).toBeDefined();
      console.log('Videos in DB:', data.videos.length);
    } finally {
      await page.close();
    }
  });
});
