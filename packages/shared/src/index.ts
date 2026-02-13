// ===== Video Session Types =====

export interface VideoSession {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  channelId?: string;
  durationSeconds: number;
  watchedSeconds: number;
  watchedPercent: number;
  source: VideoSource;
  sourcePosition?: number;
  isShort: boolean;
  playbackSpeed: number;
  averageSpeed?: number;
  category?: string;
  productivityRating: ProductivityRating | null;
  timestamp: number;
  startedAt: number;
  endedAt?: number;
  ratedAt: number | null;
  // Engagement metrics
  seekCount: number;
  pauseCount: number;
  tabSwitchCount: number;
  // Outcome
  ledToAnotherVideo?: boolean;
  nextVideoSource?: VideoSource;
  // User input
  intention?: string;
  matchedIntention?: boolean;
}

export type VideoSource =
  | 'search'
  | 'recommendation'
  | 'subscription'
  | 'autoplay'
  | 'direct'
  | 'shorts'
  | 'homepage'
  | 'notification'
  | 'history'
  | 'end_screen';

export type ProductivityRating = -1 | 0 | 1;

// ===== Browser Session Types =====

export interface BrowserSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  tabId: number | null;
  // Entry
  entryPageType: PageType;
  entryUrl: string;
  entrySource: EntrySource;
  triggerType?: TriggerType;
  // Totals
  totalDurationSeconds: number;
  playDurationSeconds: number;
  activeDurationSeconds: number;
  backgroundSeconds: number;
  // Counts
  pagesVisited: number;
  videosWatched: number;
  videosStartedNotFinished: number;
  shortsCount: number;
  // Behavioral
  totalScrollPixels: number;
  thumbnailsHovered: number;
  thumbnailsClicked: number;
  pageReloads: number;
  backButtonPresses: number;
  recommendationClicks: number;
  autoplayCount: number;
  autoplayCancelled: number;
  searchCount: number;
  // Time distribution
  timeOnHomeSeconds: number;
  timeOnWatchSeconds: number;
  timeOnSearchSeconds: number;
  timeOnShortsSeconds: number;
  // Productivity
  productiveVideos: number;
  unproductiveVideos: number;
  neutralVideos: number;
  // Exit
  exitType?: ExitType;
  // Searches
  searchQueries: string[];
  // Feed / decision tracking
  feedLoadsCount: number;
  decisionTimeMs?: number;
}

export type EntrySource = 'direct' | 'bookmark' | 'notification' | 'link' | 'new_tab' | 'external';
export type TriggerType = 'habit' | 'notification' | 'task' | 'boredom' | 'unknown';
export type ExitType = 'closed_tab' | 'navigated_away' | 'idle_timeout' | 'intervention' | 'user_choice';

// ===== Daily Stats =====

export interface DailyStats {
  date: string;
  // Time
  totalSeconds: number;
  activeSeconds: number;
  backgroundSeconds: number;
  // Sessions
  sessionCount: number;
  avgSessionDurationSeconds: number;
  firstCheckTime?: string; // HH:MM
  // Videos
  videoCount: number;
  videosCompleted: number; // >90%
  videosAbandoned: number; // <30%
  shortsCount: number;
  uniqueChannels: number;
  // Behavioral
  searchCount: number;
  recommendationClicks: number;
  autoplayCount: number;
  autoplayCancelled: number;
  totalScrollPixels: number;
  avgScrollVelocity: number;
  thumbnailsHovered: number;
  thumbnailsClicked: number;
  pageReloads: number;
  backButtonPresses: number;
  tabSwitches: number;
  // Productivity
  productiveVideos: number;
  unproductiveVideos: number;
  neutralVideos: number;
  promptsShown: number;
  promptsAnswered: number;
  // Interventions
  interventionsShown: number;
  interventionsEffective: number;
  // Temporal
  hourlySeconds: Record<string, number>; // {"0": 120, "1": 0, ...}
  topChannels: ChannelStat[];
  // Pre-sleep (configurable bedtime)
  preSleepMinutes: number; // usage within 2h of bedtime
  // Binge detection
  bingeSessions: number; // sessions > 1 hour
}

