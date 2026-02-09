/**
 * YouTube Detox - Background Service Worker (TypeScript)
 */

import type { 
  Settings, 
  VideoSession, 
  BrowserSession, 
  DailyStats,
  WeeklySummary,
  StatsResponse,
  CurrentSession
} from '@yt-detox/shared'

const STORAGE_KEYS = {
  SESSIONS: 'sessions',
  VIDEOS: 'videos',
  DAILY_STATS: 'dailyStats',
  SETTINGS: 'settings',
  WEEKLY_SUMMARIES: 'weeklySummaries',
} as const

const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  phase: 'observation',
  installDate: Date.now(),
  dailyGoalMinutes: 60,
  interventionsEnabled: {
    productivityPrompts: true,
    weeklyReports: true,
  },
  productivityPromptChance: 0.3,
  whitelistedChannels: [],
  blockedChannels: [],
  backend: {
    enabled: false,
    url: '',
    userId: null,
    lastSync: null,
  },
}

interface ActiveSession {
  id: string
  startedAt: number
  tabId: number | null
  videos: string[]
  totalWatchedSeconds: number
  activeSeconds: number
  backgroundSeconds: number
  shortsCount: number
  autoplayCount: number
  recommendationClicks: number
  searchCount: number
}

let currentSession: ActiveSession | null = null
let sessionTimeout: ReturnType<typeof setTimeout> | null = null
let activeTimerStart: number | null = null
let backgroundTimerStart: number | null = null

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0]
}

async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] }
}

async function updateDailyStats(date: string, updates: Partial<DailyStats>): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_STATS)
  const stats: Record<string, DailyStats> = result[STORAGE_KEYS.DAILY_STATS] || {}
  
  const today: DailyStats = stats[date] || {
    date,
    totalSeconds: 0,
    activeSeconds: 0,
    backgroundSeconds: 0,
    videoCount: 0,
    shortsCount: 0,
    searchCount: 0,
    recommendationClicks: 0,
    autoplayCount: 0,
    sessions: 0,
    productiveVideos: 0,
    unproductiveVideos: 0,
    neutralVideos: 0,
    promptsShown: 0,
    promptsAnswered: 0,
  }

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'number' && key in today) {
      (today as any)[key] = ((today as any)[key] || 0) + value
    }
  }

  stats[date] = today
  await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_STATS]: stats })
}

async function appendToArray<T>(key: string, item: T, maxItems = 5000): Promise<void> {
  const result = await chrome.storage.local.get(key)
  const arr: T[] = result[key] || []
  arr.push(item)
  if (arr.length > maxItems) arr.splice(0, arr.length - maxItems)
  await chrome.storage.local.set({ [key]: arr })
}

// ===== INSTALL =====

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[YT Detox] Installed:', details.reason)

  if (details.reason === 'install') {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, installDate: Date.now() },
    })
  } else if (details.reason === 'update') {
    const existing = await getSettings()
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: existing })
  }

  // Weekly summary alarm — Sunday 9pm
  const nextSunday = getNextSunday9pm()
  chrome.alarms.create('weeklySummary', {
    when: nextSunday,
    periodInMinutes: 7 * 24 * 60,
  })

  // Backend sync alarm — every 5 minutes
  chrome.alarms.create('backendSync', { periodInMinutes: 5 })
})

function getNextSunday9pm(): number {
  const now = new Date()
  const day = now.getDay()
  const daysUntilSunday = day === 0 ? 7 : 7 - day
  const next = new Date(now)
  next.setDate(now.getDate() + daysUntilSunday)
  next.setHours(21, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 7)
  return next.getTime()
}

// ===== ALARMS =====

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'weeklySummary') {
    await generateWeeklySummary()
  } else if (alarm.name === 'backendSync') {
    await attemptBackendSync()
  }
})

