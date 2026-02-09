import { createRoot, Root } from 'react-dom/client';
import App from './App';
import {
  initBrowserSession,
  endBrowserSession,
  startVideoSession,
  updateVideoSession,
  endVideoSession,
  trackScroll,
  trackPageNavigation,
  trackSearch,
  trackRecommendationClick,
  handleVisibilityChange,
  scrapeVideoInfo,
} from './tracker';

// ===== Constants =====

const WIDGET_CONTAINER_ID = 'yt-detox-widget-root';
const UPDATE_INTERVAL = 1000;
const SCROLL_DEBOUNCE = 150;

// ===== State =====

let root: Root | null = null;
let _updateIntervalId: number | null = null;
let scrollTimeoutId: number | null = null;
let lastUrl = window.location.href;
let isInitialized = false;

// ===== Widget Mounting =====

function getPageType(): 'watch' | 'shorts' | 'search' | 'other' {
  const path = window.location.pathname;
  if (path === '/watch' || window.location.search.includes('v=')) return 'watch';
  if (path.startsWith('/shorts')) return 'shorts';
  if (path === '/results' || window.location.search.includes('search_query=')) return 'search';
  return 'other';
}

function getWidgetContainer(): HTMLElement | null {
  const pageType = getPageType();
  
  if (pageType === 'watch') {
    // Try different selectors for the video player area
    return (
      document.querySelector('#secondary.ytd-watch-flexy') || // Sidebar
      document.querySelector('#related') ||
      document.querySelector('ytd-watch-flexy #secondary') ||
      document.querySelector('#player') // Fallback
    );
  }
  
  if (pageType === 'shorts') {
    return document.querySelector('ytd-shorts ytd-reel-video-renderer[is-active]');
  }
  
  return null;
}

function mountWidget(): void {
  const pageType = getPageType();
  if (pageType === 'other') {
    unmountWidget();
    return;
  }
  
  // Check if already mounted
  if (document.getElementById(WIDGET_CONTAINER_ID)) {
    return;
  }
  
  const container = getWidgetContainer();
  if (!container) {
    // Retry in 500ms
    setTimeout(mountWidget, 500);
    return;
  }
  
  // Create shadow DOM host
  const host = document.createElement('div');
  host.id = WIDGET_CONTAINER_ID;
  host.style.cssText = 'all: initial; display: block; margin-bottom: 16px;';
  
  // Insert at the beginning of the container
  if (container.firstChild) {
    container.insertBefore(host, container.firstChild);
  } else {
    container.appendChild(host);
  }
  
  // Create shadow root
  const shadow = host.attachShadow({ mode: 'open' });
  
  // Create styles
  const styles = document.createElement('style');
  styles.textContent = `
    :host {
      all: initial;
      display: block;
      font-family: 'Roboto', 'Arial', sans-serif;
      font-size: 14px;
      color: #fff;
    }
    
    * {
      box-sizing: border-box;
    }
    
    .widget-root {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    
    .widget-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    
    .widget-title {
      font-size: 12px;
      font-weight: 500;
      color: #a0a0a0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .session-timer {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .timer-value {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }
    
    .timer-label {
      font-size: 11px;
      color: #888;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 12px;
    }
    
    .stat-item {
      text-align: center;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    }
    
    .stat-value {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }
    
    .stat-label {
      font-size: 10px;
      color: #888;
      margin-top: 2px;
    }
    
    .productivity-prompt {
      margin-top: 12px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      text-align: center;
    }
    
    .prompt-text {
      font-size: 13px;
      color: #ccc;
      margin-bottom: 10px;
    }
    
    .rating-buttons {
      display: flex;
      justify-content: center;
      gap: 8px;
    }
    
    .rating-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.2s;
    }
    
    .rating-btn:hover {
      transform: scale(1.05);
    }
    
    .rating-btn:active {
      transform: scale(0.95);
    }
    
    .rating-btn.productive {
      background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
      color: white;
    }
    
    .rating-btn.neutral {
      background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
      color: white;
    }
    
    .rating-btn.unproductive {
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
    }
    
    .goal-progress {
      margin-top: 12px;
    }
    
    .progress-bar {
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3498db 0%, #2980b9 100%);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    
    .progress-fill.warning {
      background: linear-gradient(90deg, #f39c12 0%, #e67e22 100%);
    }
    
    .progress-fill.danger {
      background: linear-gradient(90deg, #e74c3c 0%, #c0392b 100%);
    }
    
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #888;
      margin-top: 4px;
    }
    
    .collapsed .widget-body {
      display: none;
    }
    
    .toggle-btn {
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 12px;
      padding: 4px;
    }
    
    .toggle-btn:hover {
      color: #fff;
    }
  `;
  shadow.appendChild(styles);
  
  // Create React root
  const reactRoot = document.createElement('div');
  shadow.appendChild(reactRoot);
  
  root = createRoot(reactRoot);
  root.render(<App />);
  
  console.log('[YT Detox] Widget mounted');
}

function unmountWidget(): void {
  const host = document.getElementById(WIDGET_CONTAINER_ID);
  if (host) {
    if (root) {
      root.unmount();
      root = null;
    }
    host.remove();
  }
}

// ===== Event Handlers =====

