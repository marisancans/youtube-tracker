/**
 * Comprehensive API tests for all tracker data types
 * Validates that data flows from sync endpoint to database and can be retrieved
 */

import { test, expect, APIRequestContext } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://localhost:8000';
const TEST_USER_ID = `test-user-${Date.now()}`;

// Helper to make unique IDs
const uniqueId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

test.describe('Complete Sync API Tests', () => {
  let request: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        'X-User-Id': TEST_USER_ID,
      },
    });
  });

  test.afterAll(async () => {
    await request.dispose();
  });

  test('health check', async () => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test.describe('Video Sessions', () => {
    const sessionId = uniqueId('video-session');

    test('sync video session', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          videoSessions: [{
            id: sessionId,
            videoId: 'dQw4w9WgXcQ',
            title: 'Test Video Title',
            channel: 'Test Channel',
            channelId: 'UC123',
            durationSeconds: 212,
            watchedSeconds: 120,
            watchedPercent: 57,
            source: 'home',
            sourcePosition: 3,
            isShort: false,
            playbackSpeed: 1.5,
            averageSpeed: 1.25,
            category: 'entertainment',
            productivityRating: 2,
            timestamp: Date.now(),
            startedAt: Date.now() - 120000,
            endedAt: Date.now(),
            seekCount: 2,
            pauseCount: 1,
            tabSwitchCount: 3,
            ledToAnotherVideo: true,
            nextVideoSource: 'autoplay',
            intention: 'learning',
            matchedIntention: false,
          }],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.videoSessions).toBe(1);
    });

    test('retrieve video session', async () => {
      const response = await request.get('/sync/videos');
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.videos).toBeDefined();
      expect(Array.isArray(data.videos)).toBe(true);
      
      const found = data.videos.find((v: any) => v.id === sessionId);
      expect(found).toBeTruthy();
      expect(found.videoId).toBe('dQw4w9WgXcQ');
      expect(found.title).toBe('Test Video Title');
      expect(found.watchedSeconds).toBe(120);
    });
  });

  test.describe('Browser Sessions', () => {
    const sessionId = uniqueId('browser-session');

    test('sync browser session', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          browserSessions: [{
            id: sessionId,
            startedAt: Date.now() - 3600000,
            endedAt: Date.now(),
            entryPageType: 'home',
            entryUrl: 'https://www.youtube.com/',
            entrySource: 'direct',
            triggerType: 'manual',
            totalDurationSeconds: 3600,
            activeDurationSeconds: 2400,
            backgroundSeconds: 1200,
            pagesVisited: 15,
            videosWatched: 5,
            videosStartedNotFinished: 2,
            shortsCount: 3,
            totalScrollPixels: 5000,
            thumbnailsHovered: 20,
            thumbnailsClicked: 8,
            pageReloads: 1,
            backButtonPresses: 4,
            recommendationClicks: 6,
            autoplayCount: 2,
            autoplayCancelled: 1,
            searchCount: 3,
            timeOnHomeSeconds: 600,
            timeOnWatchSeconds: 2400,
            timeOnSearchSeconds: 300,
            timeOnShortsSeconds: 300,
            productiveVideos: 2,
            unproductiveVideos: 2,
            neutralVideos: 1,
            exitType: 'close_tab',
            searchQueries: ['javascript tutorial', 'react hooks'],
          }],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.browserSessions).toBe(1);
    });

    test('retrieve browser session via stats', async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await request.get(`/sync/stats/${today}`);
      expect(response.ok()).toBeTruthy();
      const stats = await response.json();
      // Stats endpoint may not have data yet from browser sessions alone
      // Just check it responds correctly
      expect(stats.date).toBe(today);
    });
  });

  test.describe('Daily Stats', () => {
    const today = new Date().toISOString().split('T')[0];

    test('sync daily stats', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          dailyStats: {
            [today]: {
              date: today,
              totalSeconds: 7200,
              activeSeconds: 5400,
              backgroundSeconds: 1800,
              sessionCount: 3,
              avgSessionDurationSeconds: 2400,
              firstCheckTime: '09:30',
              videoCount: 12,
              videosCompleted: 8,
              videosAbandoned: 4,
              shortsCount: 5,
              uniqueChannels: 7,
              searchCount: 4,
              recommendationClicks: 10,
              autoplayCount: 3,
              autoplayCancelled: 1,
              totalScrollPixels: 15000,
              avgScrollVelocity: 250.5,
              thumbnailsHovered: 40,
              thumbnailsClicked: 15,
              pageReloads: 2,
              backButtonPresses: 8,
              tabSwitches: 12,
              productiveVideos: 4,
              unproductiveVideos: 5,
              neutralVideos: 3,
              promptsShown: 2,
              promptsAnswered: 1,
              interventionsShown: 3,
              interventionsEffective: 2,
              hourlySeconds: { '9': 1800, '10': 2700, '14': 1800, '20': 900 },
              topChannels: ['Channel1', 'Channel2', 'Channel3'],
              preSleepMinutes: 30,
              bingeSessions: 1,
            },
          },
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.dailyStats).toBe(1);
    });

    test('retrieve daily stats', async () => {
      const response = await request.get(`/sync/stats/${today}`);
      expect(response.ok()).toBeTruthy();
      const stats = await response.json();
      expect(stats.found).toBe(true);
      expect(stats.totalSeconds).toBeGreaterThanOrEqual(7200);
      expect(stats.videoCount).toBeGreaterThanOrEqual(12);
    });
  });

  test.describe('Scroll Events', () => {
    const browserSessionId = uniqueId('scroll-browser');

    test('sync scroll events', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          scrollEvents: [
            {
              type: 'scroll',
              sessionId: browserSessionId,
              pageType: 'home',
              timestamp: Date.now() - 5000,
              scrollY: 500,
              scrollDepthPercent: 25,
              viewportHeight: 900,
              pageHeight: 4000,
              scrollVelocity: 150.5,
              scrollDirection: 'down',
              visibleVideoCount: 8,
            },
            {
              type: 'scroll',
              sessionId: browserSessionId,
              pageType: 'home',
              timestamp: Date.now(),
              scrollY: 2000,
              scrollDepthPercent: 75,
              viewportHeight: 900,
              pageHeight: 4000,
              scrollVelocity: 200.0,
              scrollDirection: 'down',
              visibleVideoCount: 12,
            },
          ],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.scrollEvents).toBe(2);
    });
  });

  test.describe('Thumbnail Events', () => {
    const browserSessionId = uniqueId('thumb-browser');

    test('sync thumbnail events', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          thumbnailEvents: [
            {
              type: 'thumbnail',
              sessionId: browserSessionId,
              videoId: 'abc123',
              videoTitle: 'AMAZING VIDEO YOU MUST WATCH!!!',
              channelName: 'ClickbaitChannel',
              pageType: 'home',
              positionIndex: 0,
              timestamp: Date.now() - 3000,
              hoverDurationMs: 2500,
              previewPlayed: true,
              previewWatchMs: 1500,
              clicked: false,
              titleCapsPercent: 60,
              titleLength: 33,
            },
            {
              type: 'thumbnail',
              sessionId: browserSessionId,
              videoId: 'xyz789',
              videoTitle: 'Helpful tutorial',
              channelName: 'GoodChannel',
              pageType: 'home',
              positionIndex: 3,
              timestamp: Date.now(),
              hoverDurationMs: 1200,
              previewPlayed: false,
              previewWatchMs: 0,
              clicked: true,
              titleCapsPercent: 10,
              titleLength: 16,
            },
          ],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.thumbnailEvents).toBe(2);
    });
  });

  test.describe('Page Events', () => {
    const browserSessionId = uniqueId('page-browser');

    test('sync page events', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          pageEvents: [
            {
              type: 'page',
              sessionId: browserSessionId,
              eventType: 'navigation',
              pageType: 'home',
              pageUrl: 'https://www.youtube.com/',
              timestamp: Date.now() - 60000,
              fromPageType: null,
              navigationMethod: 'direct',
            },
            {
              type: 'page',
              sessionId: browserSessionId,
              eventType: 'search',
              pageType: 'search',
              pageUrl: 'https://www.youtube.com/results?search_query=test',
              timestamp: Date.now() - 30000,
              fromPageType: 'home',
              navigationMethod: 'search',
              searchQuery: 'test',
              searchResultsCount: 20,
            },
            {
              type: 'page',
              sessionId: browserSessionId,
              eventType: 'navigation',
              pageType: 'watch',
              pageUrl: 'https://www.youtube.com/watch?v=abc123',
              timestamp: Date.now(),
              fromPageType: 'search',
              navigationMethod: 'click',
              timeOnPageMs: 30000,
            },
          ],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.pageEvents).toBe(3);
    });
  });

  test.describe('Video Watch Events', () => {
    const browserSessionId = uniqueId('vwatch-browser');
    const watchSessionId = uniqueId('vwatch-session');

    test('sync video watch events', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          videoWatchEvents: [
            {
              type: 'video_watch',
              sessionId: browserSessionId,
              watchSessionId: watchSessionId,
              videoId: 'dQw4w9WgXcQ',
              eventType: 'play',
              timestamp: Date.now() - 60000,
              videoTimeSeconds: 0,
            },
            {
              type: 'video_watch',
              sessionId: browserSessionId,
              watchSessionId: watchSessionId,
              videoId: 'dQw4w9WgXcQ',
              eventType: 'pause',
              timestamp: Date.now() - 30000,
              videoTimeSeconds: 30,
            },
            {
              type: 'video_watch',
              sessionId: browserSessionId,
              watchSessionId: watchSessionId,
              videoId: 'dQw4w9WgXcQ',
              eventType: 'seek',
              timestamp: Date.now() - 20000,
              videoTimeSeconds: 60,
              seekFromSeconds: 30,
              seekToSeconds: 60,
              seekDeltaSeconds: 30,
            },
            {
              type: 'video_watch',
              sessionId: browserSessionId,
              watchSessionId: watchSessionId,
              videoId: 'dQw4w9WgXcQ',
              eventType: 'speed_change',
              timestamp: Date.now() - 10000,
              videoTimeSeconds: 70,
              playbackSpeed: 1.5,
            },
            {
              type: 'video_watch',
              sessionId: browserSessionId,
              watchSessionId: watchSessionId,
              videoId: 'dQw4w9WgXcQ',
              eventType: 'abandon',
              timestamp: Date.now(),
              videoTimeSeconds: 100,
              watchPercentAtAbandon: 47,
            },
          ],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.videoWatchEvents).toBe(5);
    });
  });

  test.describe('Recommendation Events', () => {
    const browserSessionId = uniqueId('rec-browser');

    test('sync recommendation events', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          recommendationEvents: [
            {
              type: 'recommendation',
              sessionId: browserSessionId,
              location: 'sidebar',
              positionIndex: 0,
              videoId: 'rec123',
              videoTitle: 'Recommended Video 1',
              channelName: 'RecChannel',
              action: 'hover',
              hoverDurationMs: 1500,
              timestamp: Date.now() - 5000,
              wasAutoplayNext: false,
              autoplayCountdownStarted: false,
              autoplayCancelled: false,
            },
            {
              type: 'recommendation',
              sessionId: browserSessionId,
              location: 'sidebar',
              positionIndex: 0,
              videoId: 'rec123',
              videoTitle: 'Recommended Video 1',
              channelName: 'RecChannel',
              action: 'click',
              timestamp: Date.now() - 3000,
              wasAutoplayNext: false,
              autoplayCountdownStarted: false,
              autoplayCancelled: false,
            },
            {
              type: 'recommendation',
              sessionId: browserSessionId,
              location: 'endscreen',
              positionIndex: 0,
              videoId: 'auto456',
              videoTitle: 'Autoplay Next',
              channelName: 'AutoChannel',
              action: 'autoplay_started',
              timestamp: Date.now(),
              wasAutoplayNext: true,
              autoplayCountdownStarted: true,
              autoplayCancelled: false,
            },
          ],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.recommendationEvents).toBe(3);
    });
  });

  test.describe('Intervention Events', () => {
    const browserSessionId = uniqueId('int-browser');

    test('sync intervention events', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          interventionEvents: [
            {
              type: 'intervention',
              sessionId: browserSessionId,
              interventionType: 'time_reminder',
              triggeredAt: Date.now() - 60000,
              triggerReason: '30_minutes_watching',
              response: 'dismissed',
              responseAt: Date.now() - 55000,
              responseTimeMs: 5000,
              userLeftYoutube: false,
            },
            {
              type: 'intervention',
              sessionId: browserSessionId,
              interventionType: 'break_suggestion',
              triggeredAt: Date.now() - 30000,
              triggerReason: '60_minutes_watching',
              response: 'accepted',
              responseAt: Date.now() - 25000,
              responseTimeMs: 5000,
              userLeftYoutube: true,
              minutesUntilReturn: 15,
            },
          ],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.interventionEvents).toBe(2);
    });
  });

  test.describe('Mood Reports', () => {
    const browserSessionId = uniqueId('mood-browser');

    test('sync mood reports', async () => {
      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          moodReports: [
            {
              timestamp: Date.now() - 3600000,
              sessionId: browserSessionId,
              reportType: 'pre_session',
              mood: 3,
              intention: 'learning',
            },
            {
              timestamp: Date.now(),
              sessionId: browserSessionId,
              reportType: 'post_session',
              mood: 2,
              satisfaction: 3,
            },
          ],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.syncedCounts.moodReports).toBe(2);
    });
  });

  test.describe('Full Sync Payload', () => {
    test('sync all data types at once', async () => {
      const sessionId = uniqueId('full-sync');
      const today = new Date().toISOString().split('T')[0];

      const payload = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          videoSessions: [{
            id: uniqueId('vs'),
            videoId: 'full123',
            title: 'Full Sync Test',
            timestamp: Date.now(),
            startedAt: Date.now() - 60000,
            watchedSeconds: 60,
          }],
          browserSessions: [{
            id: sessionId,
            startedAt: Date.now() - 3600000,
            totalDurationSeconds: 3600,
          }],
          dailyStats: {
            [today]: {
              date: today,
              totalSeconds: 3600,
              videoCount: 5,
            },
          },
          scrollEvents: [{
            type: 'scroll',
            sessionId,
            timestamp: Date.now(),
            scrollY: 1000,
            scrollDepthPercent: 50,
            viewportHeight: 900,
            pageHeight: 2000,
            scrollVelocity: 100,
            scrollDirection: 'down',
          }],
          thumbnailEvents: [{
            type: 'thumbnail',
            sessionId,
            videoId: 'thumb123',
            positionIndex: 0,
            timestamp: Date.now(),
            clicked: true,
          }],
          pageEvents: [{
            type: 'page',
            sessionId,
            eventType: 'navigation',
            pageType: 'home',
            timestamp: Date.now(),
          }],
          videoWatchEvents: [{
            type: 'video_watch',
            sessionId,
            watchSessionId: uniqueId('ws'),
            videoId: 'full123',
            eventType: 'play',
            timestamp: Date.now(),
            videoTimeSeconds: 0,
          }],
          recommendationEvents: [{
            type: 'recommendation',
            sessionId,
            location: 'sidebar',
            positionIndex: 0,
            videoId: 'rec123',
            action: 'view',
            timestamp: Date.now(),
          }],
          interventionEvents: [{
            type: 'intervention',
            sessionId,
            interventionType: 'reminder',
            triggeredAt: Date.now(),
          }],
          moodReports: [{
            timestamp: Date.now(),
            sessionId,
            reportType: 'check_in',
            mood: 4,
          }],
        },
      };

      const response = await request.post('/sync', { data: payload });
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      
      console.log('Full sync result:', result);
      
      expect(result.success).toBe(true);
      expect(result.syncedCounts.videoSessions).toBe(1);
      expect(result.syncedCounts.browserSessions).toBe(1);
      expect(result.syncedCounts.dailyStats).toBe(1);
      expect(result.syncedCounts.scrollEvents).toBe(1);
      expect(result.syncedCounts.thumbnailEvents).toBe(1);
      expect(result.syncedCounts.pageEvents).toBe(1);
      expect(result.syncedCounts.videoWatchEvents).toBe(1);
      expect(result.syncedCounts.recommendationEvents).toBe(1);
      expect(result.syncedCounts.interventionEvents).toBe(1);
      expect(result.syncedCounts.moodReports).toBe(1);
    });
  });

  test.describe('Error Handling', () => {
    test('rejects invalid payload', async () => {
      const response = await request.post('/sync', {
        data: { invalid: 'payload' },
      });
      expect(response.status()).toBe(422);
    });

    test('handles duplicate video sessions (skip duplicates)', async () => {
      const sessionId = uniqueId('dup-video');
      
      // First sync
      const payload1 = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          videoSessions: [{
            id: sessionId,
            videoId: 'dup123',
            title: 'Original Title',
            timestamp: Date.now(),
            startedAt: Date.now() - 60000,
            watchedSeconds: 30,
          }],
        },
      };
      
      const response1 = await request.post('/sync', { data: payload1 });
      expect(response1.ok()).toBeTruthy();
      const result1 = await response1.json();
      expect(result1.syncedCounts.videoSessions).toBe(1);

      // Second sync with same ID - should be skipped (not duplicated)
      const payload2 = {
        userId: TEST_USER_ID,
        lastSyncTime: 0,
        data: {
          videoSessions: [{
            id: sessionId,
            videoId: 'dup123',
            title: 'Should Be Skipped',
            timestamp: Date.now(),
            startedAt: Date.now() - 60000,
            watchedSeconds: 999,
          }],
        },
      };
      
      const response2 = await request.post('/sync', { data: payload2 });
      expect(response2.ok()).toBeTruthy();
      const result2 = await response2.json();
      // Should be skipped, count is 0
      expect(result2.syncedCounts.videoSessions).toBe(0);

      // Verify original data is preserved (not duplicated or updated)
      const getResponse = await request.get('/sync/videos');
      const data = await getResponse.json();
      const matches = data.videos.filter((v: any) => v.id === sessionId);
      expect(matches.length).toBe(1);
      expect(matches[0].title).toBe('Original Title');
      expect(matches[0].watchedSeconds).toBe(30);
    });
  });

  test.describe('Stats Endpoints', () => {
    test('get videos watched', async () => {
      const response = await request.get('/sync/videos?limit=10');
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.videos).toBeDefined();
      expect(Array.isArray(data.videos)).toBe(true);
    });

    test('get daily stats', async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await request.get(`/sync/stats/${today}`);
      expect(response.ok()).toBeTruthy();
      const stats = await response.json();
      expect(stats.date).toBe(today);
      // May or may not have data depending on test order
    });

    test('handles missing date gracefully', async () => {
      const response = await request.get('/sync/stats/1999-01-01');
      expect(response.ok()).toBeTruthy();
      const stats = await response.json();
      // Should return found: false for missing dates
      expect(stats.found).toBe(false);
    });
  });
});
