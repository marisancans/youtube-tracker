import type {
  VideoSession,
  BrowserSession,
  DailyStats,
  Settings,
  Message,
  ScrollEvent,
  ThumbnailEvent,
  PageEvent,
  VideoWatchEvent,
  RecommendationEvent,
  InterventionEvent,
  ChannelStat,
} from '@yt-detox/shared';

// ===== State =====

interface StorageData {
  settings: Settings;
  videoSessions: VideoSession[];
  browserSessions: BrowserSession[];
  dailyStats: Record<string, DailyStats>;
  pendingEvents: Array<ScrollEvent | ThumbnailEvent | PageEvent | VideoWatchEvent | RecommendationEvent | InterventionEvent>;
  lastSyncTime: number;
}

const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  privacyTier: 'standard',
  phase: 'observation',
  installDate: Date.now(),
  dailyGoalMinutes: 60,
  weekendGoalMinutes: 120,
  bedtime: '23:00',
  wakeTime: '07:00',
  interventionsEnabled: {
    productivityPrompts: true,
    timeWarnings: true,
    intentionPrompts: false,
    frictionDelay: false,
    weeklyReports: true,
    bedtimeWarning: false,
  },
  productivityPromptChance: 0.3,
  whitelistedChannels: [],
  blockedChannels: [],
  backend: {
    enabled: false,
    url: 'http://localhost:8000',
    userId: null,
    lastSync: null,
  },
};

// ===== Storage Helpers =====

async function getStorage(): Promise<StorageData> {
  const data = await chrome.storage.local.get(null);
  return {
    settings: data.settings || DEFAULT_SETTINGS,
    videoSessions: data.videoSessions || [],
    browserSessions: data.browserSessions || [],
    dailyStats: data.dailyStats || {},
    pendingEvents: data.pendingEvents || [],
    lastSyncTime: data.lastSyncTime || 0,
  };
}

async function saveStorage(data: Partial<StorageData>): Promise<void> {
  await chrome.storage.local.set(data);
}

// ===== Date Helpers =====

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function getHour(): string {
  return new Date().getHours().toString();
}

function _isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

// ===== Stats Management =====

function getEmptyDailyStats(dateStr: string): DailyStats {
  const hourlySeconds: Record<string, number> = {};
  for (let i = 0; i < 24; i++) {
    hourlySeconds[i.toString()] = 0;
  }
  
  return {
    date: dateStr,
    totalSeconds: 0,
    activeSeconds: 0,
    backgroundSeconds: 0,
    sessionCount: 0,
    avgSessionDurationSeconds: 0,
    firstCheckTime: undefined,
    videoCount: 0,
    videosCompleted: 0,
    videosAbandoned: 0,
    shortsCount: 0,
    uniqueChannels: 0,
    searchCount: 0,
    recommendationClicks: 0,
    autoplayCount: 0,
    autoplayCancelled: 0,
    totalScrollPixels: 0,
    avgScrollVelocity: 0,
    thumbnailsHovered: 0,
    thumbnailsClicked: 0,
    pageReloads: 0,
    backButtonPresses: 0,
    tabSwitches: 0,
    productiveVideos: 0,
    unproductiveVideos: 0,
    neutralVideos: 0,
    promptsShown: 0,
    promptsAnswered: 0,
    interventionsShown: 0,
    interventionsEffective: 0,
    hourlySeconds,
    topChannels: [],
    preSleepMinutes: 0,
    bingeSessions: 0,
  };
}

