/**
 * Drift System 🌊
 * Progressive friction coefficient calculation
 */

import {
  getStorage,
  getTodayKey,
  type DriftState,
  type GoalMode,
  type ChallengeTier,
} from './storage';
import { CHALLENGE_TIERS } from './challenge';

// ===== Drift State =====

let driftState: DriftState = {
  current: 0,
  history: [],
  lastCalculated: 0,
};

// ===== Drift Factors =====

export interface DriftFactors {
  timeRatio: number;
  unproductiveRatio: number;
  recommendationRatio: number;
  bingeBonus: number;
  lateNightBonus: number;
  productiveDiscount: number;
  breakDiscount: number;
}

// ===== Drift Effects =====

export interface DriftEffects {
  thumbnailBlur: number;
  thumbnailGrayscale: number;
  commentsReduction: number;
  sidebarReduction: number;
  autoplayDelay: number;
  showTextOnly: boolean;
}

export type DriftLevel = 'low' | 'medium' | 'high' | 'critical';

// ===== Calculate Drift =====

export async function calculateDrift(): Promise<{ drift: number; factors: DriftFactors }> {
  const storage = await getStorage();
  const settings = storage.settings;
  const todayKey = getTodayKey();
  const todayStats = storage.dailyStats[todayKey];

  // Get goal based on challenge tier (stored in settings or default to casual)
  const challengeTier = ((settings as any).challengeTier as ChallengeTier) || 'casual';
  const goalMinutes = CHALLENGE_TIERS[challengeTier]?.goalMinutes || 60;

  // If no data yet, drift is 0
  if (!todayStats) {
    return {
      drift: 0,
      factors: {
        timeRatio: 0,
        unproductiveRatio: 0,
        recommendationRatio: 0,
        bingeBonus: 0,
        lateNightBonus: 0,
        productiveDiscount: 0,
        breakDiscount: 0,
      },
    };
  }

  const todayMinutes = Math.floor((todayStats.totalSeconds || 0) / 60);
  const totalRated =
    (todayStats.productiveVideos || 0) +
    (todayStats.unproductiveVideos || 0) +
    (todayStats.neutralVideos || 0);
  const totalVideos = todayStats.videoCount || 0;

  // Calculate factors
  const factors: DriftFactors = {
    // Base: time spent relative to goal
    timeRatio: Math.min(todayMinutes / goalMinutes, 1.5), // Cap at 1.5

    // Unproductive video ratio (0-0.3 contribution)
    unproductiveRatio:
      totalRated > 0 ? ((todayStats.unproductiveVideos || 0) / totalRated) * 0.3 : 0,

    // Recommendation clicks vs total (0-0.2 contribution)
    recommendationRatio:
      totalVideos > 0 ? ((todayStats.recommendationClicks || 0) / totalVideos) * 0.2 : 0,

    // Binge bonus: current session over 60 minutes
    bingeBonus: 0, // Will be set from current session

    // Late night (23:00 - 06:00)
    lateNightBonus: (() => {
      const hour = new Date().getHours();
      return hour >= 23 || hour < 6 ? 0.15 : 0;
    })(),

    // Productive video discount (negative, reduces drift)
    productiveDiscount:
      totalRated > 0 ? -((todayStats.productiveVideos || 0) / totalRated) * 0.2 : 0,

    // Break discount (if took breaks recently)
    breakDiscount: 0, // TODO: track breaks taken
  };

  // Check for binge session (current session > 60 min)
  const browserSessions = storage.browserSessions || [];
  const activeSessions = browserSessions.filter((s) => !s.endedAt);
  if (activeSessions.length > 0) {
    const currentSession = activeSessions[activeSessions.length - 1];
    const sessionMinutes = (currentSession.totalDurationSeconds || 0) / 60;
    if (sessionMinutes > 60) {
      factors.bingeBonus = 0.2;
    } else if (sessionMinutes > 30) {
      factors.bingeBonus = 0.1;
    }
  }

  // Calculate final drift
  let drift =
    factors.timeRatio * 0.6 + // Time is 60% of drift
    factors.unproductiveRatio +
    factors.recommendationRatio +
    factors.bingeBonus +
    factors.lateNightBonus +
    factors.productiveDiscount +
    factors.breakDiscount;

  // Apply mode modifiers
  const goalMode = ((settings as any).goalMode as GoalMode) || 'time_reduction';
  if (goalMode === 'strict') {
    drift *= 1.5; // 50% faster drift in strict mode
  } else if (goalMode === 'music') {
    // In music mode, check if current content is music (via storage flag)
    const musicData = await chrome.storage.local.get('currentContentIsMusic');
    if (musicData.currentContentIsMusic) {
      drift *= 0.3; // Heavy discount for music content
    } else {
      drift *= 0.9; // Small discount even when not music
    }
  } else if (goalMode === 'cold_turkey') {
    // Cold turkey: hard block threshold at 0.3
    // Once you hit 0.3, it jumps to 1.0 (max friction)
    if (drift >= 0.3) {
      drift = 1.0;
    }
  }

  // Clamp to 0-1
  drift = Math.max(0, Math.min(1, drift));

  // Update state
  driftState.current = drift;
  driftState.lastCalculated = Date.now();

  // Add to history (keep hourly snapshots)
  const lastSnapshot = driftState.history[driftState.history.length - 1];
  const hourAgo = Date.now() - 60 * 60 * 1000;
  if (!lastSnapshot || lastSnapshot.timestamp < hourAgo) {
    driftState.history.push({ timestamp: Date.now(), value: drift });
    // Keep only last 24 hours
    driftState.history = driftState.history.filter((h) => h.timestamp > Date.now() - 24 * 60 * 60 * 1000);
  }

  // Persist drift state
  await chrome.storage.local.set({ driftState });

  return { drift, factors };
}

