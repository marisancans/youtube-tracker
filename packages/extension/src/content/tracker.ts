import type {
  VideoSession,
  BrowserSession,
  PageType,
  VideoSource,
  VideoInfo,
  ScrollEvent,
  ThumbnailEvent,
  PageEvent,
  VideoWatchEvent,
  RecommendationEvent,
  InterventionEvent,
  MoodReport,
  ExitType,
} from '@yt-detox/shared';
import { safeSendMessage } from '../lib/messaging';

// ===== State Management =====

interface ThumbnailHoverInfo {
  startTime: number;
  videoTitle: string;
  channelName: string;
  positionIndex: number;
}

interface TemporalTracking {
  firstCheckTime: string | null;
  hourlySeconds: Record<string, number>;
  sessionStartTime: number;
  lastActivityTime: number;
  bingeModeActive: boolean;
  preSleepActive: boolean;
}

interface TrackerState {
  currentBrowserSession: BrowserSession | null;
  currentVideoSession: VideoSession | null;
  currentVideoInfo: VideoInfo | null;
  pageEnteredAt: number;
  currentPageType: PageType;
  previousPageType: PageType | null;
  lastScrollY: number;
  lastScrollTime: number;
  lastScrollEventTime: number;  // For debouncing scroll events
  scrollVelocities: number[];
  visibilityHiddenAt: number | null;
  backgroundAccumulatedMs: number;
  thumbnailHoverStart: Map<string, ThumbnailHoverInfo>;
  pendingEvents: {
    scroll: ScrollEvent[];
    thumbnail: ThumbnailEvent[];
    page: PageEvent[];
    video_watch: VideoWatchEvent[];
    recommendation: RecommendationEvent[];
    intervention: InterventionEvent[];
    mood: MoodReport[];
  };
  lastVideoTime: number;
  lastVideoPaused: boolean;
  playTimeAccumulatedMs: number;
  lastPlayStartTime: number | null;
  videoSeekCount: number;
  videoPauseCount: number;
  autoplayCountdownActive: boolean;
  autoplayNextVideo: string | null;
  autoplayCountdownStartTime: number | null;
  tabSwitchCount: number;
  sidebarRecommendationsShown: Set<string>;
  temporal: TemporalTracking;
  scrollDebounceTimer: number | null;
  batchScrollEvents: ScrollEvent[];
  observedThumbnails: Set<Element>;
}

const state: TrackerState = {
  currentBrowserSession: null,
  currentVideoSession: null,
  currentVideoInfo: null,
  pageEnteredAt: Date.now(),
  currentPageType: 'other',
  previousPageType: null,
  lastScrollY: 0,
  lastScrollTime: Date.now(),
  lastScrollEventTime: 0,
  scrollVelocities: [],
  visibilityHiddenAt: null,
  backgroundAccumulatedMs: 0,
  thumbnailHoverStart: new Map(),
  pendingEvents: {
    scroll: [],
    thumbnail: [],
    page: [],
    video_watch: [],
    recommendation: [],
    intervention: [],
    mood: [],
  },
  lastVideoTime: 0,
  lastVideoPaused: true,
  playTimeAccumulatedMs: 0,
  lastPlayStartTime: null,
  videoSeekCount: 0,
  videoPauseCount: 0,
  autoplayCountdownActive: false,
  autoplayNextVideo: null,
  autoplayCountdownStartTime: null,
  tabSwitchCount: 0,
  sidebarRecommendationsShown: new Set(),
  temporal: {
    firstCheckTime: null,
    hourlySeconds: {},
    sessionStartTime: Date.now(),
    lastActivityTime: Date.now(),
    bingeModeActive: false,
    preSleepActive: false,
  },
  scrollDebounceTimer: null,
  batchScrollEvents: [],
  observedThumbnails: new Set(),
};

// ===== Utility Functions =====

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getPageType(): PageType {
  const path = window.location.pathname;
  const search = window.location.search;
  
  if (path === '/' || path === '/feed/trending' || path === '/feed/explore') return 'homepage';
  if (path === '/watch' || search.includes('v=')) return 'watch';
  if (path.startsWith('/shorts')) return 'shorts';
  if (path === '/results' || search.includes('search_query=')) return 'search';
  if (path === '/feed/subscriptions') return 'subscriptions';
  if (path === '/feed/history') return 'history';
  if (path.startsWith('/@') || path.startsWith('/channel') || path.startsWith('/c/')) return 'channel';
  return 'other';
}

function detectVideoSource(): VideoSource {
  const referrer = document.referrer;
  const url = new URL(window.location.href);
  const list = url.searchParams.get('list');
  
  // Check URL parameters for source hints
  if (url.searchParams.get('ab_channel')) return 'subscription';
  if (list && list.startsWith('PL')) return 'direct'; // Playlist
  
  // Check if this came from autoplay
  if (state.autoplayNextVideo === getVideoId()) {
    state.autoplayNextVideo = null;
    return 'autoplay';
  }
  
  // Check previous page type
  if (state.previousPageType === 'search') return 'search';
  if (state.previousPageType === 'homepage') return 'recommendation';
  if (state.previousPageType === 'subscriptions') return 'subscription';
  if (state.previousPageType === 'watch') return 'end_screen';
  if (state.previousPageType === 'shorts') return 'shorts';
  
  // Check referrer
  if (!referrer || !referrer.includes('youtube.com')) return 'direct';
  if (referrer.includes('/results')) return 'search';
  if (referrer.includes('/watch')) return 'recommendation';
  
  return 'recommendation';
}

