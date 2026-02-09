/**
 * YouTube Detox - Content Script
 * Runs on youtube.com pages, tracks viewing behavior and shows floating widget
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
  let cachedSettings = null;
  let settingsCacheTime = 0;

  function getSettingsCached(cb) {
    if (cachedSettings && Date.now() - settingsCacheTime < 30000) {
      cb(cachedSettings);
      return;
    }
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
      if (chrome.runtime.lastError || !settings) {
        cb(cachedSettings || {});
        return;
      }
      cachedSettings = settings;
      settingsCacheTime = Date.now();
      cb(settings);
    });
  }

  // ===== PRODUCTIVITY PROMPT =====

  let promptTimeout = null;

  function maybeShowProductivityPrompt(videoData) {
    if (!videoData || videoData.isShort) return;
    if (videoData.watchedSeconds < 10) return;

    getSettingsCached((settings) => {
      if (!settings.interventionsEnabled?.productivityPrompts) return;

      // Whitelisted channels auto-rate as productive
      const whitelist = (settings.whitelistedChannels || []).map(c => c.toLowerCase());
      if (videoData.channel && whitelist.includes(videoData.channel.toLowerCase())) {
        chrome.runtime.sendMessage({
          type: 'RATE_VIDEO',
          data: { videoId: videoData.videoId, rating: 1 },
        });
        return;
      }

      // Random chance
      const chance = settings.productivityPromptChance || 0.3;
      if (Math.random() > chance) return;

      showProductivityPrompt(videoData);
    });
  }

  function showProductivityPrompt(videoData) {
    removeProductivityPrompt();

    chrome.runtime.sendMessage({ type: 'PROMPT_SHOWN' });

    const overlay = document.createElement('div');
    overlay.id = 'yt-detox-prompt';
    overlay.className = 'yt-detox-prompt-container';

    const titleText = videoData.title
      ? (videoData.title.length > 50 ? videoData.title.substring(0, 50) + '...' : videoData.title)
      : 'this video';

    overlay.innerHTML = `
      <div class="yt-detox-prompt-card">
        <div class="yt-detox-prompt-question">Was this productive?</div>
        <div class="yt-detox-prompt-video">${titleText}</div>
        <div class="yt-detox-prompt-buttons">
          <button class="yt-detox-prompt-btn productive" data-rating="1" title="Productive">
            <span>&#x1F44D;</span>
          </button>
          <button class="yt-detox-prompt-btn neutral" data-rating="0" title="Neutral / Skip">
            <span>&#x2014;</span>
          </button>
          <button class="yt-detox-prompt-btn unproductive" data-rating="-1" title="Not productive">
            <span>&#x1F44E;</span>
          </button>
        </div>
        <div class="yt-detox-prompt-timer" id="yt-detox-prompt-timer"></div>
      </div>
    `;

    // Insert above player (same location as widget)
    const player = document.querySelector('#primary-inner > #player');
    if (player) {
      player.parentElement.insertBefore(overlay, player);
    } else {
      document.body.appendChild(overlay);
    }

    // Button handlers
    overlay.querySelectorAll('.yt-detox-prompt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = parseInt(btn.dataset.rating, 10);
        chrome.runtime.sendMessage({
          type: 'RATE_VIDEO',
          data: { videoId: videoData.videoId, rating },
        });
        removeProductivityPrompt();
      });
    });

    // Auto-dismiss after 8 seconds
    let remaining = 8;
    const timerEl = overlay.querySelector('#yt-detox-prompt-timer');
    if (timerEl) timerEl.style.width = '100%';

    promptTimeout = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.style.width = (remaining / 8 * 100) + '%';
      if (remaining <= 0) {
        removeProductivityPrompt();
      }
    }, 1000);
  }

  function removeProductivityPrompt() {
    const existing = document.getElementById('yt-detox-prompt');
    if (existing) existing.remove();
    if (promptTimeout) {
      clearInterval(promptTimeout);
      promptTimeout = null;
    }
  }

  // ===== WIDGET =====

  let widgetEl = null;
  let statsInterval = null;

  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function buildWidgetHTML() {
    return `
      <div class="yt-detox-inner">
        <div class="yt-detox-header" id="yt-detox-header">
          <span class="yt-detox-logo">\u{1F9D8}</span>
          <span class="yt-detox-title">YouTube Detox</span>
          <span class="yt-detox-header-timer" id="yt-detox-bar-time">0m</span>
          <span class="yt-detox-header-stat" id="yt-detox-bar-videos">0 vid</span>
          <span class="yt-detox-toggle" id="yt-detox-toggle">\u25B2</span>
        </div>
        <div class="yt-detox-body" id="yt-detox-body">
          <div class="yt-detox-session" id="yt-detox-session">
            <div class="yt-detox-session-title">Current Session</div>
            <div class="yt-detox-session-timers">
              <div>
                <span class="yt-detox-session-timer-val" id="yt-detox-active">0:00</span>
                <div class="yt-detox-session-timer-lbl">active</div>
              </div>
              <div>
                <span class="yt-detox-session-timer-val dim" id="yt-detox-bg">0:00</span>
                <div class="yt-detox-session-timer-lbl">background</div>
              </div>
            </div>
          </div>
          <div class="yt-detox-stats-row">
            <div class="yt-detox-stat">
              <span class="yt-detox-stat-val" id="yt-detox-minutes">--</span>
              <span class="yt-detox-stat-lbl">minutes</span>
            </div>
            <div class="yt-detox-stat">
              <span class="yt-detox-stat-val" id="yt-detox-videos">--</span>
              <span class="yt-detox-stat-lbl">videos</span>
            </div>
            <div class="yt-detox-stat">
              <span class="yt-detox-stat-val" id="yt-detox-shorts">--</span>
              <span class="yt-detox-stat-lbl">shorts</span>
            </div>
            <div class="yt-detox-week-mini" id="yt-detox-week"></div>
          </div>
          <div class="yt-detox-productivity-row" id="yt-detox-productivity">
            <span class="yt-detox-prod-item good">&#x1F44D; <span id="yt-detox-prod-good">0</span></span>
            <span class="yt-detox-prod-item bad">&#x1F44E; <span id="yt-detox-prod-bad">0</span></span>
            <span class="yt-detox-prod-item goal">Goal: <span id="yt-detox-goal-progress">--</span></span>
          </div>
        </div>
      </div>
    `;
  }

  function createWidget() {
    // Only show on watch/shorts pages
    const pageType = getPageType();
    if (pageType !== 'watch' && pageType !== 'shorts') {
      removeWidget();
      return;
    }

    // Already mounted in the right place
    if (document.getElementById('yt-detox-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'yt-detox-widget';
    widget.classList.add('expanded');
    widget.innerHTML = buildWidgetHTML();

    widgetEl = widget;

    // Try to insert now, or wait for player to appear
    if (!tryInsertWidget(widget)) {
      waitForPlayer(widget);
    }

    // Toggle expand/collapse
    widget.querySelector('#yt-detox-toggle').addEventListener('click', () => {
      widget.classList.toggle('expanded');
      widget.querySelector('#yt-detox-toggle').textContent =
        widget.classList.contains('expanded') ? '\u25B2' : '\u25BC';
    });

    // Start polling stats
    updateWidgetStats();
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(updateWidgetStats, 1000);
  }

  function removeWidget() {
    const existing = document.getElementById('yt-detox-widget');
    if (existing) {
      existing.remove();
      widgetEl = null;
    }
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  }

  function tryInsertWidget(widget) {
    // On watch pages: #primary-inner contains #player then #below
    // Insert widget inside #primary-inner, right before #player
    const player = document.querySelector('#primary-inner > #player');
    if (player) {
      player.parentElement.insertBefore(widget, player);
      console.log('[YT Detox] Widget inserted before #player in #primary-inner');
      return true;
    }
    return false;
  }

  function waitForPlayer(widget) {
    const observer = new MutationObserver((_, obs) => {
      if (tryInsertWidget(widget)) {
        obs.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  function updateWidgetStats() {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (stats) => {
      if (chrome.runtime.lastError || !stats) return;

      const today = stats.today || {};
      const totalMin = Math.round((today.totalSeconds || 0) / 60);
      const videoCount = today.videoCount || 0;
      const shortsCount = today.shortsCount || 0;

      // Bar summary
      const barTime = document.getElementById('yt-detox-bar-time');
      const barVideos = document.getElementById('yt-detox-bar-videos');
      if (barTime) barTime.textContent = totalMin + 'm';
      if (barVideos) barVideos.textContent = videoCount + ' vid';

      // Panel: today stats
      const minEl = document.getElementById('yt-detox-minutes');
      const vidEl = document.getElementById('yt-detox-videos');
      const shrtEl = document.getElementById('yt-detox-shorts');
      if (minEl) minEl.textContent = totalMin;
      if (vidEl) vidEl.textContent = videoCount;
      if (shrtEl) shrtEl.textContent = shortsCount;

      // Session
      const sessionEl = document.getElementById('yt-detox-session');
      if (stats.currentSession) {
        sessionEl.classList.add('active');
        document.getElementById('yt-detox-active').textContent = formatTime(stats.currentSession.activeSeconds);
        document.getElementById('yt-detox-bg').textContent = formatTime(stats.currentSession.backgroundSeconds);
      } else {
        sessionEl.classList.remove('active');
      }

      // Productivity
      const prodGood = document.getElementById('yt-detox-prod-good');
      const prodBad = document.getElementById('yt-detox-prod-bad');
      const goalProgress = document.getElementById('yt-detox-goal-progress');
      if (prodGood) prodGood.textContent = today.productiveVideos || 0;
      if (prodBad) prodBad.textContent = today.unproductiveVideos || 0;
      if (goalProgress && stats.dailyGoalMinutes) {
        goalProgress.textContent = totalMin + '/' + stats.dailyGoalMinutes + 'm';
      }

      // Week chart
      renderWeekChart(stats.last7Days);
    });
  }

  function renderWeekChart(days) {
    const chart = document.getElementById('yt-detox-week');
    if (!chart || !days) return;
    chart.innerHTML = '';

    const maxMinutes = Math.max(
      ...days.map(d => Math.round((d.totalSeconds || 0) / 60)),
      1
    );

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const ordered = [...days].reverse();

    ordered.forEach(day => {
      const minutes = Math.round((day.totalSeconds || 0) / 60);
      const height = Math.max((minutes / maxMinutes) * 100, 4);
      const dow = new Date(day.date).getDay();

      const bar = document.createElement('div');
      bar.className = 'yt-detox-week-bar';
      bar.style.height = '100%';
      bar.innerHTML = `<div class="fill" style="height: ${height}%"></div>`;
      bar.title = `${day.date}: ${minutes} min`;
      chart.appendChild(bar);
    });
  }

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

    const videoData = {
      videoId: currentVideo.videoId,
      title: currentVideo.title,
      channel: currentVideo.channel,
      durationSeconds: currentVideo.durationSeconds,
      watchedSeconds: Math.round(currentVideo.watchedSeconds),
      source: currentVideo.source,
      isShort: currentVideo.isShort,
      playbackSpeed: currentVideo.playbackSpeed,
    };

    chrome.runtime.sendMessage({ type: 'VIDEO_WATCHED', data: videoData });

    maybeShowProductivityPrompt(videoData);

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

    // Widget: show on watch/shorts, remove elsewhere
    // Remove first so it re-inserts into the right spot on SPA navigation
    removeWidget();
    createWidget();
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