// ===== Get Drift Level =====

export function getDriftLevel(drift: number): DriftLevel {
  if (drift < 0.3) return 'low';
  if (drift < 0.5) return 'medium';
  if (drift < 0.7) return 'high';
  return 'critical';
}

// ===== Friction Settings =====

interface FrictionEnabled {
  thumbnails: boolean;
  sidebar: boolean;
  comments: boolean;
  player: boolean;
  autoplay: boolean;
}

const DEFAULT_FRICTION: FrictionEnabled = {
  thumbnails: true,
  sidebar: true,
  comments: true,
  player: false,
  autoplay: true,
};

// ===== Get Drift Effects =====

export async function getDriftEffectsAsync(drift: number): Promise<DriftEffects> {
  // Get friction settings from storage
  const data = await chrome.storage.local.get('settings');
  const frictionEnabled: FrictionEnabled = data.settings?.frictionEnabled || DEFAULT_FRICTION;
  
  return calculateDriftEffects(drift, frictionEnabled);
}

export function getDriftEffects(drift: number): DriftEffects {
  // Sync version uses defaults - async version should be preferred
  return calculateDriftEffects(drift, DEFAULT_FRICTION);
}

function calculateDriftEffects(drift: number, friction: FrictionEnabled): DriftEffects {
  return {
    thumbnailBlur: friction.thumbnails 
      ? (drift < 0.5 ? 0 : drift < 0.7 ? 2 : drift < 0.9 ? 4 : 8)
      : 0,
    thumbnailGrayscale: friction.thumbnails
      ? (drift < 0.3 ? 0 : drift < 0.5 ? 20 : drift < 0.7 ? 30 : drift < 0.9 ? 60 : 100)
      : 0,
    commentsReduction: friction.comments
      ? (drift < 0.3 ? 0 : drift < 0.5 ? 10 : drift < 0.7 ? 20 : drift < 0.9 ? 50 : 100)
      : 0,
    sidebarReduction: friction.sidebar
      ? (drift < 0.3 ? 0 : drift < 0.5 ? 50 : drift < 0.7 ? 75 : 100)
      : 0,
    autoplayDelay: friction.autoplay
      ? (drift < 0.3 ? 5 : drift < 0.5 ? 15 : drift < 0.7 ? 30 : 999)
      : 5,
    showTextOnly: friction.thumbnails && drift >= 0.9,
  };
}

// ===== Get Current Drift State =====

export function getDriftState(): DriftState {
  return driftState;
}

export function getCurrentDrift(): number {
  return driftState.current;
}

// ===== Initialize Drift =====

export async function initDrift(): Promise<void> {
  const data = await chrome.storage.local.get('driftState');
  if (data.driftState) {
    driftState = data.driftState;
    console.log('[YT Detox] Restored drift state:', driftState.current.toFixed(2));
  }
}

// ===== Periodic Drift Calculation =====

let driftInterval: ReturnType<typeof setInterval> | null = null;

export function startDriftCalculation(intervalMs: number = 30000): void {
  if (driftInterval) {
    clearInterval(driftInterval);
  }

  driftInterval = setInterval(async () => {
    const { drift, factors } = await calculateDrift();
    const effects = await getDriftEffectsAsync(drift);
    console.log('[YT Detox] Drift calculated:', drift.toFixed(2), 'factors:', factors);
    
    // Broadcast drift update to content scripts
    chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtu.be/*'] }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'DRIFT_UPDATED',
            data: {
              drift,
              level: getDriftLevel(drift),
              effects,
            },
          }).catch(() => {
            // Tab might not have content script loaded
          });
        }
      }
    });
  }, intervalMs);
}

export function stopDriftCalculation(): void {
  if (driftInterval) {
    clearInterval(driftInterval);
    driftInterval = null;
  }
}