function getVideoId(): string | null {
  const url = new URL(window.location.href);
  if (url.pathname.startsWith('/shorts/')) {
    return url.pathname.split('/shorts/')[1]?.split('/')[0] || null;
  }
  return url.searchParams.get('v');
}

function inferCategory(title: string, channel: string): string | undefined {
  const text = `${title} ${channel}`.toLowerCase();
  
  const keywords: Record<string, string[]> = {
    education: ['tutorial', 'learn', 'course', 'lecture', 'explained', 'how to', 'documentary', 'science'],
    entertainment: ['funny', 'comedy', 'prank', 'meme', 'react', 'vlog', 'challenge'],
    music: ['music', 'song', 'official video', 'lyrics', 'album', 'concert', 'cover'],
    gaming: ['gameplay', 'playthrough', 'gaming', 'stream', 'esports', 'minecraft', 'fortnite'],
    news: ['news', 'breaking', 'update', 'report', 'politics', 'election'],
    tech: ['review', 'unboxing', 'tech', 'iphone', 'android', 'computer', 'software'],
    fitness: ['workout', 'exercise', 'fitness', 'yoga', 'gym', 'training'],
    cooking: ['recipe', 'cooking', 'food', 'chef', 'kitchen', 'baking'],
  };
  
  for (const [category, words] of Object.entries(keywords)) {
    if (words.some(word => text.includes(word))) {
      return category;
    }
  }
  
  return undefined;
}

function getHour(): string {
  return new Date().getHours().toString();
}

function getCurrentTimeHHMM(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function countCapsPercent(text: string): number {
  if (!text) return 0;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;
  const caps = letters.replace(/[^A-Z]/g, '').length;
  return Math.round((caps / letters.length) * 100);
}

function isPreSleepTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 2; // 10pm - 2am
}

function isBingeSession(): boolean {
  const sessionDurationMs = Date.now() - state.temporal.sessionStartTime;
  return sessionDurationMs > 60 * 60 * 1000; // > 60 minutes
}

// ===== DOM Scrapers =====

