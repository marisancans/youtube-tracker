/**
 * YouTube DOM Scraper
 * Extracts video metadata and page state
 */

/**
 * Get current video info from watch page
 */
export function getVideoInfo() {
  const videoElement = document.querySelector('video');
  if (!videoElement) return null;
  
  const videoId = new URLSearchParams(window.location.search).get('v');
  const isShort = window.location.pathname.startsWith('/shorts/');
  
  // Title
  const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') 
    || document.querySelector('h1.ytd-video-primary-info-renderer')
    || document.querySelector('#title h1');
  const title = titleEl?.textContent?.trim() || '';
  
  // Channel
  const channelEl = document.querySelector('#channel-name a')
    || document.querySelector('ytd-channel-name a')
    || document.querySelector('.ytd-video-owner-renderer #text a');
  const channel = channelEl?.textContent?.trim() || '';
  
  // Duration (from DOM, more reliable than video element for total)
  const durationEl = document.querySelector('.ytp-time-duration');
  const durationText = durationEl?.textContent || '0:00';
  const durationSeconds = parseDuration(durationText);
  
  // Current playback state
  const currentTime = Math.round(videoElement.currentTime || 0);
  const playbackSpeed = videoElement.playbackRate || 1;
  const isPaused = videoElement.paused;
  
  return {
    videoId: isShort ? window.location.pathname.split('/shorts/')[1] : videoId,
    title,
    channel,
    durationSeconds,
    currentTime,
    playbackSpeed,
    isPaused,
    isShort,
  };
}

/**
 * Get homepage video recommendations
 */
export function getHomepageVideos() {
  const videos = [];
  const items = document.querySelectorAll('ytd-rich-item-renderer');
  
  items.forEach(item => {
    const titleEl = item.querySelector('#video-title');
    const channelEl = item.querySelector('#channel-name');
    const thumbnailEl = item.querySelector('img');
    
    if (titleEl) {
      videos.push({
        title: titleEl.textContent?.trim(),
        channel: channelEl?.textContent?.trim(),
        href: titleEl.href,
      });
    }
  });
  
  return videos;
}

/**
 * Get sidebar recommendations (on watch page)
 */
export function getSidebarRecommendations() {
  const videos = [];
  const items = document.querySelectorAll('ytd-compact-video-renderer');
  
  items.forEach(item => {
    const titleEl = item.querySelector('#video-title');
    const channelEl = item.querySelector('.ytd-channel-name');
    
    if (titleEl) {
      videos.push({
        title: titleEl.textContent?.trim(),
        channel: channelEl?.textContent?.trim(),
        href: titleEl.href,
      });
    }
  });
  
  return videos;
}

/**
 * Detect current page type
 */
export function getPageType() {
  const path = window.location.pathname;
  
  if (path === '/' || path === '') return 'homepage';
  if (path === '/watch') return 'watch';
  if (path.startsWith('/shorts/')) return 'shorts';
  if (path === '/results') return 'search';
  if (path.startsWith('/feed/subscriptions')) return 'subscriptions';
  if (path.startsWith('/feed/history')) return 'history';
  if (path.startsWith('/feed/trending')) return 'trending';
  if (path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/')) return 'channel';
  if (path.startsWith('/playlist')) return 'playlist';
  
  return 'other';
}

/**
 * Check if autoplay is enabled
 */
export function isAutoplayEnabled() {
  const toggle = document.querySelector('.ytp-autonav-toggle-button');
  return toggle?.getAttribute('aria-checked') === 'true';
}

/**
 * Get search query if on search page
 */
export function getSearchQuery() {
  return new URLSearchParams(window.location.search).get('search_query') || '';
}

/**
 * Parse duration string to seconds
 * "1:23" -> 83, "1:02:30" -> 3750
 */
function parseDuration(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Check if we're in Shorts vertical scroll mode
 */
export function isInShortsMode() {
  return window.location.pathname.startsWith('/shorts/');
}

/**
 * Get scroll depth on homepage (0-100%)
 */
export function getScrollDepth() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (docHeight <= 0) return 0;
  return Math.round((scrollTop / docHeight) * 100);
}
