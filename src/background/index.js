/**
 * YouTube Detox - Background Service Worker
 */

const STORAGE_KEYS = {
  SESSIONS: 'sessions',
  VIDEOS: 'videos',
  DAILY_STATS: 'dailyStats',
  SETTINGS: 'settings',
};

let currentSession = null;
let sessionTimeout = null;

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

async function updateDailyStats(date, updates) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_STATS);
  const stats = result[STORAGE_KEYS.DAILY_STATS] || {};
  const today = stats[date] || {
    totalSeconds: 0,
    videoCount: 0,
    shortsCount: 0,
    searchCount: 0,
    recommendationClicks: 0,
    autoplayCount: 0,
    sessions: 0,
  };
  
  Object.keys(updates).forEach(key => {
    today[key] = (today[key] || 0) + (updates[key] || 0);
  });
  
  stats[date] = today;
  await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_STATS]: stats });
}

async function appendToArray(key, item, maxItems = 5000) {
  const result = await chrome.storage.local.get(key);
  const arr = result[key] || [];
  arr.push(item);
  if (arr.length > maxItems) arr.splice(0, arr.length - maxItems);
  await chrome.storage.local.set({ [key]: arr });
}

// Install handler
chrome.runtime.onInstalled.addListener(() => {
  console.log('[YT Detox] Installed');
  chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: {
      trackingEnabled: true,
      phase: 'observation',
      installDate: Date.now(),
    }
  });
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[YT Detox BG]', message.type);
  
  switch (message.type) {
    case 'PAGE_LOAD':
      handlePageLoad(sender.tab);
      break;
      
    case 'PAGE_UNLOAD':
    case 'TAB_HIDDEN':
      handleSessionPause();
      break;
      
    case 'TAB_VISIBLE':
      handleSessionResume();
      break;
      
    case 'VIDEO_WATCHED':
      handleVideoWatched(message.data);
      break;
      
    case 'SEARCH':
      updateDailyStats(getTodayKey(), { searchCount: 1 });
      if (currentSession) currentSession.searchCount++;
      break;
      
    case 'RECOMMENDATION_CLICK':
      updateDailyStats(getTodayKey(), { recommendationClicks: 1 });
      if (currentSession) currentSession.recommendationClicks++;
      break;
      
    case 'AUTOPLAY_PENDING':
      updateDailyStats(getTodayKey(), { autoplayCount: 1 });
      if (currentSession) currentSession.autoplayCount++;
      break;
      
    case 'GET_SESSION':
      sendResponse(currentSession);
      return true;
      
    case 'GET_STATS':
      getStats().then(sendResponse);
      return true;
  }
});

async function handlePageLoad(tab) {
  if (sessionTimeout) {
    clearTimeout(sessionTimeout);
    sessionTimeout = null;
  }
  
  if (!currentSession) {
    currentSession = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      tabId: tab?.id,
      videos: [],
      totalWatchedSeconds: 0,
      shortsCount: 0,
      autoplayCount: 0,
      recommendationClicks: 0,
      searchCount: 0,
    };
    await updateDailyStats(getTodayKey(), { sessions: 1 });
    console.log('[YT Detox BG] Session started');
  }
}

function handleSessionPause() {
  if (!sessionTimeout) {
    sessionTimeout = setTimeout(() => endSession(), 30000);
  }
}

function handleSessionResume() {
  if (sessionTimeout) {
    clearTimeout(sessionTimeout);
    sessionTimeout = null;
  }
}

async function endSession() {
  if (!currentSession) return;
  
  currentSession.endedAt = Date.now();
  currentSession.durationSeconds = Math.round(
    (currentSession.endedAt - currentSession.startedAt) / 1000
  );
  
  await appendToArray(STORAGE_KEYS.SESSIONS, currentSession, 1000);
  await updateDailyStats(getTodayKey(), {
    totalSeconds: currentSession.durationSeconds,
  });
  
  console.log('[YT Detox BG] Session ended:', currentSession.durationSeconds, 's');
  currentSession = null;
  sessionTimeout = null;
}

async function handleVideoWatched(data) {
  const video = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...data,
    watchedPercent: data.durationSeconds > 0 
      ? Math.round((data.watchedSeconds / data.durationSeconds) * 100) 
      : 0,
  };
  
  if (currentSession) {
    currentSession.videos.push(video.id);
    currentSession.totalWatchedSeconds += data.watchedSeconds || 0;
    if (data.isShort) currentSession.shortsCount++;
  }
  
  await appendToArray(STORAGE_KEYS.VIDEOS, video, 5000);
  
  const statsUpdate = { videoCount: 1 };
  if (data.isShort) statsUpdate.shortsCount = 1;
  await updateDailyStats(getTodayKey(), statsUpdate);
  
  console.log('[YT Detox BG] Video:', data.title?.substring(0, 30));
}

async function getStats() {
  const today = getTodayKey();
  const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_STATS);
  const dailyStats = result[STORAGE_KEYS.DAILY_STATS] || {};
  
  const last7Days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    last7Days.push({ date: key, ...dailyStats[key] });
  }
  
  return {
    today: dailyStats[today] || {},
    last7Days,
    currentSession: currentSession ? {
      durationSeconds: Math.round((Date.now() - currentSession.startedAt) / 1000),
      videos: currentSession.videos.length,
      shortsCount: currentSession.shortsCount,
    } : null,
  };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentSession?.tabId === tabId) endSession();
});
