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
    
    // Use launchPersistentContext for extension support
    // This is the recommended way to load extensions in Playwright
    const userDataDir = '/tmp/test-user-data-' + Date.now();
    
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        // Essential Docker flags
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        // Stability
        '--no-first-run',
        '--disable-background-networking',
      ],
    });
    
    // Wait for service worker to load
    const sw = await context.waitForEvent('serviceworker', { timeout: 30000 }).catch((e) => {
      console.log('No service worker detected within timeout:', e.message);
      return null;
    });
    
    if (sw) {
      console.log('Service worker loaded:', sw.url());
    }
    
    // Give extension a moment to initialize
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Browser context created, service workers:', context.serviceWorkers().map(w => w.url()));
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
    // Use existing page from context (first one) or create new
    const pages = context.pages();
    const page = pages[0] || await context.newPage();
    
    // Collect console messages
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('YT Detox') || text.includes('extension') || msg.type() === 'error') {
        logs.push(`[${msg.type()}] ${text}`);
      }
    });
    page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
    
    try {
      // Navigate to YouTube
      console.log('Navigating to YouTube...');
      await page.goto('https://www.youtube.com', { waitUntil: 'networkidle', timeout: 60000 });
      console.log('Page loaded, URL:', page.url());
      
      await dismissConsent(page);
      
      // Wait for content script
      await page.waitForTimeout(5000);

      // Content scripts run in isolated world, so window globals won't be visible
      // Check for DOM elements or console logs instead
      const extensionActive = logs.some(l => l.includes('YT Detox') && l.includes('Initializing'));
      
      // Also check for extension's DOM element (widget container)
      const hasWidgetContainer = await page.evaluate(() => {
        return !!document.getElementById('yt-detox-widget-root');
      });
      
      console.log('Extension active (from logs):', extensionActive);
      console.log('Widget container present:', hasWidgetContainer);
      console.log('Console logs:', logs);
      
      // Extension is working if we see its initialization logs
      expect(extensionActive).toBeTruthy();
    } finally {
      // Don't close page - keep for other tests
    }
  });

  test('tracks video watch', async () => {
    const page = await context.newPage();
    
    // Collect extension logs
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('YT Detox') || text.includes('video')) {
        logs.push(`[${msg.type()}] ${text}`);
      }
    });
    
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

      // Check content script is running (via console logs)
      // Note: Can't check window globals due to isolated world
      const extensionRunning = logs.some(l => l.includes('YT Detox'));
      
      console.log('Extension logs:', logs);
      console.log('Extension running:', extensionRunning);
      
      // Extension should be active on video page
      expect(extensionRunning).toBeTruthy();
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
