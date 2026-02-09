/**
 * Core logging module for YouTube Detox
 * Tracks sessions, videos, and behavioral patterns
 */

import * as storage from './storage.js';

/**
 * Log a new session start
 */
export async function logSessionStart(data = {}) {
  const session = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    endedAt: null,
    entryPoint: data.entryPoint || detectEntryPoint(),
    entryUrl: window.location.href,
    videos: [],
    shortsCount: 0,
    autoplayCount: 0,
    recommendationClicks: 0,
  };
  
  await storage.set(storage.STORAGE_KEYS.CURRENT_SESSION, session);
  await storage.updateDailyStats(storage.getTodayKey(), { sessions: 1 });
  
  console.log('[YT Detox] Session started:', session.id);
  return session;
}

/**
 * Log session end
 */
export async function logSessionEnd() {
  const session = await storage.get(storage.STORAGE_KEYS.CURRENT_SESSION);
  if (!session) return null;
  
  session.endedAt = Date.now();
  session.durationSeconds = Math.round((session.endedAt - session.startedAt) / 1000);
  
  // Save to sessions history
  await storage.append(storage.STORAGE_KEYS.SESSIONS, session, 1000);
  
  // Update daily stats
  await storage.updateDailyStats(storage.getTodayKey(), {
    totalSeconds: session.durationSeconds,
  });
  
  // Clear current session
  await storage.set(storage.STORAGE_KEYS.CURRENT_SESSION, null);
  
  console.log('[YT Detox] Session ended:', session.durationSeconds, 'seconds');
  return session;
}

/**
 * Log a video view
 */
export async function logVideo(videoData) {
  const video = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    videoId: videoData.videoId,
    title: videoData.title,
    channel: videoData.channel,
    durationSeconds: videoData.durationSeconds,
    watchedSeconds: videoData.watchedSeconds,
    watchedPercent: videoData.durationSeconds > 0 
      ? Math.round((videoData.watchedSeconds / videoData.durationSeconds) * 100) 
      : 0,
    source: videoData.source, // 'search', 'subscription', 'recommendation', 'homepage', 'direct'
    isShort: videoData.isShort || false,
    playbackSpeed: videoData.playbackSpeed || 1,
  };
  
  // Update current session
  const session = await storage.get(storage.STORAGE_KEYS.CURRENT_SESSION);
  if (session) {
    session.videos.push(video.id);
    if (video.isShort) session.shortsCount++;
    await storage.set(storage.STORAGE_KEYS.CURRENT_SESSION, session);
  }
  
  // Save video record
  await storage.append(storage.STORAGE_KEYS.VIDEOS, video, 5000);
  
  // Update daily stats
  const statsUpdate = { videoCount: 1 };
  if (video.isShort) statsUpdate.shortsCount = 1;
  await storage.updateDailyStats(storage.getTodayKey(), statsUpdate);
  
  console.log('[YT Detox] Video logged:', video.title?.substring(0, 40));
  return video;
}

/**
 * Log autoplay event
 */
export async function logAutoplay() {
  const session = await storage.get(storage.STORAGE_KEYS.CURRENT_SESSION);
  if (session) {
    session.autoplayCount++;
    await storage.set(storage.STORAGE_KEYS.CURRENT_SESSION, session);
  }
  await storage.updateDailyStats(storage.getTodayKey(), { autoplayCount: 1 });
  console.log('[YT Detox] Autoplay detected');
}

/**
 * Log recommendation click
 */
export async function logRecommendationClick() {
  const session = await storage.get(storage.STORAGE_KEYS.CURRENT_SESSION);
  if (session) {
    session.recommendationClicks++;
    await storage.set(storage.STORAGE_KEYS.CURRENT_SESSION, session);
  }
  await storage.updateDailyStats(storage.getTodayKey(), { recommendationClicks: 1 });
  console.log('[YT Detox] Recommendation click');
}

/**
 * Log search
 */
export async function logSearch(query) {
  await storage.updateDailyStats(storage.getTodayKey(), { searchCount: 1 });
  console.log('[YT Detox] Search:', query);
}

/**
 * Detect how user entered YouTube
 */
function detectEntryPoint() {
  const path = window.location.pathname;
  const search = window.location.search;
  const referrer = document.referrer;
  
  if (path === '/results' || search.includes('search_query')) return 'search';
  if (path.startsWith('/feed/subscriptions')) return 'subscriptions';
  if (path.startsWith('/shorts/')) return 'shorts';
  if (path === '/watch' && referrer.includes('youtube.com')) return 'internal';
  if (path === '/' || path === '') return 'homepage';
  if (!referrer || !referrer.includes('youtube.com')) return 'direct';
  
  return 'other';
}

/**
 * Detect video source (how they got to this video)
 */
export function detectVideoSource() {
  const referrer = document.referrer;
  const path = window.location.pathname;
  
  if (path.startsWith('/shorts/')) return 'shorts';
  if (referrer.includes('/results')) return 'search';
  if (referrer.includes('/feed/subscriptions')) return 'subscription';
  if (referrer.includes('youtube.com/watch')) return 'recommendation';
  if (referrer.includes('youtube.com') && !referrer.includes('/watch')) return 'homepage';
  if (!referrer || !referrer.includes('youtube.com')) return 'direct';
  
  return 'other';
}
