/**
 * YouTube DOM Utilities
 *
 * Patterns extracted from SponsorBlock's maze-utils (MIT License)
 * https://github.com/ajayyy/maze-utils
 *
 * Battle-tested with 10M+ users.
 */

// ===== TYPES =====

export type VideoID = string;
export type ChannelID = string;

export enum PageType {
  Unknown = 'unknown',
  Shorts = 'shorts',
  Watch = 'watch',
  Search = 'search',
  Browse = 'browse',
  Channel = 'channel',
  Embed = 'embed',
  Home = 'home',
  Subscriptions = 'subscriptions',
  History = 'history',
}

// ===== CONSTANTS =====

export const YT_DOMAINS = [
  'm.youtube.com',
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'music.youtube.com',
  'www.youtubekids.com',
  'tv.youtube.com',
];

// ===== SELECTORS =====

/** Thumbnail container selectors (desktop) */
export const THUMBNAIL_SELECTORS = {
  desktop: [
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-compact-playlist-renderer',
    'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model',
  ],
  mobile: [
    'ytm-video-with-context-renderer',
    'ytm-compact-video-renderer',
    'ytm-reel-item-renderer',
    'ytm-playlist-video-renderer',
    'ytm-shorts-lockup-view-model',
  ],
};

/** Thumbnail element selectors */
export const THUMBNAIL_ELEMENTS = {
  desktop: ['ytd-thumbnail', 'ytd-playlist-thumbnail', 'yt-thumbnail-view-model'],
  mobile: ['.media-item-thumbnail-container', '.video-thumbnail-container-compact', 'ytm-thumbnail-cover'],
};

/** Player controls selectors */
export const CONTROLS_SELECTORS = [
  '.ytp-right-controls', // YouTube desktop
  '.player-controls-top', // Mobile YouTube
  '.vjs-control-bar', // Invidious/videojs
  '.ypcs-control-buttons-right', // tv.youtube.com
];

/** Video title selectors */
export const TITLE_SELECTORS = [
  'h1.ytd-watch-metadata yt-formatted-string',
  'h1.ytd-video-primary-info-renderer',
  '#title h1 yt-formatted-string',
  '#title h1',
];

/** Channel name selectors */
export const CHANNEL_SELECTORS = ['#channel-name a', 'ytd-channel-name a', '.ytd-video-owner-renderer #text a'];

/** Sidebar recommendation selectors */
export const RECOMMENDATION_SELECTORS = [
  'ytd-compact-video-renderer', // Sidebar
  'ytd-rich-item-renderer', // Homepage grid
  'ytd-video-renderer', // Search results
];

// ===== UTILITIES =====

/**
 * Check if on mobile YouTube
 */
export function isMobile(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'm.youtube.com';
}

/**
 * Check if on YouTube TV
 */
export function isYouTubeTV(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'tv.youtube.com';
}

/**
 * Check if we're on a video page
 */
export function isVideoPage(): boolean {
  return !!document.URL.match(/\/watch|\/shorts|\/live|\/embed/);
}

/**
 * Get current page type
 */
export function getPageType(): PageType {
  const path = window.location.pathname;
  const url = window.location.href;

  if (path === '/' || path === '') return PageType.Home;
  if (path === '/watch') return PageType.Watch;
  if (path.startsWith('/shorts/')) return PageType.Shorts;
  if (path === '/results') return PageType.Search;
  if (path.startsWith('/feed/subscriptions')) return PageType.Subscriptions;
  if (path.startsWith('/feed/history')) return PageType.History;
  if (path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/')) return PageType.Channel;
  if (url.includes('/embed/')) return PageType.Embed;

  return PageType.Unknown;
}

/**
 * Extract video ID from current URL or a provided URL
 */
export function getVideoID(url?: string): VideoID | null {
  url = url || window.location.href;

  try {
    const urlObj = new URL(url);

    // /watch?v=VIDEO_ID
    const vParam = urlObj.searchParams.get('v');
    if (vParam) return vParam;

    // /shorts/VIDEO_ID
    const shortsMatch = urlObj.pathname.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];

    // /embed/VIDEO_ID
    const embedMatch = urlObj.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1];

    // /live/VIDEO_ID
    const liveMatch = urlObj.pathname.match(/\/live\/([^/?]+)/);
    if (liveMatch) return liveMatch[1];
  } catch {
    // Invalid URL
  }

  return null;
}

/**
 * Extract video ID from a thumbnail element
 */
export function getVideoIDFromThumbnail(thumbnail: HTMLElement): VideoID | null {
  const link = getThumbnailLink(thumbnail);
  if (!link) return null;

  const href = link.getAttribute('href');
  if (!href) return null;

  return getVideoID(new URL(href, window.location.origin).href);
}