async function updateDailyStats(browserSession: BrowserSession, videoSessions: VideoSession[]): Promise<void> {
  const storage = await getStorage();
  const today = getTodayKey();
  
  if (!storage.dailyStats[today]) {
    storage.dailyStats[today] = getEmptyDailyStats(today);
  }
  
  const stats = storage.dailyStats[today];
  
  // Update from browser session
  stats.totalSeconds += browserSession.totalDurationSeconds;
  stats.activeSeconds += browserSession.activeDurationSeconds;
  stats.backgroundSeconds += browserSession.backgroundSeconds;
  stats.sessionCount++;
  
  if (stats.sessionCount > 0) {
    stats.avgSessionDurationSeconds = Math.floor(stats.totalSeconds / stats.sessionCount);
  }
  
  // First check time
  if (!stats.firstCheckTime) {
    const now = new Date();
    stats.firstCheckTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // Behavioral metrics
  stats.searchCount += browserSession.searchCount;
  stats.recommendationClicks += browserSession.recommendationClicks;
  stats.autoplayCount += browserSession.autoplayCount;
  stats.autoplayCancelled += browserSession.autoplayCancelled;
  stats.totalScrollPixels += browserSession.totalScrollPixels;
  stats.thumbnailsHovered += browserSession.thumbnailsHovered;
  stats.thumbnailsClicked += browserSession.thumbnailsClicked;
  stats.pageReloads += browserSession.pageReloads;
  stats.backButtonPresses += browserSession.backButtonPresses;
  
  // Productivity
  stats.productiveVideos += browserSession.productiveVideos;
  stats.unproductiveVideos += browserSession.unproductiveVideos;
  stats.neutralVideos += browserSession.neutralVideos;
  
  // Update hourly distribution
  const hour = getHour();
  stats.hourlySeconds[hour] = (stats.hourlySeconds[hour] || 0) + browserSession.totalDurationSeconds;
  
  // Binge detection (session > 1 hour)
  if (browserSession.totalDurationSeconds > 3600) {
    stats.bingeSessions++;
  }
  
  // Process video sessions
  const channelMinutes: Record<string, { minutes: number; count: number }> = {};
  
  for (const session of videoSessions) {
    stats.videoCount++;
    
    if (session.isShort) {
      stats.shortsCount++;
    }
    
    if (session.watchedPercent >= 90) {
      stats.videosCompleted++;
    } else if (session.watchedPercent < 30) {
      stats.videosAbandoned++;
    }
    
    // Track channels
    if (session.channel) {
      if (!channelMinutes[session.channel]) {
        channelMinutes[session.channel] = { minutes: 0, count: 0 };
      }
      channelMinutes[session.channel].minutes += Math.floor(session.watchedSeconds / 60);
      channelMinutes[session.channel].count++;
    }
    
    // Tab switches
    stats.tabSwitches += session.tabSwitchCount;
  }
  
  // Update unique channels and top channels
  const channels = Object.entries(channelMinutes)
    .map(([channel, data]) => ({
      channel,
      minutes: data.minutes,
      videoCount: data.count,
    }))
    .sort((a, b) => b.minutes - a.minutes);
  
  // Merge with existing top channels
  const existingChannels = new Map(
    (stats.topChannels || []).map((c: ChannelStat) => [c.channel, c])
  );
  
  for (const ch of channels) {
    if (existingChannels.has(ch.channel)) {
      const existing = existingChannels.get(ch.channel)!;
      existing.minutes += ch.minutes;
      existing.videoCount += ch.videoCount;
    } else {
      existingChannels.set(ch.channel, ch);
    }
  }
  
  stats.topChannels = Array.from(existingChannels.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);
  
  stats.uniqueChannels = existingChannels.size;
  
  // Pre-sleep detection
  const settings = storage.settings;
  const [bedHour] = (settings.bedtime || '23:00').split(':').map(Number);
  const currentHour = new Date().getHours();
  if (currentHour >= bedHour - 2 || currentHour < 2) {
    stats.preSleepMinutes += Math.floor(browserSession.totalDurationSeconds / 60);
  }
  
  await saveStorage({ dailyStats: storage.dailyStats });
}

// ===== Backend Sync =====

async function syncToBackend(): Promise<boolean> {
  const storage = await getStorage();
  const settings = storage.settings;
  
  if (!settings.backend.enabled || !settings.backend.url) {
    return false;
  }
  
  // Get user ID
  let userId = settings.backend.userId;
  if (!userId) {
    userId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    settings.backend.userId = userId;
    await saveStorage({ settings });
  }
  
  try {
    // Sync sessions and stats
    const syncResponse = await fetch(`${settings.backend.url}/sync/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        sessions: storage.videoSessions.slice(-100), // Last 100 sessions
        browserSessions: storage.browserSessions.slice(-50), // Last 50 browser sessions
        dailyStats: storage.dailyStats,
      }),
    });
    
    if (!syncResponse.ok) {
      console.error('Sync failed:', await syncResponse.text());
      return false;
    }
    
    // Sync events if we have them
    if (storage.pendingEvents.length > 0) {
      const eventsResponse = await fetch(`${settings.backend.url}/sync/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({
          sessionId: storage.browserSessions[storage.browserSessions.length - 1]?.id || 'unknown',
          events: storage.pendingEvents,
          moodReports: [],
        }),
      });
      
      if (eventsResponse.ok) {
        // Clear synced events
        await saveStorage({ pendingEvents: [] });
      }
    }
    
    // Update last sync time
    settings.backend.lastSync = Date.now();
    await saveStorage({ settings, lastSyncTime: Date.now() });
    
    return true;
  } catch (error) {
    console.error('Sync error:', error);
    return false;
  }
}

