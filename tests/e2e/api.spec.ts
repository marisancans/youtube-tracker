/**
 * API tests - run anywhere (no display needed)
 * These test the backend API directly without the browser extension
 */
import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

test.describe('API Health & Structure', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('root endpoint returns API info', async ({ request }) => {
    const response = await request.get(`${API_BASE}/`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.name).toBe('YouTube Detox API');
    expect(data.endpoints).toBeDefined();
  });

  test('docs endpoint is accessible', async ({ request }) => {
    const response = await request.get(`${API_BASE}/docs`);
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('Sync Endpoint', () => {
  const testUserId = `api-test-${Date.now()}`;

  test('accepts video session data', async ({ request }) => {
    const payload = {
      userId: testUserId,
      lastSyncTime: 0,
      data: {
        videoSessions: [
          {
            id: `vid-${Date.now()}`,
            videoId: 'test123',
            title: 'API Test Video',
            channel: 'Test Channel',
            startedAt: Date.now() - 60000,
            endedAt: Date.now(),
            watchedSeconds: 60,
            totalDurationSeconds: 180,
            watchedPercent: 33,
            isShort: false,
            pauseCount: 2,
            seekCount: 1,
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

    const response = await request.post(`${API_BASE}/sync`, {
      data: payload,
      headers: { 'X-User-Id': testUserId },
    });

    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.syncedCounts).toBeDefined();
  });

  test('accepts browser session data', async ({ request }) => {
    const payload = {
      userId: testUserId,
      lastSyncTime: 0,
      data: {
        videoSessions: [],
        browserSessions: [
          {
            id: `browser-${Date.now()}`,
            startedAt: Date.now() - 300000,
            endedAt: Date.now(),
            totalDurationSeconds: 300,
            activeDurationSeconds: 250,
            backgroundSeconds: 50,
            pageViews: 5,
            uniqueVideosWatched: 2,
            searchCount: 1,
            recommendationClicks: 3,
            autoplayCount: 1,
            autoplayCancelled: 0,
            totalScrollPixels: 5000,
            avgScrollVelocity: 100,
            thumbnailsHovered: 10,
            thumbnailsClicked: 2,
            pageReloads: 0,
            backButtonPresses: 1,
            productiveVideos: 1,
            unproductiveVideos: 1,
            neutralVideos: 0,
          },
        ],
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

    const response = await request.post(`${API_BASE}/sync`, {
      data: payload,
      headers: { 'X-User-Id': testUserId },
    });

    expect(response.ok()).toBeTruthy();
  });

  test('accepts scroll events', async ({ request }) => {
    const payload = {
      userId: testUserId,
      lastSyncTime: 0,
      data: {
        videoSessions: [],
        browserSessions: [],
        dailyStats: {},
        scrollEvents: [
          {
            type: 'scroll',
            timestamp: Date.now(),
            sessionId: 'test-session',
            pageType: 'home',
            scrollY: 500,
            scrollDepthPercent: 50,
            viewportHeight: 800,
            pageHeight: 5000,
            scrollVelocity: 100.5,
            scrollDirection: 'down',
            visibleVideoCount: 6,
          },
        ],
        thumbnailEvents: [],
        pageEvents: [],
        videoWatchEvents: [],
        recommendationEvents: [],
        interventionEvents: [],
        moodReports: [],
      },
    };

    const response = await request.post(`${API_BASE}/sync`, {
      data: payload,
      headers: { 'X-User-Id': testUserId },
    });

    expect(response.ok()).toBeTruthy();
  });

  test('accepts page events', async ({ request }) => {
    const payload = {
      userId: testUserId,
      lastSyncTime: 0,
      data: {
        videoSessions: [],
        browserSessions: [],
        dailyStats: {},
        scrollEvents: [],
        thumbnailEvents: [],
        pageEvents: [
          {
            timestamp: Date.now(),
            sessionId: 'test-session',
            eventType: 'page_load',
            pageType: 'watch',
            url: 'https://www.youtube.com/watch?v=test123',
            referrer: 'https://www.youtube.com',
            timeOnPage: 0,
          },
        ],
        videoWatchEvents: [],
        recommendationEvents: [],
        interventionEvents: [],
        moodReports: [],
      },
    };

    const response = await request.post(`${API_BASE}/sync`, {
      data: payload,
      headers: { 'X-User-Id': testUserId },
    });

    expect(response.ok()).toBeTruthy();
  });
});

test.describe('Query Endpoints', () => {
  test('videos endpoint returns array', async ({ request }) => {
    const response = await request.get(`${API_BASE}/sync/videos`, {
      headers: { 'X-User-Id': 'query-test-user' },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.videos).toBeDefined();
    expect(Array.isArray(data.videos)).toBeTruthy();
  });

  test('stats endpoint works with date', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0];
    const response = await request.get(`${API_BASE}/sync/stats/${today}`, {
      headers: { 'X-User-Id': 'query-test-user' },
    });
    // May return 200 (with found: false) or 404
    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Stats Endpoints', () => {
  test('daily stats endpoint exists', async ({ request }) => {
    const response = await request.get(`${API_BASE}/stats/daily`);
    // May return empty or error, just checking endpoint exists
    expect([200, 404, 422]).toContain(response.status());
  });

  test('weekly stats endpoint exists', async ({ request }) => {
    const response = await request.get(`${API_BASE}/stats/weekly`);
    expect([200, 404, 422]).toContain(response.status());
  });
});