/**
 * Get the link element within a thumbnail
 */
export function getThumbnailLink(thumbnail: HTMLElement): HTMLAnchorElement | null {
  const selectors = isMobile()
    ? ['a.media-item-thumbnail-container', 'a.reel-item-endpoint', 'a']
    : ['ytd-thumbnail a', 'ytd-playlist-thumbnail a', 'a'];

  for (const selector of selectors) {
    const link = thumbnail.querySelector(selector) as HTMLAnchorElement;
    if (link?.href) return link;
  }

  return null;
}

/**
 * Check if element is visible (not hidden, has dimensions, actually rendered)
 */
export function isVisible(element: HTMLElement | null): boolean {
  if (!element) return false;

  // Special case for video elements
  if (element.tagName === 'VIDEO') {
    const video = element as HTMLVideoElement;
    if ((element.classList.contains('html5-main-video') || element.id === 'player') && video.duration) {
      return true;
    }
  }

  if (element.offsetHeight === 0 || element.offsetWidth === 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const elementAtPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

  return elementAtPoint === element || element.contains(elementAtPoint) || elementAtPoint?.contains(element) || false;
}

/**
 * Wait for an element to appear in DOM
 */
export async function waitForElement(
  selector: string,
  options: { timeout?: number; visibleCheck?: boolean } = {},
): Promise<HTMLElement> {
  const { timeout = 10000, visibleCheck = false } = options;

  return new Promise((resolve, reject) => {
    // Check if already exists
    const existing = document.querySelector(selector) as HTMLElement;
    if (existing && (!visibleCheck || isVisible(existing))) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector) as HTMLElement;
      if (element && (!visibleCheck || isVisible(element))) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

/**
 * Wait for a condition to be true
 */
export async function waitFor<T>(condition: () => T, timeout = 5000, interval = 100): Promise<T> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const result = condition();
      if (result) {
        clearInterval(intervalId);
        resolve(result);
      }
    };

    const intervalId = setInterval(check, interval);
    setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error('Timeout'));
    }, timeout);

    check(); // Check immediately
  });
}

/**
 * Get the video element
 */
export function getVideoElement(): HTMLVideoElement | null {
  // Try specific YouTube selectors first
  const selectors = ['video.html5-main-video', '#movie_player video', 'video#player', 'video'];

  for (const selector of selectors) {
    const video = document.querySelector(selector) as HTMLVideoElement;
    if (video && video.duration) return video;
  }

  return null;
}

/**
 * Get video duration from DOM (more reliable than video element for display)
 */
export function getVideoDurationFromDOM(): number {
  const durationEl = document.querySelector('.ytp-time-duration');
  if (!durationEl) return 0;

  const text = durationEl.textContent || '';
  return parseDuration(text);
}

/**
 * Parse duration string to seconds
 * "1:23" -> 83, "1:02:30" -> 3750
 */