// ===== Granular Events =====

export interface ScrollEvent {
  type: 'scroll';
  sessionId: string;
  pageType: PageType;
  timestamp: number;
  scrollY: number;
  scrollDepthPercent: number;
  viewportHeight: number;
  pageHeight: number;
  scrollVelocity: number;
  scrollDirection: 'up' | 'down';
  visibleVideoCount: number;
}

export interface ThumbnailEvent {
  type: 'thumbnail';
  sessionId: string;
  videoId: string;
  videoTitle: string;
  channelName: string;
  pageType: PageType;
  positionIndex: number;
  timestamp: number;
  hoverDurationMs: number;
  previewPlayed: boolean;
  previewWatchMs: number;
  clicked: boolean;
  // Impression tracking
  impression?: boolean;
  timeVisibleMs?: number;
  // Clickbait indicators
  titleCapsPercent: number;
  titleLength: number;
}

export interface PageEvent {
  type: 'page';
  sessionId: string;
  eventType: PageEventType;
  pageType: PageType;
  pageUrl: string;
  timestamp: number;
  fromPageType?: PageType;
  navigationMethod?: NavigationMethod;
  searchQuery?: string;
  searchResultsCount?: number;
  timeOnPageMs?: number;
  feedItemCount?: number;
  commentData?: {
    timeVisibleMs?: number;
    commentCount?: number;
    sortOrder?: string;
  };
}

export type PageEventType =
  | 'page_load'
  | 'page_unload'
  | 'tab_visible'
  | 'tab_hidden'
  | 'tab_switch_away'
  | 'tab_switch_back'
  | 'page_reload'
  | 'back_button'
  | 'forward_button'
  | 'link_click'
  | 'feed_loaded'
  | 'feed_refresh'
  | 'comments_visible'
  | 'comments_hidden'
  | 'comments_sort_changed'
  | 'comments_expanded';

export type NavigationMethod = 'click' | 'back' | 'forward' | 'reload' | 'direct' | 'autoplay' | 'external';

export interface VideoWatchEvent {
  type: 'video_watch';
  sessionId: string;
  watchSessionId: string;
  videoId: string;
  eventType: VideoEventType;
  timestamp: number;
  videoTimeSeconds: number;
  // Seek data
  seekFromSeconds?: number;
  seekToSeconds?: number;
  seekDeltaSeconds?: number;
  // Speed change
  playbackSpeed?: number;
  // Abandonment
  watchPercentAtAbandon?: number;
}

export type VideoEventType = 'play' | 'pause' | 'seek' | 'speed_change' | 'ended' | 'abandoned' | 'buffer';

export interface RecommendationEvent {
  type: 'recommendation';
  sessionId: string;
  location: RecommendationLocation;
  positionIndex: number;
  videoId: string;
  videoTitle?: string;
  channelName?: string;
  action: RecommendationAction;
  hoverDurationMs?: number;
  timestamp: number;
  wasAutoplayNext: boolean;
  autoplayCountdownStarted: boolean;
  autoplayCancelled: boolean;
}

export type RecommendationLocation = 'sidebar' | 'end_screen' | 'home_feed' | 'search_results' | 'autoplay_queue';
export type RecommendationAction = 'ignored' | 'hovered' | 'clicked' | 'not_interested' | 'dont_recommend';

export interface InterventionEvent {
  type: 'intervention';
  sessionId: string;
  interventionType: InterventionType;
  triggeredAt: number;
  triggerReason: string;
  response?: InterventionResponse;
  responseAt?: number;
  responseTimeMs?: number;
  userLeftYoutube: boolean;
  minutesUntilReturn?: number;
}

export type InterventionType =
  | 'productivity_prompt'
  | 'time_warning'
  | 'intention_prompt'
  | 'friction_delay'
  | 'session_summary'
  | 'break_reminder'
  | 'daily_limit'
  | 'bedtime_warning';

export type InterventionResponse =
  | 'dismissed'
  | 'engaged'
  | 'productive'
  | 'unproductive'
  | 'neutral'
  | 'stopped_watching';

