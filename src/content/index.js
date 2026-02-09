/**
 * YouTube Detox - Content Script
 * Runs on youtube.com pages, tracks viewing behavior
 */

(function() {
  'use strict';
  
  // ===== SCRAPER FUNCTIONS =====
  
  function getVideoInfo() {
    const videoElement = document.querySelector('video');
    if (!videoElement) return null;
    
    const videoId = new URLSearchParams(window.location.search).get('v');
    const isShort = window.location.pathname.startsWith('/shorts/');
    
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') 
      || document.querySelector('h1.ytd-video-primary-info-renderer')
      || document.querySelector('#title h1');
    const title = titleEl?.textContent?.trim() || '';
    
    const channelEl = document.querySelector('#channel-name a')
      || document.querySelector('ytd-channel-name a');
    const channel = channelEl?.textContent?.trim() || '';
    
    const durationEl = document.querySelector('.ytp-time-duration');
    const durationText = durationEl?.textContent || '0:00';
    const durationSeconds = parseDuration(durationText);
    
    return {
      videoId: isShort ? window.location.pathname.split('/shorts/')[1] : videoId,
      title,
      channel,
      durationSeconds,
      currentTime: Math.round(videoElement.currentTime || 0),
      playbackSpeed: videoElement.playbackRate || 1,
      isPaused: videoElement.paused,
      isShort,
    };
  }
  
  function getPageType() {
    const path = window.location.pathname;
    if (path === '/' || path === '') return 'homepage';
    if (path === '/watch') return 'watch';
    if (path.startsWith('/shorts/')) return 'shorts';
    if (path === '/results') return 'search';
    if (path.startsWith('/feed/subscriptions')) return 'subscriptions';
    return 'other';
  }
  
  function isAutoplayEnabled() {
    const toggle = document.querySelector('.ytp-autonav-toggle-button');
    return toggle?.getAttribute('aria-checked') === 'true';
  }
  
  function getSearchQuery() {
    return new URLSearchParams(window.location.search).get('search_query') || '';
  }
  
  function parseDuration(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }
  
  // ===== STATE =====
  
  let currentVideo = null;
  let videoStartTime = null;
  let lastUrl = window.location.href;
  
  // ===== MAIN LOGIC =====
  
  function init() {
    console.log('[YT Detox] Content script loaded');
    
    chrome.runtime.sendMessage({ type: 'PAGE_LOAD', url: window.location.href });
    
    setupNavigationObserver();
    setupVideoObserver();
    setupVisibilityTracking();
    setupClickTracking();
    
    handlePageChange();
  }
  
  function setupNavigationObserver() {
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        const oldUrl = lastUrl;
        lastUrl = window.location.href;
        handlePageChange(oldUrl);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    window.addEventListener('popstate', () => {
      if (window.location.href !== lastUrl) {
        const oldUrl = lastUrl;
        lastUrl = window.location.href;
        handlePageChange(oldUrl);
      }
    });
  }
  
  function setupVideoObserver() {
    const checkVideo = setInterval(() => {
      const video = document.querySelector('video');
      if (video && !video.hasAttribute('data-detox-tracked')) {
        video.setAttribute('data-detox-tracked', 'true');
        attachVideoListeners(video);
        clearInterval(checkVideo);
      }
    }, 500);
    
    setTimeout(() => clearInterval(checkVideo), 30000);
  }
  
  function attachVideoListeners(video) {
    video.addEventListener('play', onVideoPlay);
    video.addEventListener('pause', onVideoPause);
    video.addEventListener('ended', onVideoEnded);
    console.log('[YT Detox] Video listeners attached');
  }
  
  function onVideoPlay() {
    const info = getVideoInfo();
    if (!info) return;
    
    if (!currentVideo || currentVideo.videoId !== info.videoId) {
      if (currentVideo) finishCurrentVideo();
      
      currentVideo = {
        ...info,
        startedAt: Date.now(),
        watchedSeconds: 0,
        source: detectSource(),
      };
      videoStartTime = Date.now();
      console.log('[YT Detox] Video started:', info.title?.substring(0, 40));
    } else {
      videoStartTime = Date.now();
    }
  }
  
  function onVideoPause() {
    if (currentVideo && videoStartTime) {
      currentVideo.watchedSeconds += (Date.now() - videoStartTime) / 1000;
      videoStartTime = null;
    }
  }
  
  function onVideoEnded() {
    finishCurrentVideo();
    if (isAutoplayEnabled()) {
      chrome.runtime.sendMessage({ type: 'AUTOPLAY_PENDING' });
    }
  }
  
  function finishCurrentVideo() {
    if (!currentVideo) return;
    
    if (videoStartTime) {
      currentVideo.watchedSeconds += (Date.now() - videoStartTime) / 1000;
    }
    
    chrome.runtime.sendMessage({
      type: 'VIDEO_WATCHED',
      data: {
        videoId: currentVideo.videoId,
        title: currentVideo.title,
        channel: currentVideo.channel,
        durationSeconds: currentVideo.durationSeconds,
        watchedSeconds: Math.round(currentVideo.watchedSeconds),
        source: currentVideo.source,
        isShort: currentVideo.isShort,
        playbackSpeed: currentVideo.playbackSpeed,
      },
    });
    
    currentVideo = null;
    videoStartTime = null;
  }
  
  function handlePageChange(oldUrl) {
    const pageType = getPageType();
    console.log('[YT Detox] Page:', pageType);
    
    if (oldUrl?.includes('/watch') || oldUrl?.includes('/shorts/')) {
      finishCurrentVideo();
    }
    
    if (pageType === 'search') {
      const query = getSearchQuery();
      if (query) chrome.runtime.sendMessage({ type: 'SEARCH', query });
    }
    
    if (pageType === 'watch' || pageType === 'shorts') {
      setupVideoObserver();
    }
    
    if (pageType === 'watch' && oldUrl?.includes('/watch')) {
      chrome.runtime.sendMessage({ type: 'RECOMMENDATION_CLICK' });
    }
  }
  
  function setupVisibilityTracking() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (currentVideo && videoStartTime) {
          currentVideo.watchedSeconds += (Date.now() - videoStartTime) / 1000;
          videoStartTime = null;
        }
        chrome.runtime.sendMessage({ type: 'TAB_HIDDEN' });
      } else {
        if (currentVideo) videoStartTime = Date.now();
        chrome.runtime.sendMessage({ type: 'TAB_VISIBLE' });
      }
    });
    
    window.addEventListener('beforeunload', () => {
      finishCurrentVideo();
      chrome.runtime.sendMessage({ type: 'PAGE_UNLOAD' });
    });
  }
  
  function setupClickTracking() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('a');
      if (!target) return;
      
      const isRecommendation = 
        target.closest('ytd-compact-video-renderer') ||
        target.closest('ytd-rich-item-renderer') ||
        target.closest('ytd-video-renderer');
      
      if (isRecommendation && target.href?.includes('/watch')) {
        chrome.runtime.sendMessage({ type: 'RECOMMENDATION_CLICK' });
      }
    }, true);
  }
  
  function detectSource() {
    const referrer = document.referrer;
    const pageType = getPageType();
    
    if (pageType === 'shorts') return 'shorts';
    if (referrer.includes('/results')) return 'search';
    if (referrer.includes('/feed/subscriptions')) return 'subscription';
    if (referrer.includes('youtube.com/watch')) return 'recommendation';
    if (referrer.includes('youtube.com')) return 'homepage';
    return 'direct';
  }
  
  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