// ===== Message Handlers =====

async function handlePageLoad(data: any): Promise<void> {
  // Initialize a new browser session if needed
  // The content script manages the session, we just track it here
  console.log('Page load:', data.pageType, data.url);
}

async function handlePageUnload(data: { session: BrowserSession; events: any[] }): Promise<void> {
  const storage = await getStorage();
  
  // Save browser session
  storage.browserSessions.push(data.session);
  
  // Keep only last 100 browser sessions
  if (storage.browserSessions.length > 100) {
    storage.browserSessions = storage.browserSessions.slice(-100);
  }
  
  // Save events
  storage.pendingEvents.push(...data.events);
  
  // Keep only last 1000 events
  if (storage.pendingEvents.length > 1000) {
    storage.pendingEvents = storage.pendingEvents.slice(-1000);
  }
  
  await saveStorage({
    browserSessions: storage.browserSessions,
    pendingEvents: storage.pendingEvents,
  });
  
  // Update daily stats
  const sessionsForStats = storage.videoSessions.filter(
    (s) => s.timestamp > data.session.startedAt && s.timestamp < (data.session.endedAt || Date.now())
  );
  await updateDailyStats(data.session, sessionsForStats);
  
  // Try to sync
  const settings = storage.settings;
  if (settings.backend.enabled) {
    const lastSync = settings.backend.lastSync || 0;
    const timeSinceSync = Date.now() - lastSync;
    // Sync every 5 minutes
    if (timeSinceSync > 5 * 60 * 1000) {
      syncToBackend();
    }
  }
}

async function handleVideoWatched(session: VideoSession): Promise<void> {
  const storage = await getStorage();
  
  storage.videoSessions.push(session);
  
  // Keep only last 500 video sessions
  if (storage.videoSessions.length > 500) {
    storage.videoSessions = storage.videoSessions.slice(-500);
  }
  
  await saveStorage({ videoSessions: storage.videoSessions });
}

async function handleRateVideo(data: { sessionId: string; rating: -1 | 0 | 1 }): Promise<void> {
  const storage = await getStorage();
  
  const session = storage.videoSessions.find((s) => s.id === data.sessionId);
  if (session) {
    session.productivityRating = data.rating;
    session.ratedAt = Date.now();
    await saveStorage({ videoSessions: storage.videoSessions });
  }
  
  // Update daily stats
  const today = getTodayKey();
  if (storage.dailyStats[today]) {
    storage.dailyStats[today].promptsAnswered++;
    if (data.rating === 1) storage.dailyStats[today].productiveVideos++;
    else if (data.rating === -1) storage.dailyStats[today].unproductiveVideos++;
    else storage.dailyStats[today].neutralVideos++;
    await saveStorage({ dailyStats: storage.dailyStats });
  }
}

async function handleGetStats(): Promise<{
  today: DailyStats | null;
  currentSession: any | null;
}> {
  const storage = await getStorage();
  const today = getTodayKey();
  
  return {
    today: storage.dailyStats[today] || null,
    currentSession: null, // Content script manages this
  };
}

async function handleGetSettings(): Promise<Settings> {
  const storage = await getStorage();
  return storage.settings;
}

async function handleUpdateSettings(newSettings: Partial<Settings>): Promise<Settings> {
  const storage = await getStorage();
  storage.settings = { ...storage.settings, ...newSettings };
  await saveStorage({ settings: storage.settings });
  return storage.settings;
}

