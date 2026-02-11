/**
 * Quick debug script - loads extension, goes to YouTube, captures logs
 */
import { chromium, BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../packages/extension/dist');

async function debug() {
  console.log('=== YouTube Detox Debug Session ===\n');
  console.log('Extension path:', EXTENSION_PATH);

  // Launch browser with extension
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  // Capture service worker logs
  context.on('serviceworker', async (sw) => {
    console.log('\n[Service Worker] Registered:', sw.url());
  });

  // Wait for service worker
  let extensionId = '';
  for (let i = 0; i < 20; i++) {
    const sw = context.serviceWorkers()[0];
    if (sw) {
      extensionId = sw.url().split('/')[2];
      console.log('[Extension ID]', extensionId);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!extensionId) {
    console.error('ERROR: Extension service worker not found!');
    await context.close();
    return;
  }

  // Open YouTube
  const page = await context.newPage();

  // Capture ALL console logs
  page.on('console', msg => {
    const type = msg.type().toUpperCase();
    const text = msg.text();
    if (text.includes('YT Detox') || text.includes('yt-detox') || type === 'ERROR') {
      console.log(`[Page ${type}] ${text}`);
    }
  });

  page.on('pageerror', error => {
    console.log('[Page ERROR]', error.message);
  });

  console.log('\n--- Navigating to YouTube homepage ---\n');
  await page.goto('https://www.youtube.com', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check if content script loaded
  const loaded = await page.evaluate(() => (window as any).__YT_DETOX_LOADED__);
  console.log('[Content Script Loaded]', loaded ? 'YES' : 'NO');

  const tracker = await page.evaluate(() => (window as any).__YT_DETOX_TRACKER__);
  console.log('[Tracker Initialized]', tracker ? JSON.stringify(tracker) : 'NO');

  // Check for widget on homepage
  const widgetOnHome = await page.locator('#yt-detox-widget-root').count();
  console.log('[Widget on Homepage]', widgetOnHome > 0 ? 'YES' : 'NO (expected - only on watch/shorts)');

  console.log('\n--- Navigating to a video page ---\n');
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Check for widget on video page
  const widgetOnVideo = await page.locator('#yt-detox-widget-root').count();
  console.log('[Widget on Video Page]', widgetOnVideo > 0 ? 'YES' : 'NO');

  if (widgetOnVideo > 0) {
    // Check shadow DOM content
    const shadowContent = await page.evaluate(() => {
      const host = document.querySelector('#yt-detox-widget-root');
      if (!host?.shadowRoot) return null;
      return {
        childCount: host.shadowRoot.children.length,
        innerHTML: host.shadowRoot.innerHTML.substring(0, 500),
      };
    });
    console.log('[Widget Shadow DOM]', shadowContent ? `${shadowContent.childCount} children` : 'NO SHADOW ROOT');
    if (shadowContent?.innerHTML) {
      console.log('[Widget Preview]', shadowContent.innerHTML.substring(0, 200) + '...');
    }
  }

  // Check options page
  console.log('\n--- Checking Options Page ---\n');
  const optionsPage = await context.newPage();
  optionsPage.on('console', msg => {
    const text = msg.text();
    if (text.includes('YT Detox') || msg.type() === 'error') {
      console.log(`[Options ${msg.type().toUpperCase()}] ${text}`);
    }
  });

  await optionsPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await optionsPage.waitForTimeout(3000);

  const optionsLoaded = await optionsPage.locator('body').innerHTML();
  console.log('[Options Page]', optionsLoaded.length > 100 ? 'Loaded (' + optionsLoaded.length + ' chars)' : 'EMPTY OR ERROR');

  // Get storage state
  const storage = await optionsPage.evaluate(async () => {
    const data = await chrome.storage.local.get(null);
    return {
      hasSettings: !!data.settings,
      hasVideoSessions: Array.isArray(data.videoSessions),
      videoSessionCount: data.videoSessions?.length || 0,
      hasDailyStats: !!data.dailyStats,
      dailyStatsKeys: Object.keys(data.dailyStats || {}),
    };
  });
  console.log('[Storage State]', JSON.stringify(storage, null, 2));

  console.log('\n=== Debug session complete ===');
  console.log('Browser will stay open for manual inspection.');
  console.log('Press Ctrl+C to close.\n');

  // Keep browser open for manual testing
  await new Promise(() => {}); // Wait forever
}

debug().catch(console.error);
