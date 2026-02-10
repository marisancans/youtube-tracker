/**
 * Live YouTube E2E Tests
 * 
 * Tests the extension against real YouTube using Playwright fixtures.
 * Based on official Playwright Chrome extension testing best practices.
 */

import { test, expect } from './fixtures';

test.describe('Live YouTube Tests', () => {
  test.setTimeout(60000); // 60s per test

  test('extension loads on YouTube video', async ({ context }) => {
    const page = await context.newPage();
    
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { 
      waitUntil: 'domcontentloaded' 
    });
    await page.waitForTimeout(3000);
    
    // Widget container should be injected
    const widget = page.locator('#yt-detox-widget-root');
    await expect(widget).toBeAttached({ timeout: 15000 });
    
    // Shadow DOM should exist
    const hasShadow = await page.evaluate(() => {
      const host = document.querySelector('#yt-detox-widget-root');
      return !!host?.shadowRoot;
    });
    expect(hasShadow).toBe(true);
    
    await page.close();
  });

  test('widget shows session info', async ({ context }) => {
    const page = await context.newPage();
    
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { 
      waitUntil: 'domcontentloaded' 
    });
    await page.waitForTimeout(4000);
    
    // Check widget has content in shadow DOM
    const hasContent = await page.evaluate(() => {
      const host = document.querySelector('#yt-detox-widget-root');
      if (!host?.shadowRoot) return false;
      const text = host.shadowRoot.textContent || '';
      // Should have time display (0:00 or similar)
      return /\d+:\d+/.test(text);
    });
    
    expect(hasContent).toBe(true);
    await page.close();
  });

  test('timer increments while watching', async ({ context }) => {
    const page = await context.newPage();
    
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { 
      waitUntil: 'domcontentloaded' 
    });
    await page.waitForTimeout(3000);
    
    // Get initial time
    const getTime = () => page.evaluate(() => {
      const host = document.querySelector('#yt-detox-widget-root');
      if (!host?.shadowRoot) return '0:00';
      const text = host.shadowRoot.textContent || '';
      const match = text.match(/(\d+:\d+)/);
      return match ? match[1] : '0:00';
    });
    
    const initialTime = await getTime();
    await page.waitForTimeout(5000);
    const laterTime = await getTime();
    
    // Parse times
    const parseTime = (t: string) => {
      const [m, s] = t.split(':').map(Number);
      return m * 60 + s;
    };
    
    expect(parseTime(laterTime)).toBeGreaterThan(parseTime(initialTime));
    await page.close();
  });

  test('options page loads', async ({ context, extensionId }) => {
    const page = await context.newPage();
    
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await page.waitForTimeout(2000);
    
    // Should have some content
    const hasContent = await page.evaluate(() => {
      return document.body.textContent?.includes('YouTube') || 
             document.body.textContent?.includes('Detox') ||
             document.body.textContent?.includes('Dashboard');
    });
    
    expect(hasContent).toBe(true);
    await page.close();
  });

  test('navigation tracking works', async ({ context }) => {
    const page = await context.newPage();
    
    // Start on homepage
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Navigate to a video
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { 
      waitUntil: 'domcontentloaded' 
    });
    await page.waitForTimeout(3000);
    
    // Widget should appear on video page
    const widget = page.locator('#yt-detox-widget-root');
    await expect(widget).toBeAttached({ timeout: 10000 });
    
    await page.close();
  });
});

test.describe('Extension Service Worker', () => {
  test('service worker is registered', async ({ context, extensionId }) => {
    expect(extensionId).toBeTruthy();
    expect(extensionId.length).toBeGreaterThan(10);
    
    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThan(0);
    
    const swUrl = serviceWorkers[0].url();
    expect(swUrl).toContain(extensionId);
  });
});
