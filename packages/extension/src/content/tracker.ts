import type {
  VideoSession,
  BrowserSession,
  DailyStats,
  PageType,
  VideoSource,
  VideoInfo,
  ScrollEvent,
  ThumbnailEvent,
  PageEvent,
  VideoWatchEvent,
  RecommendationEvent,
  CATEGORY_KEYWORDS,
} from '@yt-detox/shared';

// ===== State Management =====

interface TrackerState {
  currentBrowserSession: BrowserSession | null;
  currentVideoSession: VideoSession | null;
  currentVideoInfo: VideoInfo | null;
  pageEnteredAt: number;
  currentPageType: PageType;
  previousPageType: PageType | null;
  lastScrollY: number;
  lastScrollTime: number;
  scrollVelocities: number[];
  visibilityHiddenAt: number | null;
  backgroundAccumulatedMs: number;
  thumbnailHoverStart: Map<string, number>; // videoId -> hover start time
  pendingEvents: Array<ScrollEvent | ThumbnailEvent | PageEvent | VideoWatchEvent | RecommendationEvent>;
  lastVideoTime: number;
  autoplayCountdownActive: boolean;
  autoplayNextVideo: string | null;
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
  scrollVelocities: [],
  visibilityHiddenAt: null,
  backgroundAccumulatedMs: 0,
  thumbnailHoverStart: new Map(),
  pendingEvents: [],
  lastVideoTime: 0,
  autoplayCountdownActive: false,
  autoplayNextVideo: null,
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

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function getHour(): string {
  return new Date().getHours().toString();
}

function countCapsPercent(text: string): number {
  if (!text) return 0;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;
  const caps = letters.replace(/[^A-Z]/g, '').length;
  return Math.round((caps / letters.length) * 100);
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

// ===== Browser Session Management =====

export async function initBrowserSession(): Promise<void> {
  if (state.currentBrowserSession) return;
  
  const pageType = getPageType();
  state.currentPageType = pageType;
  state.pageEnteredAt = Date.now();
  
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
  
  // Send to background
  chrome.runtime.sendMessage({
    type: 'PAGE_LOAD',
    data: {
      sessionId: state.currentBrowserSession.id,
      pageType,
      url: window.location.href,
      timestamp: Date.now(),
    },
  });
}

export function updateBrowserSession(): void {
  if (!state.currentBrowserSession) return;
  
  const now = Date.now();
  const totalMs = now - state.currentBrowserSession.startedAt;
  const backgroundMs = state.backgroundAccumulatedMs;
  const activeMs = totalMs - backgroundMs;
  
  state.currentBrowserSession.totalDurationSeconds = Math.floor(totalMs / 1000);
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
}

export function endBrowserSession(exitType?: string): void {
  if (!state.currentBrowserSession) return;
  
  updateBrowserSession();
  state.currentBrowserSession.endedAt = Date.now();
  state.currentBrowserSession.exitType = exitType;
  
  chrome.runtime.sendMessage({
    type: 'PAGE_UNLOAD',
    data: {
      session: state.currentBrowserSession,
      events: state.pendingEvents,
    },
  });
  
  state.currentBrowserSession = null;
  state.pendingEvents = [];
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
  
  // Record video play event
  recordVideoEvent('play');
}

export function updateVideoSession(): void {
  const videoInfo = scrapeVideoInfo();
  if (!videoInfo || !state.currentVideoSession) return;
  
  const prevTime = state.lastVideoTime;
  const currTime = videoInfo.currentTime;
  state.lastVideoTime = currTime;
  
  // Detect seek
  const timeDelta = currTime - prevTime;
  if (Math.abs(timeDelta) > 2) {
    state.currentVideoSession.seekCount++;
    recordVideoEvent('seek', {
      seekFromSeconds: prevTime,
      seekToSeconds: currTime,
      seekDeltaSeconds: timeDelta,
    });
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
  
  updateVideoSession();
  state.currentVideoSession.endedAt = Date.now();
  
  const watchPercent = state.currentVideoSession.watchedPercent;
  
  if (state.currentBrowserSession) {
    state.currentBrowserSession.videosWatched++;
    state.currentBrowserSession.videosStartedNotFinished--;
    
    // Categorize completion
    if (watchPercent >= 90) {
      // Completed
    } else if (watchPercent < 30) {
      // Abandoned
    }
  }
  
  // Record end event
  recordVideoEvent(reason === 'ended' ? 'ended' : 'abandoned', {
    watchPercentAtAbandon: reason === 'abandoned' ? watchPercent : undefined,
  });
  
  // Send to background
  chrome.runtime.sendMessage({
    type: 'VIDEO_WATCHED',
    data: state.currentVideoSession,
  });
  
  state.currentVideoSession = null;
  state.currentVideoInfo = null;
  state.lastVideoTime = 0;
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
  
  state.pendingEvents.push(event);
}

// ===== Behavioral Event Tracking =====

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
  
  const direction = scrollY > state.lastScrollY ? 'down' : 'up';
  const pageHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  const scrollDepth = pageHeight > viewportHeight 
    ? Math.round((scrollY / (pageHeight - viewportHeight)) * 100)
    : 0;
  
  state.currentBrowserSession.totalScrollPixels += delta;
  
  // Only record significant scrolls (> 100px, debounced to 500ms)
  if (delta > 100 && timeDelta > 500) {
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
    
    state.pendingEvents.push(event);
  }
  
  state.lastScrollY = scrollY;
  state.lastScrollTime = now;
}

export function trackThumbnailHover(videoId: string, videoTitle: string, channelName: string, positionIndex: number): void {
  state.thumbnailHoverStart.set(videoId, Date.now());
}

export function trackThumbnailLeave(videoId: string, clicked: boolean = false): void {
  const hoverStart = state.thumbnailHoverStart.get(videoId);
  if (!hoverStart || !state.currentBrowserSession) return;
  
  const hoverDuration = Date.now() - hoverStart;
  state.thumbnailHoverStart.delete(videoId);
  
  state.currentBrowserSession.thumbnailsHovered++;
  if (clicked) {
    state.currentBrowserSession.thumbnailsClicked++;
  }
  
  // We need video info - try to get from the thumbnail element
  // For now, record basic event
  const event: ThumbnailEvent = {
    type: 'thumbnail',
    sessionId: state.currentBrowserSession.id,
    videoId,
    videoTitle: '',  // Would need to scrape from DOM
    channelName: '', // Would need to scrape from DOM
    pageType: state.currentPageType,
    positionIndex: 0,
    timestamp: Date.now(),
    hoverDurationMs: hoverDuration,
    previewPlayed: hoverDuration > 3000, // YouTube starts preview after ~3s
    previewWatchMs: hoverDuration > 3000 ? hoverDuration - 3000 : 0,
    clicked,
    titleCapsPercent: 0,
    titleLength: 0,
  };
  
  state.pendingEvents.push(event);
}

export function trackPageNavigation(eventType: string, extras?: Record<string, any>): void {
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
  
  state.pendingEvents.push(event);
  
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
  state.pageEnteredAt = now;
}

export function trackSearch(query: string): void {
  if (!state.currentBrowserSession) return;
  
  state.currentBrowserSession.searchCount++;
  state.currentBrowserSession.searchQueries.push(query);
  
  trackPageNavigation('page_load', {
    navigationMethod: 'search',
    searchQuery: query,
  });
}

export function trackRecommendationClick(videoId: string, position: number, location: string): void {
  if (!state.currentBrowserSession) return;
  
  state.currentBrowserSession.recommendationClicks++;
  
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
  
  state.pendingEvents.push(event);
}

export function trackAutoplay(nextVideoId: string, cancelled: boolean = false): void {
  if (!state.currentBrowserSession) return;
  
  if (cancelled) {
    state.currentBrowserSession.autoplayCancelled++;
  } else {
    state.currentBrowserSession.autoplayCount++;
    state.autoplayNextVideo = nextVideoId;
  }
  
  const event: RecommendationEvent = {
    type: 'recommendation',
    sessionId: state.currentBrowserSession.id,
    location: 'autoplay_queue',
    positionIndex: 0,
    videoId: nextVideoId,
    videoTitle: undefined,
    channelName: undefined,
    action: cancelled ? 'ignored' : 'clicked',
    hoverDurationMs: undefined,
    timestamp: Date.now(),
    wasAutoplayNext: true,
    autoplayCountdownStarted: true,
    autoplayCancelled: cancelled,
  };
  
  state.pendingEvents.push(event);
}

// ===== Visibility Tracking =====

export function handleVisibilityChange(): void {
  if (!state.currentBrowserSession) return;
  
  if (document.hidden) {
    state.visibilityHiddenAt = Date.now();
    
    trackPageNavigation('tab_hidden');
    
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
    
    trackPageNavigation('tab_visible');
  }
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
  
  chrome.runtime.sendMessage({
    type: 'RATE_VIDEO',
    data: {
      sessionId: state.currentVideoSession.id,
      rating,
    },
  });
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
  const events = [...state.pendingEvents];
  state.pendingEvents = [];
  return events;
}