function handleUrlChange(): void {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) return;
  
  const oldPageType = getPageType();
  lastUrl = currentUrl;
  
  // Track navigation
  trackPageNavigation('page_load', {
    navigationMethod: 'click',
  });
  
  // Handle video session changes
  if (oldPageType === 'watch' || oldPageType === 'shorts') {
    endVideoSession('navigated');
  }
  
  const newPageType = getPageType();
  
  // Mount/unmount widget as needed
  if (newPageType === 'watch' || newPageType === 'shorts') {
    setTimeout(mountWidget, 500);
    setTimeout(startVideoSession, 1000);
  } else {
    unmountWidget();
  }
  
  // Track search
  if (newPageType === 'search') {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('search_query');
    if (query) {
      trackSearch(query);
    }
  }
}

function handleScroll(): void {
  if (scrollTimeoutId) {
    window.clearTimeout(scrollTimeoutId);
  }
  
  scrollTimeoutId = window.setTimeout(() => {
    trackScroll();
  }, SCROLL_DEBOUNCE) as unknown as number;
}

function handleVideoEvents(): void {
  const videoInfo = scrapeVideoInfo();
  if (!videoInfo) return;
  
  updateVideoSession();
}

function handleBeforeUnload(): void {
  endVideoSession('navigated');
  endBrowserSession('navigated_away');
}

// ===== Observer for SPA Navigation =====

function setupNavigationObserver(): void {
  // Watch for YouTube's SPA navigation
  const observer = new MutationObserver(() => {
    // Check for URL changes
    if (window.location.href !== lastUrl) {
      handleUrlChange();
    }
    
    // Check if we need to remount the widget
    const pageType = getPageType();
    if ((pageType === 'watch' || pageType === 'shorts') && !document.getElementById(WIDGET_CONTAINER_ID)) {
      setTimeout(mountWidget, 500);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function setupVideoObserver(): void {
  // Watch for video element changes
  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (video) {
      video.removeEventListener('play', handleVideoEvents);
      video.removeEventListener('pause', handleVideoEvents);
      video.removeEventListener('seeked', handleVideoEvents);
      video.removeEventListener('ratechange', handleVideoEvents);
      video.removeEventListener('ended', () => endVideoSession('ended'));
      
      video.addEventListener('play', handleVideoEvents);
      video.addEventListener('pause', handleVideoEvents);
      video.addEventListener('seeked', handleVideoEvents);
      video.addEventListener('ratechange', handleVideoEvents);
      video.addEventListener('ended', () => endVideoSession('ended'));
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function setupThumbnailTracking(): void {
  // Delegate hover tracking for thumbnails
  document.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const thumbnail = target.closest('ytd-thumbnail, ytd-rich-grid-media');
    if (!thumbnail) return;
    
    const link = thumbnail.querySelector('a#thumbnail');
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!href) return;
    
    const videoId = new URLSearchParams(href.split('?')[1]).get('v') ||
                    href.split('/shorts/')[1];
    
    if (videoId) {
      // Track hover start - we'll track end on mouseout
      thumbnail.setAttribute('data-hover-start', Date.now().toString());
    }
  });
  
  document.addEventListener('mouseout', (e) => {
    const target = e.target as HTMLElement;
    const thumbnail = target.closest('ytd-thumbnail, ytd-rich-grid-media');
    if (!thumbnail) return;
    
    const hoverStart = thumbnail.getAttribute('data-hover-start');
    if (!hoverStart) return;
    
    thumbnail.removeAttribute('data-hover-start');
    // Tracking is handled in the tracker module
  });
}

function setupRecommendationTracking(): void {
  // Track clicks on recommendations
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    // Check if clicking a video link
    const link = target.closest('a');
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!href || !href.includes('/watch')) return;
    
    // Determine location
    const isEndScreen = !!target.closest('.ytp-endscreen');
    const isSidebar = !!target.closest('#secondary, #related, ytd-watch-next-secondary-results-renderer');
    const isHomeFeed = !!target.closest('ytd-rich-grid-renderer, ytd-rich-grid-media');
    
    if (isEndScreen || isSidebar || isHomeFeed) {
      const videoId = new URLSearchParams(href.split('?')[1]).get('v');
      if (videoId) {
        const location = isEndScreen ? 'end_screen' : isSidebar ? 'sidebar' : 'home_feed';
        trackRecommendationClick(videoId, 0, location);
      }
    }
  });
}

function setupAutoplayTracking(): void {
  // Watch for autoplay countdown
  const observer = new MutationObserver(() => {
    const countdown = document.querySelector('.ytp-autonav-endscreen-countdown-overlay');
    if (countdown) {
      const nextVideo = document.querySelector('.ytp-autonav-endscreen-upnext-button') as HTMLElement;
      if (nextVideo) {
        // TODO: Extract video ID from navigation endpoint and track autoplay
        // const _endpoint = nextVideo.getAttribute('data-navigationendpoint');
      }
    }
  });
  
  const player = document.querySelector('#movie_player');
  if (player) {
    observer.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }
}

// ===== Initialization =====

async function init(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;
  
  console.log('[YT Detox] Initializing...');
  
  // Initialize browser session
  await initBrowserSession();
  
  // Set up event listeners
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('popstate', () => trackPageNavigation('back_button'));
  
  // Set up observers
  setupNavigationObserver();
  setupVideoObserver();
  setupThumbnailTracking();
  setupRecommendationTracking();
  setupAutoplayTracking();
  
  // Initial page check
  const pageType = getPageType();
  if (pageType === 'watch' || pageType === 'shorts') {
    setTimeout(mountWidget, 1000);
    setTimeout(startVideoSession, 1500);
  }
  
  // Start update interval
  updateIntervalId = window.setInterval(() => {
    const pageType = getPageType();
    if (pageType === 'watch' || pageType === 'shorts') {
      updateVideoSession();
    }
  }, UPDATE_INTERVAL);
  
  console.log('[YT Detox] Initialized');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