async function handleGetWeeklySummary(): Promise<any> {
  const storage = await getStorage();
  const stats = storage.dailyStats;
  
  // Get last 7 days
  const days: DailyStats[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    if (stats[key]) {
      days.push(stats[key]);
    }
  }
  
  // Calculate totals
  const thisWeek = days.reduce(
    (acc, day) => ({
      totalSeconds: acc.totalSeconds + day.totalSeconds,
      totalMinutes: acc.totalMinutes + Math.floor(day.totalSeconds / 60),
      videoCount: acc.videoCount + day.videoCount,
      shortsCount: acc.shortsCount + day.shortsCount,
      productiveVideos: acc.productiveVideos + day.productiveVideos,
      unproductiveVideos: acc.unproductiveVideos + day.unproductiveVideos,
      sessions: acc.sessions + day.sessionCount,
      avgSessionMinutes: 0,
      recommendationRatio: 0,
    }),
    {
      totalSeconds: 0,
      totalMinutes: 0,
      videoCount: 0,
      shortsCount: 0,
      productiveVideos: 0,
      unproductiveVideos: 0,
      sessions: 0,
      avgSessionMinutes: 0,
      recommendationRatio: 0,
    }
  );
  
  if (thisWeek.sessions > 0) {
    thisWeek.avgSessionMinutes = Math.floor(thisWeek.totalMinutes / thisWeek.sessions);
  }
  
  // Aggregate top channels
  const channelMap = new Map<string, ChannelStat>();
  for (const day of days) {
    for (const ch of day.topChannels || []) {
      if (channelMap.has(ch.channel)) {
        const existing = channelMap.get(ch.channel)!;
        existing.minutes += ch.minutes;
        existing.videoCount += ch.videoCount;
      } else {
        channelMap.set(ch.channel, { ...ch });
      }
    }
  }
  
  const topChannels = Array.from(channelMap.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);
  
  // Peak hours
  const hourlyTotals: Record<string, number> = {};
  for (const day of days) {
    for (const [hour, seconds] of Object.entries(day.hourlySeconds || {})) {
      hourlyTotals[hour] = (hourlyTotals[hour] || 0) + seconds;
    }
  }
  
  const peakHours = Object.entries(hourlyTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));
  
  return {
    thisWeek,
    prevWeek: { ...thisWeek, totalSeconds: 0, totalMinutes: 0 }, // TODO: Calculate prev week
    changePercent: 0,
    topChannels,
    peakHours,
    generatedAt: Date.now(),
  };
}

async function handlePromptShown(): Promise<void> {
  const storage = await getStorage();
  const today = getTodayKey();
  
  if (!storage.dailyStats[today]) {
    storage.dailyStats[today] = getEmptyDailyStats(today);
  }
  
  storage.dailyStats[today].promptsShown++;
  await saveStorage({ dailyStats: storage.dailyStats });
}

async function handleInterventionResponse(data: {
  type: string;
  response: string;
  effective: boolean;
}): Promise<void> {
  const storage = await getStorage();
  const today = getTodayKey();
  
  if (!storage.dailyStats[today]) {
    storage.dailyStats[today] = getEmptyDailyStats(today);
  }
  
  storage.dailyStats[today].interventionsShown++;
  if (data.effective) {
    storage.dailyStats[today].interventionsEffective++;
  }
  
  await saveStorage({ dailyStats: storage.dailyStats });
}

// ===== Event Listeners =====

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  const { type, data } = message;
  
  (async () => {
    try {
      let response: any = { success: true };
      
      switch (type) {
        case 'PAGE_LOAD':
          await handlePageLoad(data);
          break;
          
        case 'PAGE_UNLOAD':
          await handlePageUnload(data as any);
          break;
          
        case 'VIDEO_WATCHED':
          await handleVideoWatched(data as VideoSession);
          break;
          
        case 'RATE_VIDEO':
          await handleRateVideo(data as any);
          break;
          
        case 'GET_STATS':
          response = await handleGetStats();
          break;
          
        case 'GET_SETTINGS':
          response = await handleGetSettings();
          break;
          
        case 'UPDATE_SETTINGS':
          response = await handleUpdateSettings(data as Partial<Settings>);
          break;
          
        case 'GET_WEEKLY_SUMMARY':
          response = await handleGetWeeklySummary();
          break;
          
        case 'PROMPT_SHOWN':
          await handlePromptShown();
          break;
          
        case 'INTERVENTION_RESPONSE':
          await handleInterventionResponse(data as any);
          break;
          
        case 'GET_SESSION':
          // Content script manages this, return null
          response = { session: null };
          break;
          
        default:
          console.log('Unknown message type:', type);
      }
      
      sendResponse(response);
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ error: String(error) });
    }
  })();
  
  return true; // Keep channel open for async response
});

// ===== Alarms for periodic sync =====

chrome.alarms.create('syncToBackend', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncToBackend') {
    const storage = await getStorage();
    if (storage.settings.backend.enabled) {
      await syncToBackend();
    }
  }
});

// ===== Install/Update =====

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const settings = { ...DEFAULT_SETTINGS, installDate: Date.now() };
    await saveStorage({
      settings,
      videoSessions: [],
      browserSessions: [],
      dailyStats: {},
      pendingEvents: [],
      lastSyncTime: 0,
    });
    
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});

console.log('YouTube Detox background service worker initialized');