export function scrapeVideoInfo(): VideoInfo | null {
  const videoElement = document.querySelector('video') as HTMLVideoElement | null;
  const isShorts = window.location.pathname.startsWith('/shorts');
  
  // Get title
  let title = '';
  if (isShorts) {
    const titleEl = document.querySelector('yt-shorts-video-title-view-model h2');
    title = titleEl?.textContent?.trim() || '';
  } else {
    const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
                    document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                    document.querySelector('#title h1 yt-formatted-string');
    title = titleEl?.textContent?.trim() || '';
  }
  
  // Get channel
  let channel = '';
  let channelId: string | undefined;
  if (isShorts) {
    const channelEl = document.querySelector('ytd-channel-name yt-formatted-string a');
    channel = channelEl?.textContent?.trim() || '';
    channelId = channelEl?.getAttribute('href')?.replace(/^\/@?/, '').replace(/^channel\//, '');
  } else {
    const channelEl = document.querySelector('#owner #channel-name a') ||
                      document.querySelector('#owner ytd-channel-name a') ||
                      document.querySelector('ytd-video-owner-renderer ytd-channel-name a');
    channel = channelEl?.textContent?.trim() || '';
    channelId = channelEl?.getAttribute('href')?.replace(/^\/@?/, '').replace(/^channel\//, '');
  }
  
  // Get duration from video element or time display
  let durationSeconds = 0;
  if (videoElement && videoElement.duration && !isNaN(videoElement.duration)) {
    durationSeconds = Math.floor(videoElement.duration);
  } else {
    const durationEl = document.querySelector('.ytp-time-duration');
    if (durationEl) {
      const parts = durationEl.textContent?.split(':').map(Number) || [];
      if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];
      if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  
  const currentTime = videoElement?.currentTime || 0;
  const playbackSpeed = videoElement?.playbackRate || 1;
  const isPaused = videoElement?.paused ?? true;
  
  return {
    videoId: getVideoId(),
    title,
    channel,
    channelId,
    durationSeconds,
    currentTime,
    playbackSpeed,
    isPaused,
    isShort: isShorts,
    category: inferCategory(title, channel),
  };
}

function getVisibleThumbnailCount(): number {
  const thumbnails = document.querySelectorAll('ytd-thumbnail:not(.ytd-thumbnail-overlay-time-status-renderer)');
  let count = 0;
  thumbnails.forEach((thumb) => {
    const rect = thumb.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
      count++;
    }
  });
  return count;
}

function scrapeThumbnailInfo(element: Element): { videoId: string; videoTitle: string; channelName: string; positionIndex: number } | null {
  // Find parent video renderer
  const renderer = element.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer');
  if (!renderer) return null;
  
  // Get video ID from link
  const link = renderer.querySelector('a#thumbnail, a.yt-simple-endpoint[href*="/watch"]');
  const href = link?.getAttribute('href') || '';
  const videoIdMatch = href.match(/[?&]v=([^&]+)/);
  const videoId = videoIdMatch?.[1] || '';
  if (!videoId) return null;
  
  // Get title
  const titleEl = renderer.querySelector('#video-title, #video-title-link, h3 a');
  const videoTitle = titleEl?.textContent?.trim() || '';
  
  // Get channel name
  const channelEl = renderer.querySelector('#channel-name a, ytd-channel-name a, .ytd-channel-name');
  const channelName = channelEl?.textContent?.trim() || '';
  
  // Get position index
  const parent = renderer.parentElement;
  let positionIndex = 0;
  if (parent) {
    const siblings = Array.from(parent.children);
    positionIndex = siblings.indexOf(renderer);
  }
  
  return { videoId, videoTitle, channelName, positionIndex };
}

function scrapeSidebarRecommendations(): Array<{ videoId: string; videoTitle: string; channelName: string; positionIndex: number }> {
  const recommendations: Array<{ videoId: string; videoTitle: string; channelName: string; positionIndex: number }> = [];
  const sidebarItems = document.querySelectorAll('ytd-compact-video-renderer');
  
  sidebarItems.forEach((item, index) => {
    const link = item.querySelector('a.yt-simple-endpoint[href*="/watch"]');
    const href = link?.getAttribute('href') || '';
    const videoIdMatch = href.match(/[?&]v=([^&]+)/);
    const videoId = videoIdMatch?.[1] || '';
    if (!videoId) return;
    
    const titleEl = item.querySelector('#video-title');
    const videoTitle = titleEl?.textContent?.trim() || '';
    
    const channelEl = item.querySelector('.ytd-channel-name');
    const channelName = channelEl?.textContent?.trim() || '';
    
    recommendations.push({ videoId, videoTitle, channelName, positionIndex: index });
  });
  
  return recommendations;
}

// ===== Play Time Tracking =====

function startPlayTimeTracking(): void {
  if (state.lastPlayStartTime === null) {
    state.lastPlayStartTime = Date.now();
  }
}

function stopPlayTimeTracking(): void {
  if (state.lastPlayStartTime !== null) {
    state.playTimeAccumulatedMs += Date.now() - state.lastPlayStartTime;
    state.lastPlayStartTime = null;
  }
}

function getCurrentPlayTimeMs(): number {
  let total = state.playTimeAccumulatedMs;
  if (state.lastPlayStartTime !== null) {
    total += Date.now() - state.lastPlayStartTime;
  }
  return total;
}

// ===== Browser Session Management =====

export async function initBrowserSession(): Promise<void> {
  if (state.currentBrowserSession) return;
  
  const pageType = getPageType();
  state.currentPageType = pageType;
  state.pageEnteredAt = Date.now();
  
  // Initialize temporal tracking
  state.temporal.sessionStartTime = Date.now();
  state.temporal.lastActivityTime = Date.now();
  state.temporal.preSleepActive = isPreSleepTime();
  
  // Set first check time of the day
  if (!state.temporal.firstCheckTime) {
    state.temporal.firstCheckTime = getCurrentTimeHHMM();
  }
  
  state.currentBrowserSession = {
    id: generateId(),
    startedAt: Date.now(),
    endedAt: null,
    tabId: null,
    entryPageType: pageType,
    entryUrl: window.location.href,
    entrySource: document.referrer.includes('youtube.com') ? 'link' : 'direct',
    triggerType: 'unknown',
    totalDurationSeconds: 0,
    playDurationSeconds: 0,
    activeDurationSeconds: 0,
    backgroundSeconds: 0,
    pagesVisited: 1,
    videosWatched: 0,
    videosStartedNotFinished: 0,
    shortsCount: 0,
    totalScrollPixels: 0,
    thumbnailsHovered: 0,
    thumbnailsClicked: 0,
    pageReloads: 0,
    backButtonPresses: 0,
    recommendationClicks: 0,
    autoplayCount: 0,
    autoplayCancelled: 0,
    searchCount: 0,
    timeOnHomeSeconds: 0,
    timeOnWatchSeconds: 0,
    timeOnSearchSeconds: 0,
    timeOnShortsSeconds: 0,
    productiveVideos: 0,
    unproductiveVideos: 0,
    neutralVideos: 0,
    exitType: undefined,
    searchQueries: [],
  };
  
  // Record initial page event
  recordPageEvent('page_load', {
    navigationMethod: 'direct',
  });
  
  // Send to background
  safeSendMessage('PAGE_LOAD', {
    sessionId: state.currentBrowserSession.id,
    pageType,
    url: window.location.href,
    timestamp: Date.now(),
    firstCheckTime: state.temporal.firstCheckTime,
    preSleepActive: state.temporal.preSleepActive,
  });
  
  // Setup observers
  setupThumbnailObservers();
  setupAutoplayObserver();
  setupSidebarObserver();
  setupVideoObservers();
}

export function updateBrowserSession(): void {
  if (!state.currentBrowserSession) return;
  
  const now = Date.now();
  const totalMs = now - state.currentBrowserSession.startedAt;
  const backgroundMs = state.backgroundAccumulatedMs;
  const activeMs = totalMs - backgroundMs;
  
  state.currentBrowserSession.totalDurationSeconds = Math.floor(totalMs / 1000);
  state.currentBrowserSession.playDurationSeconds = Math.floor(getCurrentPlayTimeMs() / 1000);
  state.currentBrowserSession.activeDurationSeconds = Math.floor(activeMs / 1000);
  state.currentBrowserSession.backgroundSeconds = Math.floor(backgroundMs / 1000);
  
  // Update time by page type
  const timeOnCurrentPage = Math.floor((now - state.pageEnteredAt) / 1000);
  switch (state.currentPageType) {
    case 'homepage':
      state.currentBrowserSession.timeOnHomeSeconds = timeOnCurrentPage;
      break;
    case 'watch':
      state.currentBrowserSession.timeOnWatchSeconds = timeOnCurrentPage;
      break;
    case 'search':
      state.currentBrowserSession.timeOnSearchSeconds = timeOnCurrentPage;
      break;
    case 'shorts':
      state.currentBrowserSession.timeOnShortsSeconds = timeOnCurrentPage;
      break;
  }
  
  // Update hourly seconds
  const hour = getHour();
  const elapsedThisInterval = Math.floor((now - state.temporal.lastActivityTime) / 1000);
  state.temporal.hourlySeconds[hour] = (state.temporal.hourlySeconds[hour] || 0) + elapsedThisInterval;
  state.temporal.lastActivityTime = now;
  
  // Check for binge mode
  if (!state.temporal.bingeModeActive && isBingeSession()) {
    state.temporal.bingeModeActive = true;
    // Could trigger an intervention here
  }
}

export function endBrowserSession(exitType?: ExitType): void {
  if (!state.currentBrowserSession) return;
  
  updateBrowserSession();
  state.currentBrowserSession.endedAt = Date.now();
  state.currentBrowserSession.exitType = exitType;
  
  // End any active video session
  if (state.currentVideoSession) {
    endVideoSession('navigated');
  }
  
  safeSendMessage('PAGE_UNLOAD', {
    session: state.currentBrowserSession,
    events: getAllPendingEvents(),
    temporal: {
      firstCheckTime: state.temporal.firstCheckTime,
      hourlySeconds: state.temporal.hourlySeconds,
      bingeModeActive: state.temporal.bingeModeActive,
      preSleepActive: state.temporal.preSleepActive,
      sessionDurationMs: Date.now() - state.temporal.sessionStartTime,
    },
  });
  
  state.currentBrowserSession = null;
  clearPendingEvents();
}

// ===== Video Session Management =====

export function startVideoSession(): void {
  const videoInfo = scrapeVideoInfo();
  if (!videoInfo || !videoInfo.videoId) return;
  
  // End any existing video session
  if (state.currentVideoSession && state.currentVideoSession.videoId !== videoInfo.videoId) {
    endVideoSession('abandoned');
  }
  
  if (state.currentVideoSession?.videoId === videoInfo.videoId) {
    // Same video, just update
    state.currentVideoInfo = videoInfo;
    return;
  }
  
  state.currentVideoInfo = videoInfo;
  state.lastVideoTime = videoInfo.currentTime;
  state.lastVideoPaused = videoInfo.isPaused;
  state.videoSeekCount = 0;
  state.videoPauseCount = 0;
  
  state.currentVideoSession = {
    id: generateId(),
    videoId: videoInfo.videoId,
    title: videoInfo.title,
    channel: videoInfo.channel,
    channelId: videoInfo.channelId,
    durationSeconds: videoInfo.durationSeconds,
    watchedSeconds: 0,
    watchedPercent: 0,
    source: detectVideoSource(),
    sourcePosition: undefined,
    isShort: videoInfo.isShort,
    playbackSpeed: videoInfo.playbackSpeed,
    averageSpeed: videoInfo.playbackSpeed,
    category: videoInfo.category,
    productivityRating: null,
    timestamp: Date.now(),
    startedAt: Date.now(),
    endedAt: undefined,
    ratedAt: null,
    seekCount: 0,
    pauseCount: 0,
    tabSwitchCount: 0,
    ledToAnotherVideo: undefined,
    nextVideoSource: undefined,
    intention: undefined,
    matchedIntention: undefined,
  };
  
  if (state.currentBrowserSession) {
    state.currentBrowserSession.videosStartedNotFinished++;
    if (videoInfo.isShort) {
      state.currentBrowserSession.shortsCount++;
    }
  }
  
  // Start play time tracking if video is already playing
  if (!videoInfo.isPaused) {
    startPlayTimeTracking();
  }

  // Record video play event
  recordVideoEvent('play');

  // Track sidebar recommendations shown
  trackSidebarRecommendationsShown();
}

export function updateVideoSession(): void {
  const videoInfo = scrapeVideoInfo();
  if (!videoInfo || !state.currentVideoSession) return;
  
  const prevTime = state.lastVideoTime;
  const currTime = videoInfo.currentTime;
  const wasPaused = state.lastVideoPaused;
  const isPaused = videoInfo.isPaused;
  
  state.lastVideoTime = currTime;
  state.lastVideoPaused = isPaused;
  
  // Detect seek (time jump > 2 seconds that's not normal playback)
  const timeDelta = currTime - prevTime;
  if (Math.abs(timeDelta) > 2 && !wasPaused) {
    state.videoSeekCount++;
    state.currentVideoSession.seekCount = state.videoSeekCount;
    recordVideoEvent('seek', {
      seekFromSeconds: prevTime,
      seekToSeconds: currTime,
      seekDeltaSeconds: timeDelta,
    });
  }
  
  // Detect pause/play
  if (!wasPaused && isPaused) {
    state.videoPauseCount++;
    state.currentVideoSession.pauseCount = state.videoPauseCount;
    stopPlayTimeTracking();
    recordVideoEvent('pause');
  } else if (wasPaused && !isPaused) {
    startPlayTimeTracking();
    recordVideoEvent('play');
  }
  
  // Update watched time
  state.currentVideoSession.watchedSeconds = Math.floor(currTime);
  if (videoInfo.durationSeconds > 0) {
    state.currentVideoSession.watchedPercent = Math.round((currTime / videoInfo.durationSeconds) * 100);
  }
  
  // Update playback speed
  if (videoInfo.playbackSpeed !== state.currentVideoSession.playbackSpeed) {
    recordVideoEvent('speed_change', { playbackSpeed: videoInfo.playbackSpeed });
    state.currentVideoSession.playbackSpeed = videoInfo.playbackSpeed;
  }
  
  state.currentVideoInfo = videoInfo;
}

export function endVideoSession(reason: 'ended' | 'abandoned' | 'navigated' = 'navigated'): void {
  if (!state.currentVideoSession) return;

  stopPlayTimeTracking();
  updateVideoSession();
  state.currentVideoSession.endedAt = Date.now();
  
  const watchPercent = state.currentVideoSession.watchedPercent;
  
  if (state.currentBrowserSession) {
    state.currentBrowserSession.videosWatched++;
    state.currentBrowserSession.videosStartedNotFinished--;
  }
  
  // Record end event
  const eventType = reason === 'ended' ? 'ended' : 'abandoned';
  recordVideoEvent(eventType, {
    watchPercentAtAbandon: reason !== 'ended' ? watchPercent : undefined,
  });
  
  // Send to background
  safeSendMessage('VIDEO_WATCHED', state.currentVideoSession);
  
  state.currentVideoSession = null;
  state.currentVideoInfo = null;
  state.lastVideoTime = 0;
  state.videoSeekCount = 0;
  state.videoPauseCount = 0;
}

function recordVideoEvent(eventType: string, extras?: Record<string, any>): void {
  if (!state.currentVideoSession || !state.currentBrowserSession) return;
  
  const event: VideoWatchEvent = {
    type: 'video_watch',
    sessionId: state.currentBrowserSession.id,
    watchSessionId: state.currentVideoSession.id,
    videoId: state.currentVideoSession.videoId,
    eventType: eventType as any,
    timestamp: Date.now(),
    videoTimeSeconds: state.lastVideoTime,
    ...extras,
  };
  
  state.pendingEvents.video_watch.push(event);
}

// ===== Scroll Event Tracking (Debounced) =====

export function trackScroll(): void {
  if (!state.currentBrowserSession) return;
  
  const now = Date.now();
  const scrollY = window.scrollY;
  const delta = Math.abs(scrollY - state.lastScrollY);
  const timeDelta = now - state.lastScrollTime;
  
  // Calculate velocity (pixels per second)
  const velocity = timeDelta > 0 ? (delta / timeDelta) * 1000 : 0;
  state.scrollVelocities.push(velocity);
  if (state.scrollVelocities.length > 10) state.scrollVelocities.shift();
  
  const direction: 'up' | 'down' = scrollY > state.lastScrollY ? 'down' : 'up';
  const pageHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  const scrollDepth = pageHeight > viewportHeight 
    ? Math.round((scrollY / (pageHeight - viewportHeight)) * 100)
    : 0;
  
  state.currentBrowserSession.totalScrollPixels += delta;
  
  // Create event for batching
  const event: ScrollEvent = {
    type: 'scroll',
    sessionId: state.currentBrowserSession.id,
    pageType: state.currentPageType,
    timestamp: now,
    scrollY,
    scrollDepthPercent: scrollDepth,
    viewportHeight,
    pageHeight,
    scrollVelocity: velocity,
    scrollDirection: direction,
    visibleVideoCount: getVisibleThumbnailCount(),
  };
  
  state.batchScrollEvents.push(event);
  
  state.lastScrollY = scrollY;
  state.lastScrollTime = now;
  
  // Debounce: flush scroll events every 500ms
  if (state.scrollDebounceTimer) {
    clearTimeout(state.scrollDebounceTimer);
  }
  
  state.scrollDebounceTimer = window.setTimeout(() => {
    flushScrollEvents();
  }, 500);
}

function flushScrollEvents(): void {
  if (state.batchScrollEvents.length === 0) return;
  
  // Take only the most recent event or aggregate
  // For now, take the last event as the "summary" of scroll activity
  const lastEvent = state.batchScrollEvents[state.batchScrollEvents.length - 1];
  
  // Calculate aggregate metrics
  const avgVelocity = state.scrollVelocities.length > 0
    ? state.scrollVelocities.reduce((a, b) => a + b, 0) / state.scrollVelocities.length
    : 0;
  
  lastEvent.scrollVelocity = avgVelocity;
  
  state.pendingEvents.scroll.push(lastEvent);
  state.batchScrollEvents = [];
  state.scrollDebounceTimer = null;
}

// ===== Thumbnail Hover/Click Tracking =====

function setupThumbnailObservers(): void {
  // Observer to detect new thumbnails
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          attachThumbnailListeners(node);
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  // Attach to existing thumbnails
  attachThumbnailListeners(document.body);
}

function attachThumbnailListeners(root: Element): void {
  const selectors = [
    'ytd-rich-item-renderer',
    'ytd-compact-video-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
  ];
  
  selectors.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => {
      if (state.observedThumbnails.has(el)) return;
      state.observedThumbnails.add(el);
      
      el.addEventListener('mouseenter', () => handleThumbnailHoverStart(el));
      el.addEventListener('mouseleave', () => handleThumbnailHoverEnd(el, false));
      el.addEventListener('click', (e) => handleThumbnailClick(el, e));
    });
  });
}