// ===== Self-Report (Optional) =====

export interface MoodReport {
  timestamp: number;
  sessionId: string;
  reportType: 'pre' | 'post';
  mood: number; // 1-5
  intention?: string; // "What brought you here?"
  satisfaction?: number; // 1-5 "Was this time well spent?"
}

// ===== Sync Payloads =====

export interface SyncSessionsRequest {
  userId: string;
  sessions: VideoSession[];
  browserSessions: BrowserSession[];
  dailyStats: Record<string, DailyStats>;
}

export interface SyncEventsRequest {
  userId: string;
  sessionId: string;
  events: (ScrollEvent | ThumbnailEvent | PageEvent | VideoWatchEvent | RecommendationEvent | InterventionEvent)[];
  moodReports?: MoodReport[];
}

export interface SyncSessionsResponse {
  success: boolean;
  syncedSessions: number;
  syncedBrowserSessions: number;
  lastSyncTime: number;
}

export interface SyncEventsResponse {
  success: boolean;
  syncedEvents: number;
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
  scrollPixels: number;
  recommendationClicks: number;
  autoplayCount: number;
}

export interface WeeklySummary {
  thisWeek: WeekStats;
  prevWeek: WeekStats;
  changePercent: number;
  topChannels: ChannelStat[];
  contentMix: ContentMix;
  peakHours: number[];
  generatedAt: number;
}

export interface WeekStats {
  totalSeconds: number;
  totalMinutes: number;
  videoCount: number;
  shortsCount: number;
  productiveVideos: number;
  unproductiveVideos: number;
  sessions: number;
  avgSessionMinutes: number;
  recommendationRatio: number; // % from recommendations
}

export interface ChannelStat {
  channel: string;
  minutes: number;
  videoCount: number;
}

export interface ContentMix {
  fromSearch: number; // percentage
  fromRecommendation: number;
  fromSubscription: number;
  fromAutoplay: number;
  fromDirect: number;
  shorts: number;
}

// ===== Settings =====

export interface Settings {
  trackingEnabled: boolean;
  privacyTier: PrivacyTier;
  phase: 'observation' | 'awareness' | 'intervention' | 'reduction';
  installDate: number;
  dailyGoalMinutes: number;
  weekendGoalMinutes: number;
  bedtime: string; // HH:MM format
  wakeTime: string; // HH:MM format
  interventionsEnabled: {
    productivityPrompts: boolean;
    timeWarnings: boolean;
    intentionPrompts: boolean;
    frictionDelay: boolean;
    weeklyReports: boolean;
    bedtimeWarning: boolean;
  };
  productivityPromptChance: number;
  whitelistedChannels: string[];
  blockedChannels: string[];
  backend: BackendSettings;
  devFeatures: DevFeatures;
}

export interface DevFeatures {
  driftEffects: boolean;
  frictionOverlay: boolean;
  musicDetection: boolean;
  nudges: boolean;
  syncDebug: boolean;
}

export type PrivacyTier = 'minimal' | 'standard' | 'full';

export interface BackendSettings {
  enabled: boolean;
  url: string;
  userId: string | null;
  lastSync: number | null;
}

// ===== Message Types (Extension Internal) =====