// ===== MESSAGE HANDLER =====

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[YT Detox BG]', message.type)

  switch (message.type) {
    case 'PAGE_LOAD':
      handlePageLoad(sender.tab)
      break

    case 'PAGE_UNLOAD':
    case 'TAB_HIDDEN':
      handleSessionPause()
      break

    case 'TAB_VISIBLE':
      handleSessionResume()
      break

    case 'VIDEO_WATCHED':
      handleVideoWatched(message.data)
      break

    case 'SEARCH':
      updateDailyStats(getTodayKey(), { searchCount: 1 })
      if (currentSession) currentSession.searchCount++
      break

    case 'RECOMMENDATION_CLICK':
      updateDailyStats(getTodayKey(), { recommendationClicks: 1 })
      if (currentSession) currentSession.recommendationClicks++
      break

    case 'AUTOPLAY_PENDING':
      updateDailyStats(getTodayKey(), { autoplayCount: 1 })
      if (currentSession) currentSession.autoplayCount++
      break

    case 'GET_SESSION':
      sendResponse(currentSession)
      return true

    case 'GET_STATS':
      getStatsResponse().then(sendResponse)
      return true

    case 'GET_SETTINGS':
      getSettings().then(sendResponse)
      return true

    case 'UPDATE_SETTINGS':
      handleUpdateSettings(message.data).then(sendResponse)
      return true

    case 'RATE_VIDEO':
      handleRateVideo(message.data).then(sendResponse)
      return true

    case 'PROMPT_SHOWN':
      updateDailyStats(getTodayKey(), { promptsShown: 1 })
      break

    case 'GET_WEEKLY_SUMMARY':
      calculateWeeklySummary().then(sendResponse)
      return true
  }

  return false
})

// ===== SESSION MANAGEMENT =====

async function handlePageLoad(tab?: chrome.tabs.Tab): Promise<void> {
  if (sessionTimeout) {
    clearTimeout(sessionTimeout)
    sessionTimeout = null
  }

  if (!currentSession) {
    currentSession = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      tabId: tab?.id ?? null,
      videos: [],
      totalWatchedSeconds: 0,
      activeSeconds: 0,
      backgroundSeconds: 0,
      shortsCount: 0,
      autoplayCount: 0,
      recommendationClicks: 0,
      searchCount: 0,
    }
    activeTimerStart = Date.now()
    backgroundTimerStart = null
    await updateDailyStats(getTodayKey(), { sessions: 1 })
    console.log('[YT Detox BG] Session started')
  }
}

function handleSessionPause(): void {
  if (currentSession) {
    if (activeTimerStart) {
      currentSession.activeSeconds += (Date.now() - activeTimerStart) / 1000
      activeTimerStart = null
    }
    backgroundTimerStart = Date.now()
  }
  if (!sessionTimeout) {
    sessionTimeout = setTimeout(() => endSession(), 30000)
  }
}

function handleSessionResume(): void {
  if (currentSession) {
    if (backgroundTimerStart) {
      currentSession.backgroundSeconds += (Date.now() - backgroundTimerStart) / 1000
      backgroundTimerStart = null
    }
    activeTimerStart = Date.now()
  }
  if (sessionTimeout) {
    clearTimeout(sessionTimeout)
    sessionTimeout = null
  }
}

async function endSession(): Promise<void> {
  if (!currentSession) return

  if (activeTimerStart) {
    currentSession.activeSeconds += (Date.now() - activeTimerStart) / 1000
    activeTimerStart = null
  }
  if (backgroundTimerStart) {
    currentSession.backgroundSeconds += (Date.now() - backgroundTimerStart) / 1000
    backgroundTimerStart = null
  }

  const session: BrowserSession = {
    id: currentSession.id,
    startedAt: currentSession.startedAt,
    endedAt: Date.now(),
    tabId: currentSession.tabId,
    videos: currentSession.videos,
    totalWatchedSeconds: currentSession.totalWatchedSeconds,
    activeSeconds: Math.round(currentSession.activeSeconds),
    backgroundSeconds: Math.round(currentSession.backgroundSeconds),
    durationSeconds: Math.round(currentSession.activeSeconds + currentSession.backgroundSeconds),
    shortsCount: currentSession.shortsCount,
    autoplayCount: currentSession.autoplayCount,
    recommendationClicks: currentSession.recommendationClicks,
    searchCount: currentSession.searchCount,
  }

  await appendToArray(STORAGE_KEYS.SESSIONS, session, 1000)
  await updateDailyStats(getTodayKey(), {
    totalSeconds: session.durationSeconds,
    activeSeconds: session.activeSeconds,
    backgroundSeconds: session.backgroundSeconds,
  })

  console.log('[YT Detox BG] Session ended:', session.activeSeconds, 's active,', session.backgroundSeconds, 's bg')
  currentSession = null
  sessionTimeout = null
}