function handleThumbnailHoverStart(element: Element): void {
  const info = scrapeThumbnailInfo(element);
  if (!info) return;
  
  state.thumbnailHoverStart.set(info.videoId, {
    startTime: Date.now(),
    videoTitle: info.videoTitle,
    channelName: info.channelName,
    positionIndex: info.positionIndex,
  });
}

function handleThumbnailHoverEnd(element: Element, clicked: boolean): void {
  const info = scrapeThumbnailInfo(element);
  if (!info) return;
  
  const hoverInfo = state.thumbnailHoverStart.get(info.videoId);
  if (!hoverInfo || !state.currentBrowserSession) {
    state.thumbnailHoverStart.delete(info.videoId);
    return;
  }
  
  const hoverDuration = Date.now() - hoverInfo.startTime;
  state.thumbnailHoverStart.delete(info.videoId);
  
  // Only track if hover was meaningful (> 200ms)
  if (hoverDuration < 200 && !clicked) return;
  
  state.currentBrowserSession.thumbnailsHovered++;
  if (clicked) {
    state.currentBrowserSession.thumbnailsClicked++;
  }
  
  const event: ThumbnailEvent = {
    type: 'thumbnail',
    sessionId: state.currentBrowserSession.id,
    videoId: info.videoId,
    videoTitle: hoverInfo.videoTitle,
    channelName: hoverInfo.channelName,
    pageType: state.currentPageType,
    positionIndex: hoverInfo.positionIndex,
    timestamp: Date.now(),
    hoverDurationMs: hoverDuration,
    previewPlayed: hoverDuration > 3000, // YouTube starts preview after ~3s
    previewWatchMs: hoverDuration > 3000 ? hoverDuration - 3000 : 0,
    clicked,
    titleCapsPercent: countCapsPercent(hoverInfo.videoTitle),
    titleLength: hoverInfo.videoTitle.length,
  };
  
  state.pendingEvents.thumbnail.push(event);
}

