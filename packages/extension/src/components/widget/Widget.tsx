import { useState, useEffect, useCallback } from 'react';
import {
  getCurrentSession,
  getCurrentVideoSession,
  getCurrentVideoInfo,
  getTemporalData,
  rateVideo,
} from '../../content/tracker';
import { safeSendMessageWithCallback, safeSendMessage } from '../../lib/messaging';
import { showFrictionOverlay, isFrictionOverlayVisible } from '../../content/friction-overlay';
import {
  compassRoseSvg,
  shipsWheelSvg,
  ropeBorderSvg,
} from '../../components/nautical/nautical-svg-strings';
import PirateMap from '../map/PirateMap';
import SeaEffects from './SeaEffects';
import DriftRadar from './DriftRadar';
import DramaticShip from './DramaticShip';
import type { DriftSnapshot } from '../../background/storage';
import type { DriftStateV2 } from '@yt-detox/shared';

interface Nudge {
  id: string;
  type: 'time_warning' | 'break_reminder' | 'goal_reached' | 'bedtime' | 'tip';
  message: string;
  icon: string;
  color: string;
  dismissible: boolean;
  action?: { label: string; callback: () => void };
}

interface DriftData {
  drift: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  effects: {
    thumbnailBlur: number;
    thumbnailGrayscale: number;
    commentsReduction: number;
    sidebarReduction: number;
    autoplayDelay: number;
    showTextOnly: boolean;
  };
}

type ChallengeTier = 'casual' | 'focused' | 'disciplined' | 'monk' | 'ascetic';

interface ChallengeProgress {
  currentTier: ChallengeTier;
  daysUnderGoal: number;
  eligibleForUpgrade: boolean;
}

const TIER_CONFIG: Record<ChallengeTier, { icon: string; label: string; nextLabel?: string }> = {
  casual: { icon: '🌱', label: 'Casual', nextLabel: 'Focused' },
  focused: { icon: '🎯', label: 'Focused', nextLabel: 'Disciplined' },
  disciplined: { icon: '⚡', label: 'Disciplined', nextLabel: 'Monk' },
  monk: { icon: '🔥', label: 'Monk', nextLabel: 'Ascetic' },
  ascetic: { icon: '💎', label: 'Ascetic' },
};

const TIER_ORDER: ChallengeTier[] = ['casual', 'focused', 'disciplined', 'monk', 'ascetic'];

// Nautical rank mapping
const NAUTICAL_RANKS: Record<ChallengeTier, string> = {
  casual: 'Deckhand',
  focused: 'Helmsman',
  disciplined: 'First Mate',
  monk: 'Captain',
  ascetic: 'Admiral',
};

interface ProductiveUrl {
  id: string;
  url: string;
  title: string;
  addedAt: number;
}

interface WidgetState {
  collapsed: boolean;
  minimized: boolean;
  sessionDuration: number;
  videosWatched: number;
  todayMinutes: number;
  dailyGoal: number;
  showPrompt: boolean;
  videoTitle: string | null;
  lastRatedVideo: string | null;
  productiveCount: number;
  unproductiveCount: number;
  currentVideoSeconds: number;
  streak: number;
  hourlyData: number[];
  level: number;
  xp: number;
  achievements: string[];
  youtubeTabs: number;
  // Nudges
  activeNudge: Nudge | null;
  lastBreakReminder: number;
  dismissedNudges: Set<string>;
  phase: 'observation' | 'awareness' | 'intervention' | 'reduction';
  // Drift
  drift: DriftData;
  // Challenge
  challengeProgress: ChallengeProgress | null;
  showUpgradePrompt: boolean;
  // Productive alternatives
  productiveUrls: ProductiveUrl[];
  suggestedUrl: ProductiveUrl | null;
  dismissedSuggestion: boolean;
  // Background time
  todayBackgroundMinutes: number;
  sessionBackgroundSeconds: number;
  // Sync status
  lastSyncTime: number | null;
  showSyncStatus: boolean;
  syncEnabled: boolean;
  // Sync debug
  lastSyncResult: { success: boolean; syncedCounts?: Record<string, number>; error?: string; timestamp: number } | null;
  dbCounts: Record<string, number> | null;
  pendingCounts: Record<string, number> | null;
  syncDebugExpanded: boolean;
  // Drift history for mini-map
  driftHistory: DriftSnapshot[];
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// Get level from XP
function getLevelInfo(xp: number): { level: number; currentXp: number; nextLevelXp: number; progress: number } {
  const levels = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 15000, 30000];
  let level = 1;
  for (let i = 0; i < levels.length - 1; i++) {
    if (xp >= levels[i]) level = i + 1;
  }
  const currentLevelXp = levels[level - 1] || 0;
  const nextLevelXp = levels[level] || levels[levels.length - 1];
  const progress = ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  return { level, currentXp: xp - currentLevelXp, nextLevelXp: nextLevelXp - currentLevelXp, progress };
}

// Compute 24h hourly data by merging stored DailyStats + live temporal data
function compute24hData(
  storedHourly: Record<string, number> | undefined,
  liveHourly: Record<string, number>,
): number[] {
  const data: number[] = new Array(24).fill(0);
  if (storedHourly) {
    for (const [hour, seconds] of Object.entries(storedHourly)) {
      const h = parseInt(hour, 10);
      if (h >= 0 && h < 24) data[h] += seconds;
    }
  }
  for (const [hour, seconds] of Object.entries(liveHourly)) {
    const h = parseInt(hour, 10);
    if (h >= 0 && h < 24) data[h] += seconds;
  }
  return data.map((s) => Math.round(s / 60));
}


// Icons as SVG components (restyled for nautical theme)
const Icons = {
  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  Video: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m10 9 5 3-5 3V9z" />
    </svg>
  ),
  ThumbsUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  ),
  ThumbsDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  ),
  Minus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
    </svg>
  ),
  ChevronUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m18 15-6-6-6 6" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  Target: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  Flame: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  Zap: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Trophy: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  Star: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  TrendingUp: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  TrendingDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </svg>
  ),
  Award: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),
  Brain: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3 4 4.5 4.5 0 0 1-3-4" />
      <path d="M12 9v4" />
      <path d="M12 6v.01" />
    </svg>
  ),
  Layers: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
    </svg>
  ),
  Waves: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  ),
  AlertCircle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Coffee: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <line x1="6" y1="2" x2="6" y2="4" />
      <line x1="10" y1="2" x2="10" y2="4" />
      <line x1="14" y1="2" x2="14" y2="4" />
    </svg>
  ),
  Moon: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  ),
  X: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Lightbulb: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  ),
  ExternalLink: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  Sparkles: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  ),
  Cloud: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  ),
  CloudOff: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m2 2 20 20" />
      <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
      <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

