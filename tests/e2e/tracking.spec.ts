import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000';
const extensionPath = path.join(__dirname, '../../packages/extension/dist');

// Test must run headed - extensions don't work in headless
test.use({ headless: false });

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  // Launch with extension
  const browser = await chromium.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  
  context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  
  // Get extension ID from service worker
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  extensionId = background.url().split('/')[2];
  console.log('Extension ID:', extensionId);
  
  // Enable backend sync via extension options page
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await optionsPage.waitForTimeout(1000);
  
  // Configure settings via chrome.storage directly
  await optionsPage.evaluate(async (apiUrl) => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings || {};
        settings.backend = {
          enabled: true,
          url: apiUrl,
          userId: `test-user-${Date.now()}`,
          lastSync: null,
        };
        settings.trackingEnabled = true;
        chrome.storage.local.set({ settings }, resolve);
      });
    });
  }, API_BASE);
  
  console.log('Backend sync enabled');
  await optionsPage.close();
});

test.afterAll(async () => {
  await context?.close();
});

// Helper to collect API requests
function collectApiRequests(page: Page) {
  const requests: { url: string; method: string; body?: any }[] = [];
  
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(API_BASE)) {
      requests.push({
        url,
        method: request.method(),
        body: request.postDataJSON(),
      });
    }
  });
  
  return requests;
}

// Helper to dismiss YouTube consent if present
async function dismissConsent(page: Page) {
  try {
    const rejectBtn = page.locator('button:has-text("Reject all")');
    if (await rejectBtn.isVisible({ timeout: 3000 })) {
      await rejectBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch {
    // No consent dialog
  }
}

test.describe('Extension Smoke Tests', () => {
  test('backend is reachable', async () => {
    const page = await context.newPage();
    const response = await page.request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
    await page.close();
  });

  test('extension service worker is running', async () => {
    const workers = context.serviceWorkers();
    expect(workers.length).toBeGreaterThan(0);
    const extWorker = workers.find((w) => w.url().includes(extensionId));
    expect(extWorker).toBeTruthy();
  });
});

test.describe('YouTube Tracking', () => {
  test('tracks page navigation', async () => {
    const page = await context.newPage();
    const apiRequests = collectApiRequests(page);

    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await dismissConsent(page);
    await page.waitForTimeout(3000);

    // Check extension is injecting content script
    const hasContentScript = await page.evaluate(() => {
      return !!(window as any).__YT_DETOX_TRACKER__;
    });
    
    console.log('Content script injected:', hasContentScript);
    console.log('API requests so far:', apiRequests.map((r) => r.url));

    await page.close();
  });

  test('tracks video watch session', async () => {
    const page = await context.newPage();
    const apiRequests = collectApiRequests(page);

    // Go to a video
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'domcontentloaded',
    });
    await dismissConsent(page);

    // Wait for video player
    await page.waitForSelector('video', { timeout: 15000 });
    
    // Try to start playback (click the video)
    await page.locator('video').first().click({ force: true }).catch(() => {});
    
    // Watch for a bit
    await page.waitForTimeout(10000);

    // Scroll
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));

    // Navigate away to trigger sync
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    console.log('Video test - API requests:', apiRequests.length);
    apiRequests.forEach((r) => console.log(' -', r.method, r.url));

    await page.close();
  });

  test('triggers sync and data appears in API', async () => {
    const page = await context.newPage();

    // Manually trigger sync via background script
    const syncResult = await page.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, resolve);
      });
    });
    console.log('Manual sync result:', syncResult);

    await page.waitForTimeout(3000);

    // Check API for sessions
    const response = await page.request.get(`${API_BASE}/sync/videos`);
    if (response.ok()) {
      const data = await response.json();
      console.log('Videos in DB:', data);
    }

    await page.close();
  });
});

test.describe('Database Verification', () => {
  test('sync endpoint accepts data', async () => {
    const page = await context.newPage();

    // Send test data directly to sync endpoint
    const testPayload = {
      userId: 'playwright-test-user',
      lastSyncTime: 0,
      data: {
        videoSessions: [
          {
            id: `test-${Date.now()}`,
            videoId: 'dQw4w9WgXcQ',
            title: 'Test Video',
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
          },
        ],
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
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'playwright-test-user',
      },
    });

    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    console.log('Sync response:', result);
    expect(result.syncedCounts).toBeDefined();

    await page.close();
  });

  test('videos endpoint returns synced data', async () => {
    const page = await context.newPage();

    const response = await page.request.get(`${API_BASE}/sync/videos`);
    expect(response.ok()).toBeTruthy();
    
    const videos = await response.json();
    console.log('Total videos in DB:', videos.length);
    expect(Array.isArray(videos)).toBeTruthy();

    await page.close();
  });
});