function handleThumbnailClick(element: Element, _event: Event): void {
  handleThumbnailHoverEnd(element, true);
}

export function trackThumbnailHover(videoId: string, videoTitle: string, channelName: string, positionIndex: number): void {
  state.thumbnailHoverStart.set(videoId, {
    startTime: Date.now(),
    videoTitle,
    channelName,
    positionIndex,
  });
}

export function trackThumbnailLeave(videoId: string, clicked: boolean = false): void {
  const hoverInfo = state.thumbnailHoverStart.get(videoId);
  if (!hoverInfo || !state.currentBrowserSession) return;
  
  const hoverDuration = Date.now() - hoverInfo.startTime;
  state.thumbnailHoverStart.delete(videoId);
  
  state.currentBrowserSession.thumbnailsHovered++;
  if (clicked) {
    state.currentBrowserSession.thumbnailsClicked++;
  }
  
  const event: ThumbnailEvent = {
    type: 'thumbnail',
    sessionId: state.currentBrowserSession.id,
    videoId,
    videoTitle: hoverInfo.videoTitle,
    channelName: hoverInfo.channelName,
    pageType: state.currentPageType,
    positionIndex: hoverInfo.positionIndex,
    timestamp: Date.now(),
    hoverDurationMs: hoverDuration,
    previewPlayed: hoverDuration > 3000,
    previewWatchMs: hoverDuration > 3000 ? hoverDuration - 3000 : 0,
    clicked,
    titleCapsPercent: countCapsPercent(hoverInfo.videoTitle),
    titleLength: hoverInfo.videoTitle.length,
  };
  
  state.pendingEvents.thumbnail.push(event);
}

