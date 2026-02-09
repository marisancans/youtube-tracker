// ===== Video Session Types =====

export interface VideoSession {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  watchedSeconds: number;
  watchedPercent: number;
  source: VideoSource;
  isShort: boolean;
  playbackSpeed: number;
  productivityRating: ProductivityRating | null;
  timestamp: number;
  ratedAt: number | null;
}

export type VideoSource = 
  | 'search' 
  | 'recommendation' 
  | 'subscription' 
  | 'autoplay' 
  | 'direct' 
  | 'shorts' 
  | 'homepage';

export type ProductivityRating = -1 | 0 | 1;

// ===== Browser Session Types =====

export interface BrowserSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  tabId: number | null;
  videos: string[];
  totalWatchedSeconds: number;
  activeSeconds: number;
  backgroundSeconds: number;
  durationSeconds: number;
  shortsCount: number;
  autoplayCount: number;
  recommendationClicks: number;
  searchCount: number;
}

// ===== Daily Stats =====

export interface DailyStats {
  date: string;
  totalSeconds: number;
  activeSeconds: number;
  backgroundSeconds: number;
  videoCount: number;
  shortsCount: number;
  searchCount: number;
  recommendationClicks: number;
  autoplayCount: number;
  sessions: number;
  productiveVideos: number;
  unproductiveVideos: number;
  neutralVideos: number;
  promptsShown: number;
  promptsAnswered: number;
}

// ===== Sync Payloads =====

export interface SyncSessionsRequest {
  userId: string;
  sessions: VideoSession[];
  browserSessions: BrowserSession[];
  dailyStats: Record<string, DailyStats>;
}

export interface SyncSessionsResponse {
  success: boolean;
  syncedSessions: number;
  syncedBrowserSessions: number;
  lastSyncTime: number;
}

// ===== Stats API =====

export interface StatsResponse {
  today: DailyStats | null;
  last7Days: DailyStats[];
  currentSession: CurrentSession | null;
  dailyGoalMinutes: number;
}

export interface CurrentSession {
  durationSeconds: number;
  activeSeconds: number;
  backgroundSeconds: number;
  videos: number;
  shortsCount: number;
}

export interface WeeklySummary {
  thisWeek: WeekStats;
  prevWeek: WeekStats;
  changePercent: number;
  topChannels: ChannelStat[];
  generatedAt: number;
}

export interface WeekStats {
  totalSeconds: number;
  totalMinutes: number;
  videoCount: number;
  productiveVideos: number;
  unproductiveVideos: number;
  sessions: number;
}

export interface ChannelStat {
  channel: string;
  minutes: number;
}

// ===== Settings =====

export interface Settings {
  trackingEnabled: boolean;
  phase: 'observation' | 'awareness' | 'intervention';
  installDate: number;
  dailyGoalMinutes: number;
  interventionsEnabled: {
    productivityPrompts: boolean;
    weeklyReports: boolean;
  };
  productivityPromptChance: number;
  whitelistedChannels: string[];
  blockedChannels: string[];
  backend: BackendSettings;
}

export interface BackendSettings {
  enabled: boolean;
  url: string;
  userId: string | null;
  lastSync: number | null;
}

// ===== Message Types (Extension Internal) =====

export type MessageType =
  | 'PAGE_LOAD'
  | 'PAGE_UNLOAD'
  | 'TAB_HIDDEN'
  | 'TAB_VISIBLE'
  | 'VIDEO_WATCHED'
  | 'SEARCH'
  | 'RECOMMENDATION_CLICK'
  | 'AUTOPLAY_PENDING'
  | 'GET_SESSION'
  | 'GET_STATS'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'RATE_VIDEO'
  | 'PROMPT_SHOWN'
  | 'GET_WEEKLY_SUMMARY';

export interface Message<T = unknown> {
  type: MessageType;
  data?: T;
}

// ===== Video Info (from scraper) =====

export interface VideoInfo {
  videoId: string | null;
  title: string;
  channel: string;
  durationSeconds: number;
  currentTime: number;
  playbackSpeed: number;
  isPaused: boolean;
  isShort: boolean;
}

export type PageType = 'homepage' | 'watch' | 'shorts' | 'search' | 'subscriptions' | 'other';
