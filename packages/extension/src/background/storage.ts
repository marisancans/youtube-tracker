/**
 * Storage helpers and type definitions
 */

import type {
  VideoSession,
  BrowserSession,
  DailyStats,
  Settings,
  ScrollEvent,
  ThumbnailEvent,
  PageEvent,
  VideoWatchEvent,
  RecommendationEvent,
  InterventionEvent,
  MoodReport,
} from '@yt-detox/shared';

// ===== Event Queues =====

export interface EventQueues {
  scroll: ScrollEvent[];
  thumbnail: ThumbnailEvent[];
  page: PageEvent[];
  video_watch: VideoWatchEvent[];
  recommendation: RecommendationEvent[];
  intervention: InterventionEvent[];
  mood: MoodReport[];
}

// ===== Sync State =====

export interface SyncState {
  lastSyncTime: number;
  syncInProgress: boolean;
  retryCount: number;
}

// ===== Drift State =====

export interface DriftState {
  current: number; // 0.0 - 1.0
  history: Array<{ timestamp: number; value: number }>; // Hourly snapshots
  lastCalculated: number;
}

// ===== Auth State =====

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface AuthState {
  user: GoogleUser | null;
  token: string | null;
  expiresAt: number | null;
}

// ===== Productive URLs =====

export interface ProductiveUrl {
  id: string;
  url: string;
  title: string;
  addedAt: number;
}

// ===== Challenge Progress =====

export type GoalMode = 'music' | 'time_reduction' | 'strict' | 'cold_turkey';
export type ChallengeTier = 'casual' | 'focused' | 'disciplined' | 'monk' | 'ascetic';

export interface ChallengeProgress {
  currentTier: ChallengeTier;
  daysUnderGoal: number;
  lastUnderGoalDate: string | null;
  totalXp: number;
  tierHistory: Array<{ tier: ChallengeTier; date: string }>;
  eligibleForUpgrade: boolean;
}

// ===== Main Storage =====

export interface StorageData {
  settings: Settings;
  videoSessions: VideoSession[];
  browserSessions: BrowserSession[];
  dailyStats: Record<string, DailyStats>;
  pendingEvents: EventQueues;
  syncState: SyncState;
}

// ===== Defaults =====

export const DEFAULT_SETTINGS: Settings = {
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

export const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncTime: 0,
  syncInProgress: false,
  retryCount: 0,
};

export const EMPTY_EVENT_QUEUES: EventQueues = {
  scroll: [],
  thumbnail: [],
  page: [],
  video_watch: [],
  recommendation: [],
  intervention: [],
  mood: [],
};

// ===== Storage Helpers =====

export async function getStorage(): Promise<StorageData> {
  const data = await chrome.storage.local.get(null);
  return {
    settings: data.settings || DEFAULT_SETTINGS,
    videoSessions: data.videoSessions || [],
    browserSessions: data.browserSessions || [],
    dailyStats: data.dailyStats || {},
    pendingEvents: data.pendingEvents || { ...EMPTY_EVENT_QUEUES },
    syncState: data.syncState || { ...DEFAULT_SYNC_STATE },
  };
}

export async function saveStorage(data: Partial<StorageData>): Promise<void> {
  await chrome.storage.local.set(data);
}

// ===== Date Helpers =====

export function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function getHour(): string {
  return new Date().getHours().toString();
}
