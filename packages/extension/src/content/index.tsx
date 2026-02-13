// Top-level marker - runs immediately when script loads
const BUILD_ID = 'v5-floating';
console.log(`%c[YT Detox] Content script loaded (${BUILD_ID})`, 'color: #0f0; font-size: 16px; font-weight: bold;');
(window as any).__YT_DETOX_LOADED__ = true;

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
  getCurrentSession,
  getTemporalData,
} from './tracker';
import { initDriftEffects } from './drift-effects';
import { initMusicDetection } from './music-detector';
import { logError, initErrorReporting } from '../lib/error-logger';

// ===== Constants =====

const WIDGET_CONTAINER_ID = 'yt-detox-widget-root';
const UPDATE_INTERVAL = 1000;
const SCROLL_DEBOUNCE = 150;

// ===== State =====

let root: Root | null = null;
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

const BAR_HEIGHT = 72;
const SPACER_STYLE_ID = 'yt-detox-spacer-style';

/** Mount bar on document.body (fixed), push player down with CSS. */
function mountWidget(): void {
  if (document.getElementById(WIDGET_CONTAINER_ID)) return;

  const host = document.createElement('div');
  host.id = WIDGET_CONTAINER_ID;
  host.style.cssText = `
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    height: ${BAR_HEIGHT}px;
    z-index: 2000;
    display: flex;
    justify-content: center;
    pointer-events: none;
  `;
  document.body.appendChild(host);

  // Push YouTube's content down so the bar doesn't overlap
  if (!document.getElementById(SPACER_STYLE_ID)) {
    const spacerStyle = document.createElement('style');
    spacerStyle.id = SPACER_STYLE_ID;
    spacerStyle.textContent = `
      ytd-watch-flexy #full-bleed-container,
      ytd-watch-flexy #player-full-bleed-container {
        margin-top: ${BAR_HEIGHT}px !important;
      }
    `;
    document.head.appendChild(spacerStyle);
  }

  // Create shadow root for style isolation
  const shadow = host.attachShadow({ mode: 'open' });

  const styles = document.createElement('style');
  styles.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap');

    :host {
      all: initial;
      display: block;
      font-family: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #fff;

      /* Nautical color tokens */
      --parchment: #f5e6c8;
      --parchment-dark: #e8d5b7;
      --parchment-darker: #d4c5a0;
      --ink: #2c1810;
      --ink-light: #4a3728;
      --navy: #0a1628;
      --navy-light: #1a2744;
      --teal: #0d9488;
      --teal-light: #5eead4;
      --gold: #d4a574;
      --gold-dark: #b8956a;
      --storm-red: #991b1b;
      --storm-gray: #334155;
      --seafoam: #a7f3d0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes yt-detox-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes yt-detox-wave {
      0% { transform: translateX(0); }
      50% { transform: translateX(3px); }
      100% { transform: translateX(0); }
    }

    @keyframes yt-detox-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }

    @keyframes yt-detox-glow {
      0%, 100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.3); }
      50% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.5); }
    }

    @keyframes ship-rock {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(var(--rock-intensity, 3deg)); }
      75% { transform: rotate(calc(var(--rock-intensity, 3deg) * -1)); }
    }

    @keyframes compass-needle {
      0%, 100% { transform: rotate(var(--needle-rotation, 0deg)); }
      5% { transform: rotate(calc(var(--needle-rotation, 0deg) + 2deg)); }
      10% { transform: rotate(calc(var(--needle-rotation, 0deg) - 1deg)); }
      15% { transform: rotate(var(--needle-rotation, 0deg)); }
    }

    @keyframes fog-drift {
      0% { opacity: 0.3; transform: translateX(-5%); }
      50% { opacity: 0.5; transform: translateX(5%); }
      100% { opacity: 0.3; transform: translateX(-5%); }
    }

    @keyframes beacon-rotate {
      0% { opacity: 0.2; }
      25% { opacity: 0.8; }
      50% { opacity: 0.2; }
      75% { opacity: 0.8; }
      100% { opacity: 0.2; }
    }

    /* Scrollbar styling — gold nautical */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: rgba(10, 22, 40, 0.3); }
    ::-webkit-scrollbar-thumb { background: #d4a574; border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: #b8956a; }
  `;
  shadow.appendChild(styles);

  const reactRoot = document.createElement('div');
  shadow.appendChild(reactRoot);

  root = createRoot(reactRoot);
  root.render(<App />);

  console.log('[YT Detox] Widget mounted');
}

function showHideWidget(): void {
  const host = document.getElementById(WIDGET_CONTAINER_ID);
  const spacer = document.getElementById(SPACER_STYLE_ID);
  const pt = getPageType();
  const show = pt === 'watch' || pt === 'shorts';
  if (host) host.style.display = show ? 'flex' : 'none';
  if (spacer) (spacer as HTMLStyleElement).disabled = !show;
}

// ===== Event Handlers =====

function handleUrlChange(): void {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) return;

  const oldPageType = getPageType();
  lastUrl = currentUrl;

  trackPageNavigation('page_load', { navigationMethod: 'click' });

  if (oldPageType === 'watch' || oldPageType === 'shorts') {
    endVideoSession('navigated');
  }

  const newPageType = getPageType();
  showHideWidget();

  if (newPageType === 'watch' || newPageType === 'shorts') {
    setTimeout(startVideoSession, 1000);
  }

  if (newPageType === 'shorts') {
    chrome.runtime.sendMessage({
      type: 'DRIFT_BEHAVIOR_EVENT',
      data: { axis: 'behaviorPattern', weight: 0.15 },
    });
  }

  if (newPageType === 'search') {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('search_query');
    if (query) {
      trackSearch(query);
      chrome.runtime.sendMessage({
        type: 'DRIFT_BEHAVIOR_EVENT',
        data: { axis: 'behaviorPattern', weight: -0.10 },
      });
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

// ===== Navigation Detection =====

function setupNavigationListener(): void {
  // Listen for yt-navigate-finish bridged from MAIN world script
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'yt-detox-nav') return;
    if (event.data.type === 'navigate-finish') {
      console.log('[YT Detox] yt-navigate-finish received:', event.data.url);
      handleUrlChange();
    }
  });
}

function setupVideoObserver(): void {
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
  document.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const thumbnail = target.closest('ytd-thumbnail, ytd-rich-grid-media');
    if (!thumbnail) return;

    const link = thumbnail.querySelector('a#thumbnail');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const videoId = new URLSearchParams(href.split('?')[1]).get('v') || href.split('/shorts/')[1];
    if (videoId) {
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
  });
}

function setupRecommendationTracking(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const link = target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || !href.includes('/watch')) return;

    const isEndScreen = !!target.closest('.ytp-endscreen');
    const isSidebar = !!target.closest('#secondary, #related, ytd-watch-next-secondary-results-renderer');
    const isHomeFeed = !!target.closest('ytd-rich-grid-renderer, ytd-rich-grid-media');

    if (isEndScreen || isSidebar || isHomeFeed) {
      const videoId = new URLSearchParams(href.split('?')[1]).get('v');
      if (videoId) {
        const location = isEndScreen ? 'end_screen' : isSidebar ? 'sidebar' : 'home_feed';
        let position = 0;
        const renderer = link.closest('ytd-compact-video-renderer, ytd-rich-item-renderer, ytd-video-renderer');
        if (renderer?.parentElement) {
          const siblings = Array.from(renderer.parentElement.children).filter(
            (el) => el.tagName === renderer.tagName,
          );
          position = Math.max(0, siblings.indexOf(renderer));
        }
        trackRecommendationClick(videoId, position, location);
        chrome.runtime.sendMessage({
          type: 'DRIFT_BEHAVIOR_EVENT',
          data: { axis: 'behaviorPattern', weight: 0.20 },
        });
      }
    }
  });
}

function setupAutoplayTracking(): void {
  const observer = new MutationObserver(() => {
    const countdown = document.querySelector('.ytp-autonav-endscreen-countdown-overlay');
    if (countdown) {
      const nextVideo = document.querySelector('.ytp-autonav-endscreen-upnext-button') as HTMLElement;
      if (nextVideo) {
        // TODO: Extract video ID from navigation endpoint and track autoplay
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

  initErrorReporting('0.5.0');

  window.addEventListener('error', (e) => {
    logError(e.message, `global:${e.filename}:${e.lineno}`, e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    logError(String(e.reason), 'unhandledrejection', (e.reason as Error)?.stack);
  });

  (window as any).__YT_DETOX_TRACKER__ = { version: '0.5.0', initialized: true };

  console.log('[YT Detox] Initializing...');

  // Check auth before starting tracker
  const authResp = await new Promise<any>((resolve) =>
    chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' }, resolve),
  );
  if (!authResp?.user) {
    console.log('[YT Detox] Not authenticated — tracker paused');
    mountWidget(); // Widget shows auth-gate bar
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.authState?.newValue?.user) {
        isInitialized = false;
        init();
      }
    });
    return;
  }

  const storage = await new Promise<any>((resolve) => chrome.storage.local.get('settings', resolve));
  const devFeatures = storage?.settings?.devFeatures || {
    driftEffects: false,
    frictionOverlay: false,
    musicDetection: false,
    nudges: false,
  };
  (window as any).__YT_DETOX_DEV_FEATURES__ = devFeatures;
  console.log('[YT Detox] Dev features:', devFeatures);

  await initBrowserSession();

  if (devFeatures.driftEffects) {
    initDriftEffects();
  } else {
    console.log('[YT Detox] Drift effects DISABLED (dev switch)');
  }

  if (devFeatures.musicDetection) {
    initMusicDetection();
  } else {
    console.log('[YT Detox] Music detection DISABLED (dev switch)');
  }

  // Event listeners
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const logo = target.closest('a#logo, ytd-topbar-logo-renderer a');
    if (logo) {
      trackPageNavigation('feed_refresh');
    }
  });

  // Set up tracking
  setupNavigationListener();
  setupVideoObserver();
  setupThumbnailTracking();
  setupRecommendationTracking();
  setupAutoplayTracking();

  // Mount on document.body (once, forever) and show/hide per page
  mountWidget();
  showHideWidget();

  const pageType = getPageType();
  if (pageType === 'watch' || pageType === 'shorts') {
    setTimeout(startVideoSession, 1500);
  }

  // Video session update interval
  window.setInterval(() => {
    const pt = getPageType();
    if (pt === 'watch' || pt === 'shorts') updateVideoSession();
  }, UPDATE_INTERVAL);

  // Periodic live stats flush (every 30s) so Dashboard/Settings see current data
  window.setInterval(() => {
    const session = getCurrentSession();
    const temporal = getTemporalData();
    if (session) {
      chrome.runtime.sendMessage({
        type: 'STATS_UPDATE',
        data: { session, temporal },
      });
    }
  }, 30000);

  console.log('[YT Detox] Initialized');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