// ===== VIDEO HANDLING =====

interface VideoWatchedData {
  videoId: string
  title: string
  channel: string
  durationSeconds: number
  watchedSeconds: number
  source: string
  isShort: boolean
  playbackSpeed: number
}

async function handleVideoWatched(data: VideoWatchedData): Promise<void> {
  const video: VideoSession = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    videoId: data.videoId,
    title: data.title,
    channel: data.channel,
    durationSeconds: data.durationSeconds,
    watchedSeconds: data.watchedSeconds,
    watchedPercent: data.durationSeconds > 0
      ? Math.round((data.watchedSeconds / data.durationSeconds) * 100)
      : 0,
    source: data.source as any,
    isShort: data.isShort,
    playbackSpeed: data.playbackSpeed,
    productivityRating: null,
    ratedAt: null,
  }

  if (currentSession) {
    currentSession.videos.push(video.id)
    currentSession.totalWatchedSeconds += data.watchedSeconds || 0
    if (data.isShort) currentSession.shortsCount++
  }

  await appendToArray(STORAGE_KEYS.VIDEOS, video, 5000)

  const statsUpdate: Partial<DailyStats> = { videoCount: 1 }
  if (data.isShort) statsUpdate.shortsCount = 1
  await updateDailyStats(getTodayKey(), statsUpdate)

  console.log('[YT Detox BG] Video:', data.title?.substring(0, 30))
}

// ===== PRODUCTIVITY RATING =====

async function handleRateVideo({ videoId, rating }: { videoId: string; rating: number }): Promise<{ success: boolean }> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.VIDEOS)
  const videos: VideoSession[] = result[STORAGE_KEYS.VIDEOS] || []

  for (let i = videos.length - 1; i >= 0; i--) {
    if (videos[i].videoId === videoId) {
      videos[i].productivityRating = rating as any
      videos[i].ratedAt = Date.now()
      break
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.VIDEOS]: videos })

  const statsUpdate: Partial<DailyStats> = { promptsAnswered: 1 }
  if (rating === 1) statsUpdate.productiveVideos = 1
  else if (rating === -1) statsUpdate.unproductiveVideos = 1
  else statsUpdate.neutralVideos = 1
  await updateDailyStats(getTodayKey(), statsUpdate)

  return { success: true }
}

// ===== SETTINGS =====

async function handleUpdateSettings(newSettings: Partial<Settings>): Promise<{ success: boolean }> {
  const current = await getSettings()
  const merged = { ...current, ...newSettings }
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged })
  return { success: true }
}

// ===== STATS =====

async function getStatsResponse(): Promise<StatsResponse> {
  const today = getTodayKey()
  const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_STATS)
  const dailyStats: Record<string, DailyStats> = result[STORAGE_KEYS.DAILY_STATS] || {}

  const last7Days: DailyStats[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const dayStats = dailyStats[key] || {}
    last7Days.push({ ...dayStats, date: key } as DailyStats)
  }

  const settings = await getSettings()

  const currentSessionData: CurrentSession | null = currentSession ? {
    durationSeconds: Math.round((Date.now() - currentSession.startedAt) / 1000),
    activeSeconds: Math.round(
      currentSession.activeSeconds + (activeTimerStart ? (Date.now() - activeTimerStart) / 1000 : 0)
    ),
    backgroundSeconds: Math.round(
      currentSession.backgroundSeconds + (backgroundTimerStart ? (Date.now() - backgroundTimerStart) / 1000 : 0)
    ),
    videos: currentSession.videos.length,
    shortsCount: currentSession.shortsCount,
  } : null

  return {
    today: dailyStats[today] || null,
    last7Days,
    currentSession: currentSessionData,
    dailyGoalMinutes: settings.dailyGoalMinutes,
  }
}

// ===== WEEKLY SUMMARY =====