export type MessageType =
  // Page events
  | 'PAGE_LOAD'
  | 'PAGE_UNLOAD'
  | 'TAB_HIDDEN'
  | 'TAB_VISIBLE'
  | 'TAB_SWITCH'
  | 'VIDEO_WATCHED'
  | 'VIDEO_EVENT'
  | 'SEARCH'
  | 'RECOMMENDATION_CLICK'
  | 'RECOMMENDATION_SHOWN'
  | 'AUTOPLAY_PENDING'
  | 'AUTOPLAY_CANCELLED'
  | 'SCROLL_EVENT'
  | 'THUMBNAIL_EVENT'
  | 'PAGE_EVENT'
  | 'PAGE_RELOAD'
  | 'BACK_BUTTON'
  // Stats
  | 'GET_SESSION'
  | 'GET_STATS'
  | 'GET_WEEKLY_SUMMARY'
  | 'GET_BASELINE_STATS'
  // Settings
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  // Prompts & Interventions
  | 'RATE_VIDEO'
  | 'PROMPT_SHOWN'
  | 'INTERVENTION_RESPONSE'
  | 'INTERVENTION_SHOWN'
  | 'MOOD_REPORT'
  // Sync
  | 'SYNC_NOW'
  | 'GET_SYNC_STATUS'
  | 'GET_PENDING_COUNTS'
  | 'BATCH_EVENTS'
  // Auth
  | 'AUTH_SIGN_IN'
  | 'AUTH_SIGN_OUT'
  | 'AUTH_GET_STATE'
  // Phase
  | 'GET_PHASE_INFO'
  | 'SET_PHASE'
  // Drift
  | 'GET_DRIFT'
  | 'GET_DRIFT_EFFECTS'
  | 'GET_DRIFT_HISTORY'
  | 'DRIFT_UPDATED'
  // Challenge
  | 'GET_CHALLENGE_PROGRESS'
  | 'UPGRADE_TIER'
  | 'DOWNGRADE_TIER'
  | 'AWARD_XP'
  | 'SET_CHALLENGE_TIER'
  | 'SET_GOAL_MODE'
  // Tabs
  | 'GET_TAB_INFO'
  // Music detection
  | 'MUSIC_DETECTED'
  // Achievements
  | 'GET_ACHIEVEMENTS'
  | 'CHECK_ACHIEVEMENTS'
  | 'GET_STREAK'
  // Data restore
  | 'RESTORE_DATA'
  // UI navigation
  | 'OPEN_TAB';

// ===== Batch Sync Types =====

export interface EventQueues {
  scroll: ScrollEvent[];
  thumbnail: ThumbnailEvent[];
  page: PageEvent[];
  video_watch: VideoWatchEvent[];
  recommendation: RecommendationEvent[];
  intervention: InterventionEvent[];
  mood: MoodReport[];
}

export interface SyncState {
  lastSync: Record<string, number>;
  syncInProgress: boolean;
  retryCount: number;
  offlineQueue: EventQueues;
}

export interface SyncStatusResponse {
  lastSync: Record<string, number>;
  pendingCounts: Record<string, number>;
  offlineQueueCounts: Record<string, number>;
  syncInProgress: boolean;
}

// ===== Temporal Tracking Types =====

export interface TemporalData {
  firstCheckTime: string | null;
  hourlySeconds: Record<string, number>;
  sessionStartTime: number;
  lastActivityTime: number;
  bingeModeActive: boolean;
  preSleepActive: boolean;
  sessionDurationMs: number;
}

export interface Message<T = unknown> {
  type: MessageType;
  data?: T;
}

// ===== Video Info (from scraper) =====

export interface VideoInfo {
  videoId: string | null;
  title: string;
  channel: string;
  channelId?: string;
  durationSeconds: number;
  currentTime: number;
  playbackSpeed: number;
  isPaused: boolean;
  isShort: boolean;
  category?: string;
}

export type PageType = 'homepage' | 'watch' | 'shorts' | 'search' | 'subscriptions' | 'history' | 'channel' | 'other';

// ===== Category Inference =====

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  education: ['tutorial', 'learn', 'course', 'lecture', 'explained', 'how to', 'documentary', 'science'],
  entertainment: ['funny', 'comedy', 'prank', 'meme', 'react', 'vlog', 'challenge'],
  music: ['music', 'song', 'official video', 'lyrics', 'album', 'concert', 'cover'],
  gaming: ['gameplay', 'playthrough', 'gaming', 'stream', 'esports', 'minecraft', 'fortnite'],
  news: ['news', 'breaking', 'update', 'report', 'politics', 'election'],
  tech: ['review', 'unboxing', 'tech', 'iphone', 'android', 'computer', 'software'],
  fitness: ['workout', 'exercise', 'fitness', 'yoga', 'gym', 'training'],
  cooking: ['recipe', 'cooking', 'food', 'chef', 'kitchen', 'baking'],
};
