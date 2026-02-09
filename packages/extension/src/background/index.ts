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
  MoodReport,
  ChannelStat,
} from '@yt-detox/shared';

// ===== State =====

interface EventQueues {
  scroll: ScrollEvent[];
  thumbnail: ThumbnailEvent[];
  page: PageEvent[];
  video_watch: VideoWatchEvent[];
  recommendation: RecommendationEvent[];
  intervention: InterventionEvent[];
  mood: MoodReport[];
}

interface SyncState {
  lastSync: Record<string, number>;
  syncInProgress: boolean;
  retryCount: number;
  offlineQueue: EventQueues;
}

interface StorageData {
  settings: Settings;
  videoSessions: VideoSession[];
  browserSessions: BrowserSession[];
  dailyStats: Record<string, DailyStats>;
  pendingEvents: EventQueues;
  syncState: SyncState;
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

const DEFAULT_SYNC_STATE: SyncState = {
  lastSync: {
    scroll: 0,
    thumbnail: 0,
    page: 0,
    video_watch: 0,
    recommendation: 0,
    intervention: 0,
    mood: 0,
    sessions: 0,
  },
  syncInProgress: false,
  retryCount: 0,
  offlineQueue: {
    scroll: [],
    thumbnail: [],
    page: [],
    video_watch: [],
    recommendation: [],
    intervention: [],
    mood: [],
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
    pendingEvents: data.pendingEvents || {
      scroll: [],
      thumbnail: [],
      page: [],
      video_watch: [],
      recommendation: [],
      intervention: [],
      mood: [],
    },
    syncState: data.syncState || { ...DEFAULT_SYNC_STATE },
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

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

// Used for weekend goal calculation (future feature)
void isWeekend;

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

async function updateDailyStats(browserSession: BrowserSession, videoSessions: VideoSession[], temporal?: any): Promise<void> {
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
  
  // First check time from temporal tracking
  if (temporal?.firstCheckTime && !stats.firstCheckTime) {
    stats.firstCheckTime = temporal.firstCheckTime;
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
  
  // Update hourly distribution from temporal data
  if (temporal?.hourlySeconds) {
    for (const [hour, seconds] of Object.entries(temporal.hourlySeconds)) {
      stats.hourlySeconds[hour] = (stats.hourlySeconds[hour] || 0) + (seconds as number);
    }
  } else {
    // Fallback: use current hour
    const hour = getHour();
    stats.hourlySeconds[hour] = (stats.hourlySeconds[hour] || 0) + browserSession.totalDurationSeconds;
  }
  
  // Binge detection (session > 1 hour)
  if (browserSession.totalDurationSeconds > 3600 || temporal?.bingeModeActive) {
    stats.bingeSessions++;
  }
  
  // Pre-sleep tracking
  if (temporal?.preSleepActive) {
    stats.preSleepMinutes += Math.floor(browserSession.totalDurationSeconds / 60);
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
  
  await saveStorage({ dailyStats: storage.dailyStats });
}

// ===== Backend Sync =====

const SYNC_ENDPOINTS: Record<string, string> = {
  scroll: '/scroll/events',
  thumbnail: '/thumbnails/events',
  page: '/pages/events',
  video_watch: '/video-events/events',
  recommendation: '/recommendations/events',
  intervention: '/interventions/events',
  mood: '/mood/reports',
};

async function syncEventBatch(
  eventType: string,
  events: any[],
  baseUrl: string,
  userId: string
): Promise<boolean> {
  if (events.length === 0) return true;
  
  const endpoint = SYNC_ENDPOINTS[eventType];
  if (!endpoint) {
    console.error(`Unknown event type: ${eventType}`);
    return false;
  }
  
  try {
    const body = eventType === 'mood' 
      ? { reports: events }
      : { events };
    
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      console.error(`Sync ${eventType} failed:`, await response.text());
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Sync ${eventType} error:`, error);
    return false;
  }
}

async function syncToBackend(): Promise<boolean> {
  const storage = await getStorage();
  const settings = storage.settings;
  
  if (!settings.backend.enabled || !settings.backend.url) {
    return false;
  }
  
  if (storage.syncState.syncInProgress) {
    return false;
  }
  
  storage.syncState.syncInProgress = true;
  await saveStorage({ syncState: storage.syncState });
  
  // Get user ID
  let userId = settings.backend.userId;
  if (!userId) {
    userId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    settings.backend.userId = userId;
    await saveStorage({ settings });
  }
  
  const baseUrl = settings.backend.url;
  let overallSuccess = true;
  
  try {
    // Sync sessions first
    if (storage.videoSessions.length > 0 || storage.browserSessions.length > 0) {
      const syncResponse = await fetch(`${baseUrl}/sync/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({
          sessions: storage.videoSessions.slice(-100),
          browserSessions: storage.browserSessions.slice(-50),
          dailyStats: storage.dailyStats,
        }),
      });
      
      if (!syncResponse.ok) {
        console.error('Session sync failed:', await syncResponse.text());
        overallSuccess = false;
      } else {
        storage.syncState.lastSync.sessions = Date.now();
      }
    }
    
    // Sync each event type individually
    const eventTypes = ['scroll', 'thumbnail', 'page', 'video_watch', 'recommendation', 'intervention', 'mood'] as const;
    
    for (const eventType of eventTypes) {
      const events = storage.pendingEvents[eventType];
      if (events.length > 0) {
        const success = await syncEventBatch(eventType, events, baseUrl, userId);
        
        if (success) {
          storage.pendingEvents[eventType] = [];
          storage.syncState.lastSync[eventType] = Date.now();
        } else {
          // Move to offline queue for retry
          (storage.syncState.offlineQueue[eventType] as any[]).push(...events);
          storage.pendingEvents[eventType] = [];
          overallSuccess = false;
        }
      }
      
      // Try to sync offline queue if we have connectivity
      if (storage.syncState.offlineQueue[eventType].length > 0 && overallSuccess) {
        const offlineEvents = storage.syncState.offlineQueue[eventType];
        const success = await syncEventBatch(eventType, offlineEvents, baseUrl, userId);
        
        if (success) {
          storage.syncState.offlineQueue[eventType] = [];
        }
      }
    }
    
    // Update sync state
    if (overallSuccess) {
      settings.backend.lastSync = Date.now();
      storage.syncState.retryCount = 0;
    } else {
      storage.syncState.retryCount++;
    }
    
    await saveStorage({
      settings,
      pendingEvents: storage.pendingEvents,
      syncState: storage.syncState,
      lastSyncTime: Date.now(),
    });
    
    return overallSuccess;
  } catch (error) {
    console.error('Sync error:', error);
    storage.syncState.retryCount++;
    return false;
  } finally {
    storage.syncState.syncInProgress = false;
    await saveStorage({ syncState: storage.syncState });
  }
}

// ===== Event Queue Management =====

async function queueEvents(events: Record<string, any[]>): Promise<void> {
  const storage = await getStorage();
  
  for (const [eventType, eventList] of Object.entries(events)) {
    if (eventList && eventList.length > 0 && eventType in storage.pendingEvents) {
      (storage.pendingEvents as any)[eventType].push(...eventList);
    }
  }
  
  // Keep queues bounded
  const maxQueueSize = 500;
  for (const eventType of Object.keys(storage.pendingEvents)) {
    const queue = (storage.pendingEvents as any)[eventType];
    if (queue.length > maxQueueSize) {
      (storage.pendingEvents as any)[eventType] = queue.slice(-maxQueueSize);
    }
  }
  
  await saveStorage({ pendingEvents: storage.pendingEvents });
}

// ===== Message Handlers =====

async function handlePageLoad(data: any): Promise<void> {
  console.log('Page load:', data.pageType, data.url);
  
  // Update first check time if provided
  if (data.firstCheckTime) {
    const storage = await getStorage();
    const today = getTodayKey();
    
    if (!storage.dailyStats[today]) {
      storage.dailyStats[today] = getEmptyDailyStats(today);
    }
    
    if (!storage.dailyStats[today].firstCheckTime) {
      storage.dailyStats[today].firstCheckTime = data.firstCheckTime;
      await saveStorage({ dailyStats: storage.dailyStats });
    }
  }
}

async function handlePageUnload(data: { session: BrowserSession; events: Record<string, any[]>; temporal?: any }): Promise<void> {
  const storage = await getStorage();
  
  // Save browser session
  storage.browserSessions.push(data.session);
  
  // Keep only last 100 browser sessions
  if (storage.browserSessions.length > 100) {
    storage.browserSessions = storage.browserSessions.slice(-100);
  }
  
  await saveStorage({ browserSessions: storage.browserSessions });
  
  // Queue events by type
  await queueEvents(data.events);
  
  // Update daily stats
  const sessionsForStats = storage.videoSessions.filter(
    (s) => s.timestamp > data.session.startedAt && s.timestamp < (data.session.endedAt || Date.now())
  );
  await updateDailyStats(data.session, sessionsForStats, data.temporal);
  
  // Try to sync
  const settings = storage.settings;
  if (settings.backend.enabled) {
    const lastSync = settings.backend.lastSync || 0;
    const timeSinceSync = Date.now() - lastSync;
    // Sync every 5 minutes or if we have many events
    const totalPendingEvents = Object.values(storage.pendingEvents).reduce((sum, arr) => sum + arr.length, 0);
    if (timeSinceSync > 5 * 60 * 1000 || totalPendingEvents > 100) {
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
    currentSession: null,
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
    prevWeek: { ...thisWeek, totalSeconds: 0, totalMinutes: 0 },
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

async function handleSyncNow(): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await syncToBackend();
    return { success: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleGetSyncStatus(): Promise<{
  lastSync: Record<string, number>;
  pendingCounts: Record<string, number>;
  offlineQueueCounts: Record<string, number>;
  syncInProgress: boolean;
}> {
  const storage = await getStorage();
  
  const pendingCounts: Record<string, number> = {};
  const offlineQueueCounts: Record<string, number> = {};
  
  for (const [key, value] of Object.entries(storage.pendingEvents)) {
    pendingCounts[key] = value.length;
  }
  
  for (const [key, value] of Object.entries(storage.syncState.offlineQueue)) {
    offlineQueueCounts[key] = value.length;
  }
  
  return {
    lastSync: storage.syncState.lastSync,
    pendingCounts,
    offlineQueueCounts,
    syncInProgress: storage.syncState.syncInProgress,
  };
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
          response = { session: null };
          break;
          
        case 'SYNC_NOW' as any:
          response = await handleSyncNow();
          break;
          
        case 'GET_SYNC_STATUS' as any:
          response = await handleGetSyncStatus();
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
  
  return true;
});

// ===== Alarms for periodic sync =====

chrome.alarms.create('syncToBackend', { periodInMinutes: 5 });
chrome.alarms.create('retryOfflineSync', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncToBackend') {
    const storage = await getStorage();
    if (storage.settings.backend.enabled) {
      await syncToBackend();
    }
  } else if (alarm.name === 'retryOfflineSync') {
    const storage = await getStorage();
    if (storage.settings.backend.enabled) {
      // Check if we have offline events to retry
      const hasOfflineEvents = Object.values(storage.syncState.offlineQueue).some(q => q.length > 0);
      if (hasOfflineEvents) {
        await syncToBackend();
      }
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
      pendingEvents: {
        scroll: [],
        thumbnail: [],
        page: [],
        video_watch: [],
        recommendation: [],
        intervention: [],
        mood: [],
      },
      syncState: { ...DEFAULT_SYNC_STATE },
      lastSyncTime: 0,
    });
    
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    // Migrate storage if needed
    const storage = await getStorage();
    
    // Ensure new fields exist
    if (!storage.pendingEvents.intervention) {
      storage.pendingEvents.intervention = [];
    }
    if (!storage.pendingEvents.mood) {
      storage.pendingEvents.mood = [];
    }
    if (!storage.syncState.offlineQueue) {
      storage.syncState.offlineQueue = { ...DEFAULT_SYNC_STATE.offlineQueue };
    }
    
    await saveStorage({
      pendingEvents: storage.pendingEvents,
      syncState: storage.syncState,
    });
  }
});

console.log('YouTube Detox background service worker initialized (v0.3.0)');