// ===== Page Navigation Tracking =====

function recordPageEvent(eventType: string, extras?: Record<string, any>): void {
  if (!state.currentBrowserSession) return;
  
  const now = Date.now();
  const timeOnPage = now - state.pageEnteredAt;
  
  const event: PageEvent = {
    type: 'page',
    sessionId: state.currentBrowserSession.id,
    eventType: eventType as any,
    pageType: state.currentPageType,
    pageUrl: window.location.href,
    timestamp: now,
    fromPageType: state.previousPageType || undefined,
    navigationMethod: extras?.navigationMethod,
    searchQuery: extras?.searchQuery,
    searchResultsCount: extras?.searchResultsCount,
    timeOnPageMs: timeOnPage,
  };
  
  state.pendingEvents.page.push(event);
}

export function trackPageNavigation(eventType: string, extras?: Record<string, any>): void {
  if (!state.currentBrowserSession) return;
  
  recordPageEvent(eventType, extras);
  
  // Handle specific event types
  switch (eventType) {
    case 'page_load':
      state.currentBrowserSession.pagesVisited++;
      break;
    case 'page_reload':
      state.currentBrowserSession.pageReloads++;
      break;
    case 'back_button':
      state.currentBrowserSession.backButtonPresses++;
      break;
  }
  
  state.previousPageType = state.currentPageType;
  state.currentPageType = getPageType();
  state.pageEnteredAt = Date.now();
}

export function trackSearch(query: string): void {
  if (!state.currentBrowserSession) return;
  
  state.currentBrowserSession.searchCount++;
  state.currentBrowserSession.searchQueries.push(query);
  
  // Count search results
  const resultsCount = document.querySelectorAll('ytd-video-renderer').length;
  
  trackPageNavigation('page_load', {
    navigationMethod: 'search',
    searchQuery: query,
    searchResultsCount: resultsCount,
  });
}

// ===== Recommendation Tracking =====

function setupSidebarObserver(): void {
  // Observe sidebar for changes
  const observer = new MutationObserver(() => {
    if (state.currentPageType === 'watch') {
      trackSidebarRecommendationsShown();
    }
  });
  
  // Try to find the sidebar
  const sidebar = document.querySelector('#secondary, ytd-watch-next-secondary-results-renderer');
  if (sidebar) {
    observer.observe(sidebar, { childList: true, subtree: true });
  }
}