// Keyframes for animations (injected via style element)
const animationStyles = `
  @keyframes yt-detox-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes yt-detox-wave {
    0% { transform: translateX(0); }
    50% { transform: translateX(3px); }
    100% { transform: translateX(0); }
  }
  @keyframes yt-detox-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-2px); }
    75% { transform: translateX(2px); }
  }
  @keyframes yt-detox-glow {
    0%, 100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.3); }
    50% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.5); }
  }
`;

export default function Widget(): JSX.Element {
  const [state, setState] = useState<WidgetState>({
    collapsed: false,
    minimized: false,
    sessionDuration: 0,
    videosWatched: 0,
    todayMinutes: 0,
    dailyGoal: 60,
    showPrompt: false,
    videoTitle: null,
    lastRatedVideo: null,
    productiveCount: 0,
    unproductiveCount: 0,
    currentVideoSeconds: 0,
    streak: 0,
    hourlyData: new Array(24).fill(0),
    level: 1,
    xp: 0,
    achievements: [],
    youtubeTabs: 1,
    activeNudge: null,
    lastBreakReminder: 0,
    dismissedNudges: new Set(),
    phase: 'observation',
    drift: {
      drift: 0,
      level: 'low',
      effects: {
        thumbnailBlur: 0,
        thumbnailGrayscale: 0,
        commentsReduction: 0,
        sidebarReduction: 0,
        autoplayDelay: 5,
        showTextOnly: false,
      },
    },
    challengeProgress: null,
    showUpgradePrompt: false,
    productiveUrls: [],
    suggestedUrl: null,
    dismissedSuggestion: false,
    todayBackgroundMinutes: 0,
    sessionBackgroundSeconds: 0,
    lastSyncTime: null,
    showSyncStatus: false,
    syncEnabled: false,
    lastSyncResult: null,
    dbCounts: null,
    pendingCounts: null,
    syncDebugExpanded: false,
    driftHistory: [],
  });

  const [driftV2, setDriftV2] = useState<DriftStateV2 | null>(null);

  // Inject animation styles once
  useEffect(() => {
    const styleId = 'yt-detox-widget-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = animationStyles;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    safeSendMessageWithCallback('GET_SETTINGS', undefined, (response: any) => {
      if (response && !response.error) {
        setState((p) => ({ ...p, dailyGoal: response.dailyGoalMinutes || 60 }));
      }
    });
    // Load streak from background (calculated properly)
    safeSendMessageWithCallback('GET_STREAK', undefined, (response: any) => {
      if (response?.streak !== undefined) {
        setState((p) => ({ ...p, streak: response.streak }));
      }
    });
    // Load xp, dailyStats, phase, productiveUrls, and sync status from storage
    if (!chrome.storage?.local) return;
    chrome.storage.local.get(
      ['xp', 'dailyStats', 'settings', 'productiveUrls', 'syncState', 'lastSyncResult'],
      (result) => {
        const today = new Date().toISOString().split('T')[0];
        const storedHourly = result.dailyStats?.[today]?.hourlySeconds;
        const liveHourly = getTemporalData().hourlySeconds;
        setState((p) => ({
          ...p,
          xp: result.xp || p.xp,
          hourlyData: compute24hData(storedHourly, liveHourly),
          phase: result.settings?.phase || p.phase,
          productiveUrls: result.productiveUrls || p.productiveUrls,
          lastSyncTime: result.syncState?.lastSyncTime || p.lastSyncTime,
          syncEnabled: result.settings?.backend?.enabled || false,
          lastSyncResult: result.lastSyncResult || p.lastSyncResult,
        }));
      },
    );
    // Load achievements
    safeSendMessageWithCallback('GET_ACHIEVEMENTS', undefined, (response: any) => {
      if (response?.unlocked) {
        setState((p) => ({
          ...p,
          achievements: response.unlocked.map((a: any) => `${a.icon} ${a.name}`),
        }));
      }
    });
    // Load drift
    safeSendMessageWithCallback('GET_DRIFT', undefined, (response: any) => {
      if (response && typeof response.drift === 'number') {
        setState((p) => ({
          ...p,
          drift: {
            drift: response.drift,
            level: response.level,
            effects: response.effects,
          },
        }));
      }
    });
    // Load drift history for mini-map
    safeSendMessageWithCallback('GET_DRIFT_HISTORY', undefined, (response: any) => {
      if (Array.isArray(response)) {
        setState((p) => ({ ...p, driftHistory: response }));
      }
    });
    // Load drift v2 state
    safeSendMessageWithCallback('GET_DRIFT_V2', undefined, (r: any) => {
      if (r?.composite !== undefined) setDriftV2(r);
    });
  }, []);

  // Listen for storage changes (e.g. sign-in from settings page)
  useEffect(() => {
    if (!chrome.storage?.onChanged) return;
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.settings?.newValue?.backend) {
        setState((p) => ({
          ...p,
          syncEnabled: changes.settings.newValue.backend.enabled || false,
        }));
      }
      if (changes.lastSyncResult?.newValue) {
        setState((p) => ({
          ...p,
          lastSyncResult: changes.lastSyncResult.newValue,
          lastSyncTime: changes.lastSyncResult.newValue.timestamp || p.lastSyncTime,
        }));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Listen for DRIFT_V2_UPDATED broadcasts from the background
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type === 'DRIFT_V2_UPDATED' && msg.data?.state) {
        setDriftV2(msg.data.state);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Periodically update drift and streak
  useEffect(() => {
    const updateInterval = setInterval(() => {
      // Update drift
      safeSendMessageWithCallback('GET_DRIFT', undefined, (response: any) => {
        if (response && typeof response.drift === 'number') {
          setState((p) => {
            const newLevel = response.level;
            const wasLow = p.drift.level === 'low';
            const nowDrifting = newLevel !== 'low';

            // Suggest a productive URL when transitioning to drifting state
            let suggestedUrl = p.suggestedUrl;
            if (wasLow && nowDrifting && p.productiveUrls.length > 0 && !p.dismissedSuggestion) {
              const randomIdx = Math.floor(Math.random() * p.productiveUrls.length);
              suggestedUrl = p.productiveUrls[randomIdx];
            }

            return {
              ...p,
              drift: {
                drift: response.drift,
                level: response.level,
                effects: response.effects,
              },
              suggestedUrl,
            };
          });
        }
      });
      // Update XP, productive URLs, and sync state
      if (!chrome.storage?.local) return;
      chrome.storage.local.get(['xp', 'productiveUrls', 'syncState', 'settings', 'lastSyncResult'], (result) => {
        setState((p) => ({
          ...p,
          xp: result.xp !== undefined ? result.xp : p.xp,
          productiveUrls: result.productiveUrls || p.productiveUrls,
          lastSyncTime: result.syncState?.lastSyncTime || p.lastSyncTime,
          syncEnabled:
            result.settings?.backend?.enabled !== undefined ? result.settings.backend.enabled : p.syncEnabled,
          lastSyncResult: result.lastSyncResult || p.lastSyncResult,
        }));
      });
      // Update drift history
      safeSendMessageWithCallback('GET_DRIFT_HISTORY', undefined, (response: any) => {
        if (Array.isArray(response)) {
          setState((p) => ({ ...p, driftHistory: response }));
        }
      });
      // Update drift v2 state
      safeSendMessageWithCallback('GET_DRIFT_V2', undefined, (r: any) => {
        if (r?.composite !== undefined) setDriftV2(r);
      });
    }, 10000); // Update every 10 seconds
    return () => clearInterval(updateInterval);
  }, []);

  // Update 24h chart every 60 seconds
  useEffect(() => {
    const update24h = () => {
      if (!chrome.storage?.local) return;
      chrome.storage.local.get(['dailyStats'], (result) => {
        const today = new Date().toISOString().split('T')[0];
        const storedHourly = result.dailyStats?.[today]?.hourlySeconds;
        const liveHourly = getTemporalData().hourlySeconds;
        setState((p) => ({ ...p, hourlyData: compute24hData(storedHourly, liveHourly) }));
      });
    };
    update24h();
    const interval = setInterval(update24h, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch challenge progress periodically
  useEffect(() => {
    const fetchChallengeProgress = () => {
      safeSendMessageWithCallback('GET_CHALLENGE_PROGRESS', undefined, (response: any) => {
        if (response && response.currentTier) {
          setState((p) => ({
            ...p,
            challengeProgress: {
              currentTier: response.currentTier,
              daysUnderGoal: response.daysUnderGoal,
              eligibleForUpgrade: response.eligibleForUpgrade,
            },
            // Show upgrade prompt if eligible and not dismissed
            showUpgradePrompt: response.eligibleForUpgrade && !p.dismissedNudges.has('upgrade_prompt'),
          }));
        }
      });
    };

    // Initial fetch
    fetchChallengeProgress();

    // Refresh every 5 minutes
    const interval = setInterval(fetchChallengeProgress, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle tier upgrade
  const handleUpgradeTier = useCallback(() => {
    safeSendMessageWithCallback('UPGRADE_TIER', undefined, (response: any) => {
      if (response?.success) {
        setState((p) => ({
          ...p,
          showUpgradePrompt: false,
          challengeProgress: p.challengeProgress
            ? {
                ...p.challengeProgress,
                currentTier: response.newTier,
                eligibleForUpgrade: false,
                daysUnderGoal: 0,
              }
            : null,
          xp: p.xp + (response.xpBonus || 0),
        }));
      }
    });
  }, []);

  const dismissUpgradePrompt = useCallback(() => {
    setState((p) => ({
      ...p,
      showUpgradePrompt: false,
      dismissedNudges: new Set([...p.dismissedNudges, 'upgrade_prompt']),
    }));
  }, []);

  const dismissSuggestion = useCallback(() => {
    setState((p) => ({
      ...p,
      suggestedUrl: null,
      dismissedSuggestion: true,
    }));
  }, []);

  const openSuggestion = useCallback((url: string) => {
    window.open(url, '_blank');
    setState((p) => ({
      ...p,
      suggestedUrl: null,
      dismissedSuggestion: true,
    }));
  }, []);

  // Nudge logic - check for nudges every update
  const checkNudges = useCallback(() => {
    // Gated by dev switch
    const devFeatures = (window as any).__YT_DETOX_DEV_FEATURES__ || {};
    if (!devFeatures.nudges) return;
    // Don't show nudges during observation phase
    if (state.phase === 'observation') return;

    const now = Date.now();

    // Time warning: over daily goal
    if (state.todayMinutes > state.dailyGoal && !state.dismissedNudges.has('time_warning_today')) {
      const overBy = state.todayMinutes - state.dailyGoal;
      setState((p) => ({
        ...p,
        activeNudge: {
          id: 'time_warning_today',
          type: 'time_warning',
          message: `You're ${formatMinutes(overBy)} over your daily goal`,
          icon: 'AlertCircle',
          color: '#f87171',
          dismissible: true,
        },
      }));
      return;
    }

    // Break reminder: every 30 minutes of continuous session
    const breakInterval = 30 * 60; // 30 minutes in seconds
    if (
      state.sessionDuration > 0 &&
      state.sessionDuration % breakInterval < 60 && // Within first minute of the interval
      now - state.lastBreakReminder > breakInterval * 1000 &&
      !state.dismissedNudges.has(`break_${Math.floor(state.sessionDuration / breakInterval)}`)
    ) {
      setState((p) => ({
        ...p,
        lastBreakReminder: now,
        activeNudge: {
          id: `break_${Math.floor(state.sessionDuration / breakInterval)}`,
          type: 'break_reminder',
          message: `${formatMinutes(Math.floor(state.sessionDuration / 60))} session -- time for a quick break?`,
          icon: 'Coffee',
          color: '#60a5fa',
          dismissible: true,
        },
      }));
      return;
    }

    // Bedtime warning (check if after 23:00)
    const hour = new Date().getHours();
    if (hour >= 23 && !state.dismissedNudges.has('bedtime_warning')) {
      setState((p) => ({
        ...p,
        activeNudge: {
          id: 'bedtime_warning',
          type: 'bedtime',
          message: 'Getting late -- screens before bed affect sleep quality',
          icon: 'Moon',
          color: '#a78bfa',
          dismissible: true,
        },
      }));
      return;
    }
  }, [
    state.todayMinutes,
    state.dailyGoal,
    state.sessionDuration,
    state.dismissedNudges,
    state.phase,
    state.lastBreakReminder,
  ]);

  // Run nudge check periodically
  useEffect(() => {
    const nudgeInterval = setInterval(checkNudges, 10000); // Check every 10 seconds
    return () => clearInterval(nudgeInterval);
  }, [checkNudges]);

  const dismissNudge = useCallback((nudgeId: string) => {
    setState((p) => ({
      ...p,
      activeNudge: null,
      dismissedNudges: new Set([...p.dismissedNudges, nudgeId]),
    }));
  }, []);

  useEffect(() => {
    const updateStats = () => {
      const browserSession = getCurrentSession();
      const videoSession = getCurrentVideoSession();
      const videoInfo = getCurrentVideoInfo();

      if (browserSession) {
        setState((p) => ({
          ...p,
          sessionDuration: browserSession.playDurationSeconds,
          videosWatched: browserSession.videosWatched,
          productiveCount: browserSession.productiveVideos,
          unproductiveCount: browserSession.unproductiveVideos,
          sessionBackgroundSeconds: browserSession.backgroundSeconds || 0,
        }));
      }
      if (videoSession) setState((p) => ({ ...p, currentVideoSeconds: videoSession.watchedSeconds }));
      if (videoInfo) setState((p) => ({ ...p, videoTitle: videoInfo.title || null }));

      safeSendMessageWithCallback('GET_STATS', undefined, (response: any) => {
        if (response?.today)
          setState((p) => ({
            ...p,
            todayMinutes: Math.floor((response.today.activeSeconds || response.today.totalSeconds) / 60),
            todayBackgroundMinutes: Math.floor((response.today.backgroundSeconds || 0) / 60),
          }));
      });

      // Get tab count
      safeSendMessageWithCallback('GET_TAB_INFO', undefined, (response: any) => {
        if (response?.youtubeTabs !== undefined) {
          setState((p) => ({ ...p, youtubeTabs: response.youtubeTabs }));
        }
      });

      if (
        videoSession &&
        !videoSession.productivityRating &&
        state.lastRatedVideo !== videoSession.id
      ) {
        // Trigger drift rating after 30s of watching or at 80% progress
        const shouldPrompt = videoSession.watchedSeconds > 30 || videoSession.watchedPercent >= 80;
        if (shouldPrompt && !state.showPrompt && !isFrictionOverlayVisible()) {
          setState((p) => ({ ...p, showPrompt: true }));
          safeSendMessage('PROMPT_SHOWN');
          const title = videoInfo?.title || videoSession.title || 'this video';
          showFrictionOverlay(title).then((driftRating) => {
            // Map 1-5 drift scale to -1/0/1 for storage compatibility
            // 1-2 (Anchored/Steady) = productive (1)
            // 3 (Drifting) = neutral (0)
            // 4-5 (Adrift/Lost) = unproductive (-1)
            const storageRating: -1 | 0 | 1 = driftRating <= 2 ? 1 : driftRating === 3 ? 0 : -1;
            rateVideo(storageRating);
            const xpGain = storageRating === 1 ? 15 : storageRating === 0 ? 5 : 2;
            setState((p) => ({ ...p, showPrompt: false, lastRatedVideo: videoSession.id, xp: p.xp + xpGain }));

            // Feed Content Quality drift axis based on rating
            const RATING_WEIGHTS: Record<number, number> = {
              1: -0.25, // Anchored
              2: -0.10, // On Course / Steady
              3: 0.05,  // Drifting
              4: 0.20,  // Adrift
              5: 0.35,  // Lost at Sea
            };
            chrome.runtime.sendMessage({
              type: 'DRIFT_BEHAVIOR_EVENT',
              data: { axis: 'contentQuality', weight: RATING_WEIGHTS[driftRating] || 0 },
            });
          });
        }
      }
    };
    updateStats();
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, [state.lastRatedVideo, state.showPrompt]);

  const levelInfo = getLevelInfo(state.xp);

  // ──────────────────────────────────────────────
  // COMPACT BAR (collapsed=false means bar view)
  // ──────────────────────────────────────────────
  const seaState = driftV2?.level || 'calm';
  const compositeVal = driftV2?.composite || 0;
  const driftPercent = Math.round(compositeVal * 100);


  // Drift percentage color by sea state
  const driftColor: Record<string, string> = {
    calm: '#5eead4',
    choppy: '#fbbf24',
    rough: '#f59e0b',
    storm: '#ef4444',
  };

  // Background darkens with higher composite
  const barBgDarkness = Math.round(compositeVal * 30); // 0..30 extra darkness

  if (!state.collapsed) {
    return (
      <div style={{
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0px',
        padding: '0 12px',
        position: 'relative' as const,
        background: `linear-gradient(180deg, hsl(220, 40%, ${Math.max(12 - barBgDarkness * 0.3, 3)}%) 0%, hsl(220, 50%, ${Math.max(6 - barBgDarkness * 0.15, 2)}%) 100%)`,
        border: '1px solid rgba(212, 165, 116, 0.3)',
        borderTop: 'none',
        borderBottom: '2px solid #b8956a',
        borderRadius: '0 0 10px 10px',
        height: '72px',
        fontSize: '13px',
        fontWeight: 500,
        color: '#f5e6c8',
        fontFamily: '"Source Sans 3", -apple-system, BlinkMacSystemFont, sans-serif',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(212,165,116,0.1)',
        cursor: 'default',
        userSelect: 'none' as const,
        overflow: 'hidden',
      }}>
        {/* SeaEffects weather overlay */}
        <SeaEffects seaState={seaState} composite={compositeVal} />

        {/* Section 1: Dramatic ship animation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative' as const,
          zIndex: 1,
        }}>
          <DramaticShip seaState={seaState} composite={compositeVal} />
        </div>

        {/* Gold divider */}
        <span style={{ color: 'rgba(212, 165, 116, 0.3)', padding: '0 2px', fontSize: '14px', lineHeight: '72px', position: 'relative' as const, zIndex: 1 }}>|</span>

        {/* Section 2: Stats - minutes, videos, drift% */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0 8px',
          position: 'relative' as const,
          zIndex: 1,
        }}>
          <span style={{
            fontVariantNumeric: 'tabular-nums',
            fontFamily: '"Source Sans 3", monospace',
            color: '#f5e6c8',
            fontSize: '12px',
            fontWeight: 500,
            whiteSpace: 'nowrap' as const,
          }}>
            {formatTime(state.sessionDuration)}
          </span>
          <span style={{ color: 'rgba(212,165,116,0.4)', fontSize: '10px' }}>&middot;</span>
          <span style={{
            fontVariantNumeric: 'tabular-nums',
            fontFamily: '"Source Sans 3", monospace',
            color: '#f5e6c8',
            fontSize: '12px',
            fontWeight: 500,
            whiteSpace: 'nowrap' as const,
          }}>
            {state.videosWatched} videos
          </span>
          <span style={{ color: 'rgba(212,165,116,0.4)', fontSize: '10px' }}>&middot;</span>
          <span style={{
            fontVariantNumeric: 'tabular-nums',
            fontFamily: '"Source Sans 3", monospace',
            color: driftColor[seaState] || '#5eead4',
            fontSize: '12px',
            fontWeight: 700,
            whiteSpace: 'nowrap' as const,
          }}>
            {driftPercent}%
          </span>
        </div>


        {/* Expand button */}
        <button
          onClick={() => setState((p) => ({ ...p, collapsed: true }))}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: '#d4a574',
            cursor: 'pointer',
            padding: '2px 4px',
            marginLeft: '2px',
            position: 'relative' as const,
            zIndex: 1,
          }}
        >
          <Icons.ChevronDown />
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // EXPANDED PANEL — Captain's Log
  // ──────────────────────────────────────────────

  return (
    <div style={{
      pointerEvents: 'auto',
      width: '340px',
      fontFamily: '"Source Sans 3", -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '14px',
      color: '#2c1810',
    }}>
      {/* Compact bar at top (same as collapsed but with up chevron) */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0px',
        padding: '0 12px',
        position: 'relative' as const,
        background: `linear-gradient(180deg, hsl(220, 40%, ${Math.max(12 - barBgDarkness * 0.3, 3)}%) 0%, hsl(220, 50%, ${Math.max(6 - barBgDarkness * 0.15, 2)}%) 100%)`,
        border: '1px solid rgba(212, 165, 116, 0.3)',
        borderTop: 'none',
        borderBottom: 'none',
        borderRadius: '0 0 0 0',
        height: '72px',
        fontSize: '13px',
        fontWeight: 500,
        color: '#f5e6c8',
        width: '100%',
        boxSizing: 'border-box' as const,
        boxShadow: 'inset 0 1px 0 rgba(212,165,116,0.1)',
        cursor: 'default',
        userSelect: 'none' as const,
        overflow: 'hidden',
      }}>
        {/* SeaEffects weather overlay */}
        <SeaEffects seaState={seaState} composite={compositeVal} />

        {/* Dramatic ship animation */}
        <div style={{
          display: 'inline-flex',
          position: 'relative' as const,
          zIndex: 1,
        }}>
          <DramaticShip seaState={seaState} composite={compositeVal} />
        </div>

        <span style={{
          fontVariantNumeric: 'tabular-nums',
          fontFamily: '"Source Sans 3", monospace',
          color: '#f5e6c8',
          fontSize: '12px',
          fontWeight: 500,
          flex: 1,
          position: 'relative' as const,
          zIndex: 1,
          whiteSpace: 'nowrap' as const,
        }}>
          {formatTime(state.sessionDuration)} &middot; {state.videosWatched} videos &middot;{' '}
          <span style={{ color: driftColor[seaState] || '#5eead4', fontWeight: 700 }}>{driftPercent}%</span>
        </span>
        <button
          onClick={() => setState((p) => ({ ...p, collapsed: false }))}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: '#d4a574',
            cursor: 'pointer',
            padding: '2px',
            position: 'relative' as const,
            zIndex: 1,
          }}
        >
          <Icons.ChevronUp />
        </button>
      </div>

      {/* Captain's Log panel */}
      <div style={{
        background: `linear-gradient(135deg, #f5e6c8 0%, #e8d5b7 50%, #d4c5a0 100%)`,
        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(44,24,16,0.015) 2px, rgba(44,24,16,0.015) 4px), linear-gradient(135deg, #f5e6c8 0%, #e8d5b7 50%, #d4c5a0 100%)`,
        border: '2px solid #d4a574',
        boxShadow: 'inset 0 0 0 1px #b8956a, 0 8px 32px rgba(0, 0, 0, 0.3)',
        borderRadius: '0 0 12px 12px',
        maxHeight: '70vh',
        overflowY: 'auto' as const,
        overflowX: 'hidden' as const,
      }}>
        {/* Header — Navy bar */}
        <div style={{
          background: '#0a1628',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            onClick={() => setState((p) => ({ ...p, showSyncStatus: !p.showSyncStatus }))}
            title="Click to see sync status"
          >
            {/* Sync status dot */}
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: state.syncEnabled && state.lastSyncTime ? '#22c55e' : '#d4a574',
              animation: state.syncEnabled && state.lastSyncTime ? 'yt-detox-pulse 2s infinite' : undefined,
              boxShadow: state.syncEnabled && state.lastSyncTime
                ? '0 0 6px rgba(34,197,94,0.5)'
                : '0 0 4px rgba(212,165,116,0.3)',
            }} />
            <span style={{
              fontFamily: '"Playfair Display", serif',
              fontStyle: 'italic',
              fontSize: '15px',
              fontWeight: 600,
              color: '#f5e6c8',
              letterSpacing: '0.5px',
            }}>
              Captain's Log
            </span>
            {state.syncEnabled && (
              <span style={{ marginLeft: '2px', opacity: 0.5, color: '#f5e6c8' }}>
                {state.lastSyncTime ? <Icons.Cloud /> : <Icons.CloudOff />}
              </span>
            )}
          </div>
          <button
            onClick={() => setState((p) => ({ ...p, collapsed: false }))}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: '#d4a574',
              cursor: 'pointer',
            }}
          >
            <Icons.ChevronUp />
          </button>
        </div>

        {/* Sync Status Popup */}
        {state.showSyncStatus && (
          <div style={{
            padding: '10px 16px',
            background: '#0a1628',
            borderBottom: '1px solid rgba(212,165,116,0.2)',
            fontSize: '11px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(245,230,200,0.6)' }}>Cloud Sync</span>
              {state.syncEnabled ? (
                <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Icons.Check /> Enabled
                </span>
              ) : (
                <span style={{ color: 'rgba(245,230,200,0.4)' }}>Disabled</span>
              )}
            </div>
            {state.syncEnabled && state.lastSyncTime && (
              <div style={{ marginTop: '6px', color: 'rgba(245,230,200,0.5)' }}>
                Last synced:{' '}
                {(() => {
                  const diff = Date.now() - state.lastSyncTime;
                  if (diff < 60000) return 'Just now';
                  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                  return new Date(state.lastSyncTime).toLocaleDateString();
                })()}
              </div>
            )}
            {state.syncEnabled && !state.lastSyncTime && (
              <div style={{ marginTop: '6px', color: 'rgba(245,230,200,0.4)' }}>Waiting for first sync...</div>
            )}

            {/* Sync Debug Panel */}
            {(window as any).__YT_DETOX_DEV_FEATURES__?.syncDebug && (
              <>
                <div
                  style={{
                    marginTop: '8px',
                    cursor: 'pointer',
                    color: 'rgba(245,230,200,0.5)',
                    fontSize: '10px',
                    userSelect: 'none',
                  }}
                  onClick={() => setState((p) => ({ ...p, syncDebugExpanded: !p.syncDebugExpanded }))}
                >
                  {state.syncDebugExpanded ? '[-]' : '[+]'} Debug
                </div>
                {state.syncDebugExpanded && (
                  <div style={{
                    marginTop: '6px',
                    fontSize: '10px',
                    color: 'rgba(245,230,200,0.5)',
                    fontFamily: '"Source Sans 3", monospace',
                  }}>
                    <button
                      onClick={() => {
                        safeSendMessageWithCallback('SYNC_NOW', undefined, (res: any) => {
                          if (res && !res.error) {
                            chrome.storage.local.get(['lastSyncResult', 'syncState'], (data) => {
                              setState((p) => ({
                                ...p,
                                lastSyncResult: data.lastSyncResult || p.lastSyncResult,
                                lastSyncTime: data.syncState?.lastSyncTime || p.lastSyncTime,
                              }));
                            });
                          }
                        });
                      }}
                      style={{
                        padding: '3px 8px',
                        background: 'rgba(212,165,116,0.2)',
                        border: '1px solid rgba(212,165,116,0.4)',
                        borderRadius: '4px',
                        color: '#d4a574',
                        fontSize: '10px',
                        cursor: 'pointer',
                        marginBottom: '6px',
                        fontFamily: '"Source Sans 3", monospace',
                      }}
                    >
                      Sync Now
                    </button>

                    {/* Last sync result */}
                    {state.lastSyncResult && (
                      <div style={{ marginBottom: '4px' }}>
                        Last sync:{' '}
                        {state.lastSyncResult.success ? (
                          <span style={{ color: '#4ade80' }}>
                            OK{' '}
                            {new Date(state.lastSyncResult.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {state.lastSyncResult.syncedCounts && (
                              <span>
                                {' '}
                                --{' '}
                                {Object.entries(state.lastSyncResult.syncedCounts)
                                  .filter(([, v]) => v > 0)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(', ') || 'no new data'}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: '#f87171' }}>
                            FAIL{' '}
                            {new Date(state.lastSyncResult.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {state.lastSyncResult.error && <span> -- {state.lastSyncResult.error.slice(0, 80)}</span>}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Pending queue counts */}
                    <div
                      style={{ cursor: 'pointer', marginBottom: '4px', textDecoration: 'underline' }}
                      onClick={() => {
                        safeSendMessageWithCallback('GET_PENDING_COUNTS', undefined, (res: any) => {
                          if (res && !res.error) {
                            setState((p) => ({ ...p, pendingCounts: res }));
                          }
                        });
                      }}
                    >
                      [Pending Queue]
                    </div>
                    {state.pendingCounts && (
                      <div style={{ marginBottom: '4px', paddingLeft: '8px' }}>
                        {Object.entries(state.pendingCounts)
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ') || 'empty'}
                      </div>
                    )}

                    {/* DB row counts */}
                    <div
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={async () => {
                        try {
                          const storage = await chrome.storage.local.get(['settings']);
                          const url = storage.settings?.backend?.url || 'https://linuxx.tailf96d3c.ts.net';
                          const userId = storage.settings?.backend?.userId || 'dev-user';
                          const res = await fetch(`${url}/debug/db-counts`, {
                            headers: { 'X-User-Id': userId },
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setState((p) => ({ ...p, dbCounts: data.counts }));
                          }
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      [DB Row Counts]
                    </div>
                    {state.dbCounts && (
                      <div style={{ paddingLeft: '8px', marginTop: '4px' }}>
                        {Object.entries(state.dbCounts)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══ Body Content ═══ */}
        <div style={{ padding: '16px' }}>

          {/* ─── ACTIVE NUDGE ─── */}
          {state.activeNudge && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '10px',
              marginBottom: '12px',
              position: 'relative' as const,
              animation: 'yt-detox-shake 0.3s ease',
              background: 'linear-gradient(135deg, #f5e6c8 0%, #e8d5b7 100%)',
              border: `1px solid ${state.activeNudge.color}60`,
              boxShadow: `0 2px 8px ${state.activeNudge.color}20`,
            }}>
              <div style={{ flexShrink: 0, color: state.activeNudge.color }}>
                {state.activeNudge.icon === 'AlertCircle' && <Icons.AlertCircle />}
                {state.activeNudge.icon === 'Coffee' && <Icons.Coffee />}
                {state.activeNudge.icon === 'Moon' && <Icons.Moon />}
                {state.activeNudge.icon === 'Lightbulb' && <Icons.Lightbulb />}
              </div>
              <div style={{ flex: 1, fontSize: '12px', lineHeight: '1.3', color: '#2c1810' }}>
                {state.activeNudge.message}
              </div>
              {state.activeNudge.dismissible && (
                <button
                  onClick={() => dismissNudge(state.activeNudge!.id)}
                  style={{
                    position: 'absolute' as const,
                    top: '4px',
                    right: '4px',
                    background: 'none',
                    border: 'none',
                    color: 'rgba(44,24,16,0.4)',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                >
                  <Icons.X />
                </button>
              )}
            </div>
          )}

          {/* ─── TIER UPGRADE PROMPT ─── */}
          {state.showUpgradePrompt && state.challengeProgress && (
            <div style={{
              padding: '14px',
              background: 'linear-gradient(135deg, rgba(212,165,116,0.2) 0%, rgba(184,149,106,0.2) 100%)',
              borderRadius: '10px',
              marginBottom: '14px',
              border: '2px solid #d4a574',
              animation: 'yt-detox-pulse 2s ease-in-out infinite',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span
                  style={{ color: '#b8956a', display: 'inline-flex' }}
                  dangerouslySetInnerHTML={{ __html: shipsWheelSvg(28) }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#2c1810',
                    fontFamily: '"Playfair Display", serif',
                  }}>
                    Promotion Available!
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(44,24,16,0.6)' }}>
                    {state.challengeProgress.daysUnderGoal} days under goal — ready to advance to{' '}
                    {(() => {
                      const nextIndex = TIER_ORDER.indexOf(state.challengeProgress.currentTier) + 1;
                      const nextTier = TIER_ORDER[nextIndex];
                      return nextTier ? NAUTICAL_RANKS[nextTier] : 'Ascetic';
                    })()}
                    ?
                  </div>
                </div>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '10px',
              }}>
                <div style={{
                  padding: '6px 12px',
                  background: 'rgba(44,24,16,0.08)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#2c1810',
                }}>
                  {TIER_CONFIG[state.challengeProgress.currentTier]?.icon}{' '}
                  {NAUTICAL_RANKS[state.challengeProgress.currentTier]}
                </div>
                <span style={{ color: 'rgba(44,24,16,0.4)', fontSize: '16px' }}>&rarr;</span>
                <div style={{
                  padding: '6px 12px',
                  background: 'linear-gradient(135deg, rgba(212,165,116,0.3) 0%, rgba(184,149,106,0.4) 100%)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: '1px solid #d4a574',
                  color: '#2c1810',
                }}>
                  {(() => {
                    const nextIndex = TIER_ORDER.indexOf(state.challengeProgress.currentTier) + 1;
                    const nextTier = TIER_ORDER[nextIndex];
                    return nextTier ? `${TIER_CONFIG[nextTier]?.icon} ${NAUTICAL_RANKS[nextTier]}` : 'Ascetic';
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleUpgradeTier}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'linear-gradient(135deg, #b8956a 0%, #d4a574 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: '"Source Sans 3", sans-serif',
                    boxShadow: '0 2px 8px rgba(184,149,106,0.4)',
                  }}
                >
                  Level Up +100 XP
                </button>
                <button
                  onClick={dismissUpgradePrompt}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(44,24,16,0.08)',
                    border: '1px solid rgba(44,24,16,0.15)',
                    borderRadius: '8px',
                    color: 'rgba(44,24,16,0.5)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: '"Source Sans 3", sans-serif',
                  }}
                >
                  Later
                </button>
              </div>
            </div>
          )}

          {/* ─── DRIFT OVERVIEW ─── */}
          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '14px',
            padding: '12px',
            background: 'rgba(255,255,255,0.4)',
            borderRadius: '10px',
            border: '1px solid rgba(44,24,16,0.08)',
          }}>
            {/* Left: Drift Radar + composite */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              {driftV2 ? (
                <>
                  <DriftRadar axes={driftV2.axes} size={120} showLabels />
                  <div style={{
                    marginTop: '6px',
                    fontSize: '20px',
                    fontWeight: 700,
                    color: '#2c1810',
                    fontFamily: '"Playfair Display", serif',
                    lineHeight: 1,
                  }}>
                    {Math.round(driftV2.composite * 100)}%
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: 'rgba(44,24,16,0.5)',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.5px',
                    marginTop: '2px',
                  }}>
                    {driftV2.level}
                  </div>
                </>
              ) : (
                <div style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  background: 'rgba(44,24,16,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  color: 'rgba(44,24,16,0.35)',
                }}>
                  Loading...
                </div>
              )}
            </div>

            {/* Right: Axis breakdown bars */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
              {([
                { key: 'timePressure' as const, label: 'Time', color: '#f59e0b' },
                { key: 'contentQuality' as const, label: 'Content', color: '#3b82f6' },
                { key: 'behaviorPattern' as const, label: 'Behavior', color: '#a855f7' },
                { key: 'circadian' as const, label: 'Circadian', color: '#6366f1' },
              ]).map(({ key, label, color }) => {
                const value = key === 'circadian'
                  ? (driftV2?.axes.circadian ?? 0)
                  : (driftV2?.axes[key]?.value ?? 0);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '10px',
                      color: 'rgba(44,24,16,0.6)',
                      width: '52px',
                      flexShrink: 0,
                      textAlign: 'right' as const,
                    }}>
                      {label}
                    </span>
                    <div style={{
                      flex: 1,
                      height: '6px',
                      background: 'rgba(44,24,16,0.08)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.round(value * 100)}%`,
                        background: color,
                        borderRadius: '3px',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'rgba(44,24,16,0.7)',
                      width: '28px',
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {Math.round(value * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── SESSION STATS ─── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            marginBottom: '14px',
            padding: '8px 4px',
            background: 'rgba(255,255,255,0.3)',
            borderRadius: '8px',
            border: '1px solid rgba(44,24,16,0.06)',
          }}>
            <div style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#2c1810', fontFamily: '"Source Sans 3", monospace' }}>
                {formatTime(state.sessionDuration)}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(44,24,16,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                Watch
              </div>
            </div>
            <div style={{ width: '1px', height: '20px', background: 'rgba(44,24,16,0.1)' }} />
            <div style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#2c1810', fontFamily: '"Source Sans 3", monospace' }}>
                {state.videosWatched}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(44,24,16,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                Videos
              </div>
            </div>
            <div style={{ width: '1px', height: '20px', background: 'rgba(44,24,16,0.1)' }} />
            <div style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0d9488', fontFamily: '"Source Sans 3", monospace' }}>
                {state.productiveCount}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(13,148,136,0.7)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                Productive
              </div>
            </div>
            <div style={{ width: '1px', height: '20px', background: 'rgba(44,24,16,0.1)' }} />
            <div style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#991b1b', fontFamily: '"Source Sans 3", monospace' }}>
                {state.unproductiveCount}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(153,27,27,0.7)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                Unproductive
              </div>
            </div>
          </div>

          {/* ─── DEEP DIVE BUTTON ─── */}
          <div style={{ marginBottom: '14px' }}>
            <button
              onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_TAB', data: { url: chrome.runtime.getURL('src/options/options.html#dashboard') } })}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.12) 100%)',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: '8px',
                color: '#4f46e5',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: '"Source Sans 3", sans-serif',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              Deep Dive &rarr;
            </button>
          </div>

          {/* ─── MINI MAP ─── */}
          <div style={{ marginBottom: '14px' }}>
            <PirateMap
              mode="mini"
              driftHistory={state.driftHistory}
              currentDrift={state.drift.drift}
              currentLevel={state.drift.level}
              streak={state.streak}
            />
          </div>

          {/* ─── Productive Alternative Suggestion ─── */}
          {state.suggestedUrl && state.drift.level !== 'low' && (
            <div style={{
              padding: '12px',
              background: 'rgba(13,148,136,0.08)',
              borderRadius: '10px',
              marginBottom: '14px',
              border: '1px solid rgba(13,148,136,0.2)',
              animation: 'yt-detox-wave 2s ease-in-out infinite',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ color: '#0d9488' }}>
                  <Icons.Sparkles />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: 'rgba(44,24,16,0.5)' }}>
                    Chart a better course?
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#2c1810' }}>{state.suggestedUrl.title}</div>
                </div>
                <button
                  onClick={() => dismissSuggestion()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(44,24,16,0.3)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <Icons.X />
                </button>
              </div>
              <button
                onClick={() => openSuggestion(state.suggestedUrl!.url)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(13,148,136,0.15)',
                  border: '1px solid rgba(13,148,136,0.3)',
                  borderRadius: '8px',
                  color: '#0d9488',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontFamily: '"Source Sans 3", sans-serif',
                }}
              >
                Open <Icons.ExternalLink />
              </button>
            </div>
          )}

          {/* ─── LEVEL BAR — "Rank & Doubloons" ─── */}
          <div style={{
            marginBottom: '14px',
            padding: '12px',
            background: 'linear-gradient(135deg, rgba(212,165,116,0.12) 0%, rgba(184,149,106,0.12) 100%)',
            borderRadius: '10px',
            border: '1px solid rgba(212,165,116,0.25)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Gold circle level badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  background: 'linear-gradient(135deg, #d4a574 0%, #b8956a 100%)',
                  borderRadius: '50%',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#fff',
                  boxShadow: '0 2px 6px rgba(184,149,106,0.4)',
                  fontFamily: '"Playfair Display", serif',
                }}>
                  {levelInfo.level}
                </div>
                <div>
                  <div style={{
                    fontSize: '12px',
                    color: '#2c1810',
                    fontWeight: 600,
                    fontFamily: '"Playfair Display", serif',
                  }}>
                    {state.challengeProgress
                      ? NAUTICAL_RANKS[state.challengeProgress.currentTier]
                      : `Level ${levelInfo.level}`}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(44,24,16,0.5)' }}>
                    {levelInfo.currentXp} / {levelInfo.nextLevelXp} XP
                  </div>
                </div>
              </div>
              <span style={{ color: '#b8956a' }}>
                <span dangerouslySetInnerHTML={{ __html: shipsWheelSvg(20) }} />
              </span>
            </div>
            {/* Gold gradient progress bar */}
            <div style={{
              height: '6px',
              background: 'rgba(44,24,16,0.08)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${levelInfo.progress}%`,
                background: 'linear-gradient(90deg, #b8956a 0%, #d4a574 100%)',
                borderRadius: '3px',
                transition: 'width 0.5s',
              }} />
            </div>
          </div>

          {/* ─── ACHIEVEMENTS — "Maritime Medals" ─── */}
          {state.achievements.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '14px',
              flexWrap: 'wrap' as const,
            }}>
              {state.achievements.slice(0, 3).map((a, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.5)',
                  border: i === 0
                    ? '2px solid #d4a574'  // gold
                    : i === 1
                      ? '2px solid #94a3b8' // silver
                      : '2px solid #b87333', // bronze
                  fontSize: '12px',
                  boxShadow: i === 0
                    ? '0 0 8px rgba(212,165,116,0.3)'
                    : '0 1px 4px rgba(0,0,0,0.1)',
                  textAlign: 'center' as const,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  padding: '4px',
                }}>
                  <span style={{ fontSize: '10px' }}>{a}</span>
                </div>
              ))}
              {state.achievements.length > 3 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(44,24,16,0.06)',
                  border: '1px dashed rgba(44,24,16,0.15)',
                  fontSize: '10px',
                  color: 'rgba(44,24,16,0.4)',
                }}>
                  +{state.achievements.length - 3}
                </div>
              )}
            </div>
          )}

          {/* ─── NOW WATCHING — "Ship's Current Position" ─── */}
          {state.videoTitle && (
            <div style={{
              marginBottom: '12px',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.45)',
              borderRadius: '10px',
              border: '1px solid rgba(44,24,16,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{
                  color: '#b8956a',
                  flexShrink: 0,
                  marginTop: '2px',
                }}>
                  <span dangerouslySetInnerHTML={{ __html: compassRoseSvg(50, 18) }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '9px',
                    color: 'rgba(44,24,16,0.4)',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.5px',
                    fontFamily: '"Playfair Display", serif',
                    fontStyle: 'italic',
                  }}>
                    Now Watching
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#2c1810',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                    fontWeight: 500,
                  }}>
                    {state.videoTitle}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: 'rgba(44,24,16,0.4)',
                    marginTop: '2px',
                    fontFamily: '"Source Sans 3", monospace',
                  }}>
                    {formatTime(state.currentVideoSeconds)} watched
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rope border decoration at bottom */}
          <div style={{
            marginTop: '4px',
            opacity: 0.5,
            color: '#b8956a',
          }}>
            <span dangerouslySetInnerHTML={{ __html: ropeBorderSvg() }} />
          </div>

          {/* Productivity prompt now shows as full-screen friction overlay */}
        </div>
      </div>
    </div>
  );
}
