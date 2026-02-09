// ==UserScript==
// @name         YouTube Detox
// @namespace    https://github.com/marisancans/youtube-tracker
// @version      0.1.0
// @description  Track YouTube viewing habits for gradual reduction
// @author       Maris Ancans
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/marisancans/youtube-tracker/master/youtube-detox.user.js
// @updateURL    https://raw.githubusercontent.com/marisancans/youtube-tracker/master/youtube-detox.user.js
// ==/UserScript==

(function() {
  'use strict';

  // ===== STORAGE =====
  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  async function getStats() {
    return JSON.parse(await GM_getValue('dailyStats', '{}'));
  }

  async function saveStats(stats) {
    await GM_setValue('dailyStats', JSON.stringify(stats));
  }

  async function updateDaily(updates) {
    const stats = await getStats();
    const today = getTodayKey();
    stats[today] = stats[today] || { totalSeconds: 0, videoCount: 0, shortsCount: 0, sessions: 0 };
    Object.keys(updates).forEach(k => stats[today][k] = (stats[today][k] || 0) + updates[k]);
    await saveStats(stats);
  }

  // ===== STATE =====
  let currentVideo = null;
  let videoStartTime = null;
  let sessionStart = Date.now();
  let lastUrl = location.href;

  // ===== SCRAPING =====
  function getVideoInfo() {
    const video = document.querySelector('video');
    if (!video) return null;

    const isShort = location.pathname.startsWith('/shorts/');
    const videoId = isShort
      ? location.pathname.split('/shorts/')[1]
      : new URLSearchParams(location.search).get('v');

    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-video-primary-info-renderer');
    const channelEl = document.querySelector('#channel-name a, ytd-channel-name a');
    const durationEl = document.querySelector('.ytp-time-duration');

    const parseDuration = s => {
      if (!s) return 0;
      const p = s.split(':').map(Number);
      return p.length === 2 ? p[0]*60 + p[1] : p[0]*3600 + p[1]*60 + p[2];
    };

    return {
      videoId,
      title: titleEl?.textContent?.trim() || '',
      channel: channelEl?.textContent?.trim() || '',
      duration: parseDuration(durationEl?.textContent),
      currentTime: Math.round(video.currentTime),
      isShort,
    };
  }

  function getPageType() {
    const p = location.pathname;
    if (p === '/' || p === '') return 'homepage';
    if (p === '/watch') return 'watch';
    if (p.startsWith('/shorts/')) return 'shorts';
    if (p === '/results') return 'search';
    return 'other';
  }

  // ===== TRACKING =====
  function finishVideo() {
    if (!currentVideo) return;
    if (videoStartTime) {
      currentVideo.watched += (Date.now() - videoStartTime) / 1000;
    }

    console.log('[YT Detox] Video:', currentVideo.title?.slice(0,40), '|', Math.round(currentVideo.watched) + 's');

    const statsUpdate = { videoCount: 1 };
    if (currentVideo.isShort) statsUpdate.shortsCount = 1;
    updateDaily(statsUpdate);

    currentVideo = null;
    videoStartTime = null;
  }

  function onPlay() {
    const info = getVideoInfo();
    if (!info) return;

    if (!currentVideo || currentVideo.videoId !== info.videoId) {
      finishVideo();
      currentVideo = { ...info, watched: 0 };
      videoStartTime = Date.now();
    } else {
      videoStartTime = Date.now();
    }
  }

  function onPause() {
    if (currentVideo && videoStartTime) {
      currentVideo.watched += (Date.now() - videoStartTime) / 1000;
      videoStartTime = null;
    }
  }

  // ===== OBSERVERS =====
  function attachVideo(video) {
    if (video.dataset.detoxTracked) return;
    video.dataset.detoxTracked = 'true';
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', finishVideo);
  }

  function checkForVideo() {
    const video = document.querySelector('video');
    if (video) attachVideo(video);
  }

  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      const old = lastUrl;
      lastUrl = location.href;
      if (old.includes('/watch') || old.includes('/shorts/')) finishVideo();
      checkForVideo();
    }
    checkForVideo();
  }).observe(document.body, { childList: true, subtree: true });

  // Session tracking
  updateDaily({ sessions: 1 });
  window.addEventListener('beforeunload', () => {
    finishVideo();
    const sessionSecs = Math.round((Date.now() - sessionStart) / 1000);
    // Sync save not possible, but video was already logged
  });

  // ===== MENU =====
  GM_registerMenuCommand('📊 Show Stats', async () => {
    const stats = await getStats();
    const today = stats[getTodayKey()] || {};
    const mins = Math.round((today.totalSeconds || 0) / 60);
    alert(`YouTube Detox - Today\n\nVideos: ${today.videoCount || 0}\nShorts: ${today.shortsCount || 0}\nSessions: ${today.sessions || 0}`);
  });

  GM_registerMenuCommand('💾 Export Data', async () => {
    const stats = await getStats();
    const blob = new Blob([JSON.stringify(stats, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `youtube-detox-${getTodayKey()}.json`;
    a.click();
  });

  console.log('[YT Detox] Userscript loaded');
})();