async function calculateWeeklySummary(): Promise<WeeklySummary> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.DAILY_STATS, STORAGE_KEYS.VIDEOS])
  const dailyStats: Record<string, DailyStats> = result[STORAGE_KEYS.DAILY_STATS] || {}
  const videos: VideoSession[] = result[STORAGE_KEYS.VIDEOS] || []

  const thisWeek = { totalSeconds: 0, videoCount: 0, productiveVideos: 0, unproductiveVideos: 0, sessions: 0 }
  const prevWeek = { totalSeconds: 0, videoCount: 0, productiveVideos: 0, unproductiveVideos: 0, sessions: 0 }

  for (let i = 0; i < 14; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const key = date.toISOString().split('T')[0]
    const day = dailyStats[key]
    const target = i < 7 ? thisWeek : prevWeek
    if (day) {
      target.totalSeconds += day.totalSeconds || 0
      target.videoCount += day.videoCount || 0
      target.productiveVideos += day.productiveVideos || 0
      target.unproductiveVideos += day.unproductiveVideos || 0
      target.sessions += day.sessions || 0
    }
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const channelMap: Record<string, number> = {}
  videos.filter(v => v.timestamp >= weekAgo).forEach(v => {
    if (v.channel) {
      channelMap[v.channel] = (channelMap[v.channel] || 0) + (v.watchedSeconds || 0)
    }
  })
  const topChannels = Object.entries(channelMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([channel, seconds]) => ({ channel, minutes: Math.round(seconds / 60) }))

  const totalMinutes = Math.round(thisWeek.totalSeconds / 60)
  const prevMinutes = Math.round(prevWeek.totalSeconds / 60)
  const changePercent = prevMinutes > 0
    ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100)
    : 0

  return {
    thisWeek: { ...thisWeek, totalMinutes },
    prevWeek: { ...prevWeek, totalMinutes: prevMinutes },
    changePercent,
    topChannels,
    generatedAt: Date.now(),
  }
}

async function generateWeeklySummary(): Promise<void> {
  const settings = await getSettings()
  if (!settings.interventionsEnabled?.weeklyReports) return

  const summary = await calculateWeeklySummary()
  await appendToArray(STORAGE_KEYS.WEEKLY_SUMMARIES, summary, 52)

  const totalMin = summary.thisWeek.totalMinutes
  const change = summary.changePercent
  const changeText = change > 0 ? `${change}% more` : change < 0 ? `${Math.abs(change)}% less` : 'same'
  const topChannel = summary.topChannels[0]?.channel || 'N/A'

  chrome.notifications.create('weeklySummary', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'YouTube Detox - Weekly Summary',
    message: `This week: ${totalMin} min (${changeText} than last week). Top: ${topChannel}. Videos: ${summary.thisWeek.videoCount}`,
  })

  console.log('[YT Detox BG] Weekly summary:', totalMin, 'min')
}

// ===== BACKEND SYNC =====

async function attemptBackendSync(): Promise<void> {
  const settings = await getSettings()
  if (!settings.backend?.enabled || !settings.backend?.url || !settings.backend?.userId) return

  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.SESSIONS, STORAGE_KEYS.VIDEOS, STORAGE_KEYS.DAILY_STATS])
    const lastSync = settings.backend.lastSync || 0
    
    const unsyncedSessions = (data[STORAGE_KEYS.SESSIONS] || [])
      .filter((s: BrowserSession) => (s.endedAt || s.startedAt) > lastSync)
    const unsyncedVideos = (data[STORAGE_KEYS.VIDEOS] || [])
      .filter((v: VideoSession) => v.timestamp > lastSync)
    const dailyStats = data[STORAGE_KEYS.DAILY_STATS] || {}

    if (unsyncedSessions.length === 0 && unsyncedVideos.length === 0) return

    const response = await fetch(`${settings.backend.url}/sync/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': settings.backend.userId,
      },
      body: JSON.stringify({
        sessions: unsyncedVideos,
        browserSessions: unsyncedSessions,
        dailyStats,
      }),
    })

    if (response.ok) {
      settings.backend.lastSync = Date.now()
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings })
      console.log('[YT Detox BG] Synced:', unsyncedVideos.length, 'videos,', unsyncedSessions.length, 'sessions')
    }
  } catch (err) {
    console.error('[YT Detox BG] Sync failed:', (err as Error).message)
  }
}

// ===== TAB CLEANUP =====

chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentSession?.tabId === tabId) endSession()
})