export function parseDuration(str: string): number {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Get video title from DOM
 */
export function getVideoTitle(): string {
  for (const selector of TITLE_SELECTORS) {
    const el = document.querySelector(selector);
    if (el?.textContent?.trim()) {
      return el.textContent.trim();
    }
  }
  return '';
}

/**
 * Get channel name from DOM
 */
export function getChannelName(): string {
  for (const selector of CHANNEL_SELECTORS) {
    const el = document.querySelector(selector);
    if (el?.textContent?.trim()) {
      return el.textContent.trim();
    }
  }
  return '';
}

/**
 * Check if autoplay is enabled
 */
export function isAutoplayEnabled(): boolean {
  const toggle = document.querySelector('.ytp-autonav-toggle-button');
  return toggle?.getAttribute('aria-checked') === 'true';
}

/**
 * Check if element is in inline preview player
 */
export function isInPreviewPlayer(element: Element): boolean {
  return !!element.closest('#inline-preview-player');
}

/**
 * Get search query from current URL
 */
export function getSearchQuery(): string {
  return new URLSearchParams(window.location.search).get('search_query') || '';
}

// ===== THUMBNAIL TRACKING =====

type ThumbnailCallback = (thumbnails: HTMLElement[]) => void;

const handledThumbnails = new Map<HTMLElement, MutationObserver>();
let thumbnailCallback: ThumbnailCallback | null = null;
let thumbnailObserver: MutationObserver | null = null;
let lastGarbageCollection = 0;
let lastThumbnailCheck = 0;

/**
 * Get thumbnail selector for current platform
 */
export function getThumbnailSelector(): string {
  const elements = isMobile() ? THUMBNAIL_ELEMENTS.mobile : THUMBNAIL_ELEMENTS.desktop;
  return elements.join(', ');
}

/**
 * Start listening for new thumbnails
 */
export function startThumbnailListener(callback: ThumbnailCallback): void {
  thumbnailCallback = callback;

  // Initial scan
  checkForNewThumbnails();

  // Watch for new thumbnails
  thumbnailObserver = new MutationObserver(() => {
    checkForNewThumbnails();
  });

  thumbnailObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Stop thumbnail listener
 */
export function stopThumbnailListener(): void {
  thumbnailCallback = null;
  thumbnailObserver?.disconnect();
  thumbnailObserver = null;

  for (const observer of handledThumbnails.values()) {
    observer.disconnect();
  }
  handledThumbnails.clear();
}

/**
 * Check for new thumbnails (debounced)
 */
function checkForNewThumbnails(): void {
  if (performance.now() - lastThumbnailCheck < 50) return;
  lastThumbnailCheck = performance.now();

  const thumbnails = document.querySelectorAll(getThumbnailSelector()) as NodeListOf<HTMLElement>;
  const newOnes: HTMLElement[] = [];

  for (const thumbnail of thumbnails) {
    if (!handledThumbnails.has(thumbnail)) {
      newOnes.push(thumbnail);

      // Watch for href changes (video changes in same thumbnail slot)
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
            thumbnailCallback?.([thumbnail]);
            break;
          }
        }
      });

      const link = getThumbnailLink(thumbnail);
      if (link) {
        observer.observe(link, { attributes: true });
      }

      handledThumbnails.set(thumbnail, observer);
    }
  }

  if (newOnes.length > 0) {
    thumbnailCallback?.(newOnes);
  }

  // Garbage collection - remove observers for elements no longer in DOM
  if (performance.now() - lastGarbageCollection > 5000) {
    for (const [thumbnail, observer] of handledThumbnails) {
      if (!document.body.contains(thumbnail)) {
        observer.disconnect();
        handledThumbnails.delete(thumbnail);
      }
    }
    lastGarbageCollection = performance.now();
  }
}

// ===== NAVIGATION TRACKING =====

type NavigationCallback = (url: string, oldUrl: string) => void;

let navigationCallback: NavigationCallback | null = null;
let lastUrl = '';

/**
 * Start listening for navigation changes (SPA-aware)
 */
export function startNavigationListener(callback: NavigationCallback): void {
  navigationCallback = callback;
  lastUrl = window.location.href;

  // Modern Navigation API (best for SPAs)
  if ('navigation' in window) {
    (window as any).navigation.addEventListener('navigate', (e: any) => {
      const newUrl = e.destination.url;
      if (newUrl !== lastUrl) {
        const oldUrl = lastUrl;
        lastUrl = newUrl;
        navigationCallback?.(newUrl, oldUrl);
      }
    });
  } else {
    // Fallback: MutationObserver + popstate
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        const oldUrl = lastUrl;
        lastUrl = window.location.href;
        navigationCallback?.(lastUrl, oldUrl);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('popstate', () => {
      if (window.location.href !== lastUrl) {
        const oldUrl = lastUrl;
        lastUrl = window.location.href;
        navigationCallback?.(lastUrl, oldUrl);
      }
    });
  }
}

// ===== SCROLL TRACKING =====

export interface ScrollInfo {
  scrollY: number;
  scrollDepthPercent: number;
  viewportHeight: number;
  pageHeight: number;
  direction: 'up' | 'down';
  velocity: number; // pixels per second
}

let lastScrollY = 0;
let lastScrollTime = 0;

/**
 * Get current scroll information
 */
export function getScrollInfo(): ScrollInfo {
  const scrollY = Math.round(window.scrollY);
  const viewportHeight = window.innerHeight;
  const pageHeight = document.documentElement.scrollHeight;
  const scrollableHeight = pageHeight - viewportHeight;
  const scrollDepthPercent = scrollableHeight > 0 ? Math.round((scrollY / scrollableHeight) * 100) : 0;

  const now = performance.now();
  const timeDelta = now - lastScrollTime;
  const scrollDelta = scrollY - lastScrollY;
  const velocity = timeDelta > 0 ? Math.abs(scrollDelta) / (timeDelta / 1000) : 0;
  const direction = scrollDelta >= 0 ? 'down' : 'up';

  lastScrollY = scrollY;
  lastScrollTime = now;

  return {
    scrollY,
    scrollDepthPercent,
    viewportHeight,
    pageHeight,
    direction,
    velocity,
  };
}

/**
 * Count visible video thumbnails in viewport
 */
export function countVisibleThumbnails(): number {
  const thumbnails = document.querySelectorAll(getThumbnailSelector());
  let count = 0;

  for (const thumbnail of thumbnails) {
    const rect = thumbnail.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      count++;
    }
  }

  return count;
}