function trackSidebarRecommendationsShown(): void {
  if (!state.currentBrowserSession) return;
  
  const recommendations = scrapeSidebarRecommendations();
  recommendations.forEach((rec) => {
    if (state.sidebarRecommendationsShown.has(rec.videoId)) return;
    state.sidebarRecommendationsShown.add(rec.videoId);
    
    const event: RecommendationEvent = {
      type: 'recommendation',
      sessionId: state.currentBrowserSession!.id,
      location: 'sidebar',
      positionIndex: rec.positionIndex,
      videoId: rec.videoId,
      videoTitle: rec.videoTitle,
      channelName: rec.channelName,
      action: 'ignored', // Will be updated if clicked
      hoverDurationMs: undefined,
      timestamp: Date.now(),
      wasAutoplayNext: rec.positionIndex === 0, // First item is usually autoplay next
      autoplayCountdownStarted: false,
      autoplayCancelled: false,
    };
    
    state.pendingEvents.recommendation.push(event);
  });
}

export function trackRecommendationClick(videoId: string, position: number, location: string): void {
  if (!state.currentBrowserSession) return;
  
  state.currentBrowserSession.recommendationClicks++;
  
  // Find existing event for this video and update it
  const existingEvent = state.pendingEvents.recommendation.find(
    (e) => e.videoId === videoId && e.action === 'ignored'
  );
  
  if (existingEvent) {
    existingEvent.action = 'clicked';
    existingEvent.timestamp = Date.now();
  } else {
    const event: RecommendationEvent = {
      type: 'recommendation',
      sessionId: state.currentBrowserSession.id,
      location: location as any,
      positionIndex: position,
      videoId,
      videoTitle: undefined,
      channelName: undefined,
      action: 'clicked',
      hoverDurationMs: undefined,
      timestamp: Date.now(),
      wasAutoplayNext: false,
      autoplayCountdownStarted: false,
      autoplayCancelled: false,
    };
    
    state.pendingEvents.recommendation.push(event);
  }
}

// ===== Autoplay Tracking =====

function setupAutoplayObserver(): void {
  // Watch for autoplay countdown element
  const observer = new MutationObserver(() => {
    checkAutoplayCountdown();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
}

function checkAutoplayCountdown(): void {
  const autoplayOverlay = document.querySelector('.ytp-autonav-endscreen-countdown-overlay');
  
  if (autoplayOverlay && !state.autoplayCountdownActive) {
    // Autoplay countdown started
    state.autoplayCountdownActive = true;
    state.autoplayCountdownStartTime = Date.now();
    
    // Try to get the next video info
    const nextVideoLink = document.querySelector('.ytp-autonav-endscreen-upnext-thumbnail');
    const href = nextVideoLink?.getAttribute('href') || '';
    const videoIdMatch = href.match(/[?&]v=([^&]+)/);
    state.autoplayNextVideo = videoIdMatch?.[1] || null;
    
    if (state.autoplayNextVideo) {
      recordAutoplayEvent(state.autoplayNextVideo, 'countdown_started');
    }
  } else if (!autoplayOverlay && state.autoplayCountdownActive) {
    // Autoplay countdown ended
    state.autoplayCountdownActive = false;
    
    // Check if it was cancelled or played
    // If we're still on the same video, it was cancelled
    const currentVideoId = getVideoId();
    if (state.autoplayNextVideo && currentVideoId !== state.autoplayNextVideo) {
      // Autoplay happened
      if (state.currentBrowserSession) {
        state.currentBrowserSession.autoplayCount++;
      }
    } else if (state.autoplayNextVideo) {
      // Autoplay was cancelled
      recordAutoplayEvent(state.autoplayNextVideo, 'cancelled');
      if (state.currentBrowserSession) {
        state.currentBrowserSession.autoplayCancelled++;
      }
    }
    
    state.autoplayNextVideo = null;
    state.autoplayCountdownStartTime = null;
  }
}

function recordAutoplayEvent(videoId: string, action: 'countdown_started' | 'cancelled' | 'played'): void {
  if (!state.currentBrowserSession) return;
  
  const event: RecommendationEvent = {
    type: 'recommendation',
    sessionId: state.currentBrowserSession.id,
    location: 'autoplay_queue',
    positionIndex: 0,
    videoId,
    videoTitle: undefined,
    channelName: undefined,
    action: action === 'played' ? 'clicked' : 'ignored',
    hoverDurationMs: undefined,
    timestamp: Date.now(),
    wasAutoplayNext: true,
    autoplayCountdownStarted: action === 'countdown_started' || action === 'cancelled',
    autoplayCancelled: action === 'cancelled',
  };
  
  state.pendingEvents.recommendation.push(event);
}

export function trackAutoplay(nextVideoId: string, cancelled: boolean = false): void {
  if (!state.currentBrowserSession) return;
  
  if (cancelled) {
    state.currentBrowserSession.autoplayCancelled++;
    recordAutoplayEvent(nextVideoId, 'cancelled');
  } else {
    state.currentBrowserSession.autoplayCount++;
    state.autoplayNextVideo = nextVideoId;
    recordAutoplayEvent(nextVideoId, 'played');
  }
}

// ===== Video Element Observers =====

function setupVideoObservers(): void {
  // Observe for video element
  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (video) {
      attachVideoListeners(video);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  // Attach to existing video
  const video = document.querySelector('video');
  if (video) {
    attachVideoListeners(video);
  }
}

let videoListenersAttached = false;

function attachVideoListeners(video: HTMLVideoElement): void {
  if (videoListenersAttached) return;
  videoListenersAttached = true;
  
  video.addEventListener('ended', () => {
    if (state.currentVideoSession) {
      endVideoSession('ended');
    }
  });
  
  video.addEventListener('ratechange', () => {
    if (state.currentVideoSession && state.currentBrowserSession) {
      recordVideoEvent('speed_change', { playbackSpeed: video.playbackRate });
    }
  });
  
  video.addEventListener('waiting', () => {
    if (state.currentVideoSession && state.currentBrowserSession) {
      recordVideoEvent('buffer');
    }
  });
}

// ===== Visibility Tracking =====

export function handleVisibilityChange(): void {
  if (!state.currentBrowserSession) return;
  
  if (document.hidden) {
    state.visibilityHiddenAt = Date.now();
    state.tabSwitchCount++;
    stopPlayTimeTracking();

    recordPageEvent('tab_hidden');

    // Pause tracking for video
    if (state.currentVideoSession) {
      state.currentVideoSession.tabSwitchCount++;
    }
  } else {
    if (state.visibilityHiddenAt) {
      const hiddenMs = Date.now() - state.visibilityHiddenAt;
      state.backgroundAccumulatedMs += hiddenMs;
      state.visibilityHiddenAt = null;
    }

    // Resume play time tracking if video is still playing
    const videoInfo = scrapeVideoInfo();
    if (videoInfo && !videoInfo.isPaused && state.currentVideoSession) {
      startPlayTimeTracking();
    }

    recordPageEvent('tab_visible');
  }
}

// ===== Intervention Tracking =====

export function trackInterventionShown(interventionType: string, triggerReason: string): void {
  if (!state.currentBrowserSession) return;
  
  const event: InterventionEvent = {
    type: 'intervention',
    sessionId: state.currentBrowserSession.id,
    interventionType: interventionType as any,
    triggeredAt: Date.now(),
    triggerReason,
    response: undefined,
    responseAt: undefined,
    responseTimeMs: undefined,
    userLeftYoutube: false,
    minutesUntilReturn: undefined,
  };
  
  state.pendingEvents.intervention.push(event);
}

export function trackInterventionResponse(
  interventionType: string,
  response: string,
  userLeftYoutube: boolean = false
): void {
  // Find the most recent intervention of this type
  const event = [...state.pendingEvents.intervention]
    .reverse()
    .find((e) => e.interventionType === interventionType && !e.response);
  
  if (event) {
    event.response = response as any;
    event.responseAt = Date.now();
    event.responseTimeMs = event.responseAt - event.triggeredAt;
    event.userLeftYoutube = userLeftYoutube;
  }
}

// ===== Mood Report Tracking =====

export function trackMoodReport(reportType: 'pre' | 'post', mood: number, intention?: string, satisfaction?: number): void {
  if (!state.currentBrowserSession) return;
  
  const report: MoodReport = {
    timestamp: Date.now(),
    sessionId: state.currentBrowserSession.id,
    reportType,
    mood,
    intention,
    satisfaction,
  };
  
  state.pendingEvents.mood.push(report);
}

// ===== Productivity Rating =====

export function rateVideo(rating: -1 | 0 | 1): void {
  if (!state.currentVideoSession) return;
  
  state.currentVideoSession.productivityRating = rating;
  state.currentVideoSession.ratedAt = Date.now();
  
  if (state.currentBrowserSession) {
    if (rating === 1) state.currentBrowserSession.productiveVideos++;
    else if (rating === -1) state.currentBrowserSession.unproductiveVideos++;
    else state.currentBrowserSession.neutralVideos++;
  }
  
  safeSendMessage('RATE_VIDEO', {
    sessionId: state.currentVideoSession.id,
    rating,
  });
}

// ===== Event Management =====

function getAllPendingEvents(): Record<string, any[]> {
  return {
    scroll: state.pendingEvents.scroll,
    thumbnail: state.pendingEvents.thumbnail,
    page: state.pendingEvents.page,
    video_watch: state.pendingEvents.video_watch,
    recommendation: state.pendingEvents.recommendation,
    intervention: state.pendingEvents.intervention,
    mood: state.pendingEvents.mood,
  };
}

function clearPendingEvents(): void {
  state.pendingEvents = {
    scroll: [],
    thumbnail: [],
    page: [],
    video_watch: [],
    recommendation: [],
    intervention: [],
    mood: [],
  };
  state.sidebarRecommendationsShown.clear();
}

// ===== Export State Getters =====

export function getCurrentSession(): BrowserSession | null {
  updateBrowserSession();
  return state.currentBrowserSession;
}

export function getCurrentVideoSession(): VideoSession | null {
  return state.currentVideoSession;
}

export function getCurrentVideoInfo(): VideoInfo | null {
  return scrapeVideoInfo();
}

export function getPendingEvents(): Array<ScrollEvent | ThumbnailEvent | PageEvent | VideoWatchEvent | RecommendationEvent> {
  // Flush any pending scroll events
  flushScrollEvents();
  
  // Combine all events
  const allEvents = [
    ...state.pendingEvents.scroll,
    ...state.pendingEvents.thumbnail,
    ...state.pendingEvents.page,
    ...state.pendingEvents.video_watch,
    ...state.pendingEvents.recommendation,
  ];
  
  // Clear events
  state.pendingEvents.scroll = [];
  state.pendingEvents.thumbnail = [];
  state.pendingEvents.page = [];
  state.pendingEvents.video_watch = [];
  state.pendingEvents.recommendation = [];
  
  return allEvents;
}

export function getTemporalData(): TemporalTracking {
  return { ...state.temporal };
}

export function getTabSwitchCount(): number {
  return state.tabSwitchCount;
}

export function isBingeMode(): boolean {
  return state.temporal.bingeModeActive;
}

export function isPreSleep(): boolean {
  return state.temporal.preSleepActive || isPreSleepTime();
}
