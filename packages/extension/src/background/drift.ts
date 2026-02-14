/**
 * Drift System V2 - 4-Axis Weighted Decay Engine
 * Replaces the old single-value calendar-day drift with
 * timePressure, contentQuality, behaviorPattern, and circadian axes.
 */

import type {
  DriftStateV2,
  DriftAxisState,
  DriftSample,
  SeaState,
  DriftEffectsV2,
  DriftWeights,
} from '@yt-detox/shared';
import {
  getStorage,
  type DriftState,
  type DriftSnapshot,
  emptyDriftStateV2,
  DEFAULT_DRIFT_WEIGHTS,
  DRIFT_SATURATION,
  DRIFT_HALF_LIVES,
} from './storage';

// ===== Legacy type re-exports for backward compatibility =====

export interface DriftFactors {
  timeRatio: number;
  unproductiveRatio: number;
  recommendationRatio: number;
  bingeBonus: number;
  lateNightBonus: number;
  productiveDiscount: number;
  breakDiscount: number;
}

export interface DriftEffects {
  thumbnailBlur: number;
  thumbnailGrayscale: number;
  commentsReduction: number;
  sidebarReduction: number;
  autoplayDelay: number;
  showTextOnly: boolean;
}

export type DriftLevel = 'low' | 'medium' | 'high' | 'critical';

// ===== Decay Math Helpers =====

function decayWeight(sample: DriftSample, now: number, halfLife: number): number {
  const elapsed = now - sample.timestamp;
  return sample.weight * Math.pow(2, -(elapsed / halfLife));
}

function computeAxisValue(axis: DriftAxisState, now: number, saturation: number): number {
  let sum = 0;
  for (const s of axis.samples) {
    sum += decayWeight(s, now, axis.halfLife);
  }
  return Math.min(Math.max(sum / saturation, 0), 1);
}

function gcSamples(axis: DriftAxisState, now: number): DriftSample[] {
  const maxAge = axis.halfLife * 3;
  return axis.samples.filter(s => (now - s.timestamp) < maxAge);
}

function computeCircadian(bedtimeHour: number): number {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  let hoursUntil = bedtimeHour - currentHour;
  if (hoursUntil < -12) hoursUntil += 24;
  if (hoursUntil > 12) hoursUntil -= 24;
  if (hoursUntil > 4) return 0;
  if (hoursUntil > 2) return 0.2;
  if (hoursUntil > 0) return 0.5;
  return 1.0;
}

function getSeaState(composite: number): SeaState {
  if (composite < 0.25) return 'calm';
  if (composite < 0.50) return 'choppy';
  if (composite < 0.75) return 'rough';
  return 'storm';
}

// ===== Module-Level State =====

let driftV2: DriftStateV2 = emptyDriftStateV2();

// Legacy state (derived from V2 for backward compat)
let driftState: DriftState = {
  current: 0,
  history: [],
  lastCalculated: 0,
};

// Drift history (30-min snapshots)
let driftSnapshots: DriftSnapshot[] = [];
let lastSnapshotTime = 0;

// ===== Drift History =====

export async function initDriftHistory(): Promise<void> {
  const result = await chrome.storage.local.get('driftHistory');
  driftSnapshots = result.driftHistory || [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  driftSnapshots = driftSnapshots.filter((s) => s.timestamp > cutoff);
}

export function getDriftSnapshots(): DriftSnapshot[] {
  return driftSnapshots;
}

async function recordDriftSnapshot(drift: number, level: SeaState): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stats = await chrome.storage.local.get('dailyStats');
  const today = new Date().toISOString().split('T')[0];
  const todayStats = stats.dailyStats?.[today];

  // Map SeaState to legacy level for the snapshot
  const legacyLevel: 'low' | 'medium' | 'high' | 'critical' =
    level === 'calm' ? 'low'
    : level === 'choppy' ? 'medium'
    : level === 'rough' ? 'high'
    : 'critical';

  const snapshot: DriftSnapshot = {
    timestamp: Date.now(),
    drift,
    level: legacyLevel,
    videosThisHour: todayStats?.videoCount || 0,
    productiveThisHour: todayStats?.productiveVideos || 0,
  };

  driftSnapshots.push(snapshot);
  driftSnapshots = driftSnapshots.filter((s) => s.timestamp > cutoff);
  if (driftSnapshots.length > 48) {
    driftSnapshots = driftSnapshots.slice(-48);
  }
  await chrome.storage.local.set({ driftHistory: driftSnapshots });

  // Update today's avgDrift in dailyStats (fresh read to avoid race with updateDailyStats)
  const freshStats = await chrome.storage.local.get('dailyStats');
  if (freshStats.dailyStats?.[today]) {
    const todayStart = new Date(today + 'T00:00:00').getTime();
    const todaySnapshots = driftSnapshots.filter((s) => s.timestamp >= todayStart);
    if (todaySnapshots.length > 0) {
      freshStats.dailyStats[today].avgDrift =
        todaySnapshots.reduce((sum, s) => sum + s.drift, 0) / todaySnapshots.length;
      await chrome.storage.local.set({ dailyStats: freshStats.dailyStats });
    }
  }
}

// ===== V2 Exported Functions =====

export function addDriftSample(
  axis: 'timePressure' | 'contentQuality' | 'behaviorPattern',
  weight: number,
): void {
  driftV2.axes[axis].samples.push({ timestamp: Date.now(), weight });
}

export async function calculateDriftV2(): Promise<DriftStateV2> {
  // Read storage for weights and bedtime
  const storage = await getStorage();
  const weights: DriftWeights = storage.settings.driftWeights || DEFAULT_DRIFT_WEIGHTS;
  const bedtimeHour: number = (storage.settings as any).bedtimeHour ?? 23;
  const now = Date.now();

  // GC old samples
  driftV2.axes.timePressure.samples = gcSamples(driftV2.axes.timePressure, now);
  driftV2.axes.contentQuality.samples = gcSamples(driftV2.axes.contentQuality, now);
  driftV2.axes.behaviorPattern.samples = gcSamples(driftV2.axes.behaviorPattern, now);

  // Compute each axis
  driftV2.axes.timePressure.value = computeAxisValue(driftV2.axes.timePressure, now, DRIFT_SATURATION.timePressure);
  driftV2.axes.contentQuality.value = computeAxisValue(driftV2.axes.contentQuality, now, DRIFT_SATURATION.contentQuality);
  driftV2.axes.behaviorPattern.value = computeAxisValue(driftV2.axes.behaviorPattern, now, DRIFT_SATURATION.behaviorPattern);
  driftV2.axes.circadian = computeCircadian(bedtimeHour);

  // Composite: 3 axes form the base (weights normalized to sum=1),
  // then circadian acts as a MULTIPLIER that amplifies the base.
  // After bedtime, drift surges hard — not just +15%.
  const baseWeight = weights.timePressure + weights.contentQuality + weights.behaviorPattern;
  const base = baseWeight > 0
    ? (driftV2.axes.timePressure.value * weights.timePressure +
       driftV2.axes.contentQuality.value * weights.contentQuality +
       driftV2.axes.behaviorPattern.value * weights.behaviorPattern) / baseWeight
    : 0;
  // Circadian multiplier: at bedtime (circadian=1.0) drift is amplified
  // by up to 80%. The circadian weight slider scales the boost strength.
  const circadianBoost = 1 + driftV2.axes.circadian * (weights.circadian / 0.15) * 0.8;
  driftV2.composite = Math.min(Math.max(base * circadianBoost, 0), 1);
  driftV2.level = getSeaState(driftV2.composite);
  driftV2.lastCalculated = now;

  // Update legacy state
  driftState.current = driftV2.composite;
  driftState.lastCalculated = now;
  const lastSnapshot = driftState.history[driftState.history.length - 1];
  const hourAgo = Date.now() - 60 * 60 * 1000;
  if (!lastSnapshot || lastSnapshot.timestamp < hourAgo) {
    driftState.history.push({ timestamp: now, value: driftV2.composite });
    driftState.history = driftState.history.filter((h) => h.timestamp > Date.now() - 24 * 60 * 60 * 1000);
  }

  // Persist
  await chrome.storage.local.set({ driftV2State: driftV2, driftState });

  return driftV2;
}

export function getDriftV2State(): DriftStateV2 {
  return driftV2;
}

// ===== Legacy Compatibility Wrappers =====

export async function calculateDrift(): Promise<{ drift: number; factors: Record<string, number> }> {
  const state = await calculateDriftV2();
  return {
    drift: state.composite,
    factors: {
      timeRatio: state.axes.timePressure.value,
      unproductiveRatio: state.axes.contentQuality.value,
      recommendationRatio: state.axes.behaviorPattern.value,
      lateNightBonus: state.axes.circadian,
      productiveDiscount: 0,
      bingeBonus: 0,
      breakDiscount: 0,
    },
  };
}

export function getDriftLevel(drift: number): SeaState {
  return getSeaState(drift);
}

export function getDriftEffects(drift: number): DriftEffectsV2 {
  const level = getSeaState(drift);
  const base = { seaState: level, showTextOnly: false };
  switch (level) {
    case 'calm':
      return { ...base, thumbnailBlur: 0, thumbnailGrayscale: 0, commentsReduction: 0, sidebarReduction: 0, autoplayDelay: 5 };
    case 'choppy':
      return { ...base, thumbnailBlur: 0, thumbnailGrayscale: 20, commentsReduction: 10, sidebarReduction: 50, autoplayDelay: 15 };
    case 'rough':
      return { ...base, thumbnailBlur: 2, thumbnailGrayscale: 30, commentsReduction: 20, sidebarReduction: 75, autoplayDelay: 30 };
    case 'storm':
      return { ...base, thumbnailBlur: 6, thumbnailGrayscale: 80, commentsReduction: 75, sidebarReduction: 100, autoplayDelay: 999, showTextOnly: drift >= 0.9 };
  }
}

export async function getDriftEffectsAsync(drift: number): Promise<DriftEffectsV2> {
  return getDriftEffects(drift);
}

// ===== State Accessors =====

export function getDriftState(): DriftState {
  return driftState;
}

export function getCurrentDrift(): number {
  return driftState.current;
}

// ===== Initialization =====

export async function initDrift(): Promise<void> {
  const stored = await chrome.storage.local.get(['driftV2State']);
  if (stored.driftV2State) {
    driftV2 = stored.driftV2State;
    // Restore half-lives (not persisted)
    driftV2.axes.timePressure.halfLife = DRIFT_HALF_LIVES.timePressure;
    driftV2.axes.contentQuality.halfLife = DRIFT_HALF_LIVES.contentQuality;
    driftV2.axes.behaviorPattern.halfLife = DRIFT_HALF_LIVES.behaviorPattern;
  }

  // Sync legacy state
  driftState.current = driftV2.composite;
  driftState.lastCalculated = driftV2.lastCalculated;

  // Also try restoring legacy history
  const legacyData = await chrome.storage.local.get('driftState');
  if (legacyData.driftState?.history) {
    driftState.history = legacyData.driftState.history;
  }

  console.log('[YT Detox] Drift V2 initialized, composite:', driftV2.composite);
}

// ===== Periodic Drift Calculation =====

let driftInterval: ReturnType<typeof setInterval> | null = null;

export function startDriftCalculation(intervalMs: number = 30000): void {
  if (driftInterval) {
    clearInterval(driftInterval);
  }

  driftInterval = setInterval(async () => {
    // Add time pressure sample from live session if data is fresh
    const stored = await chrome.storage.local.get(['liveSession', 'liveSessionUpdatedAt']);
    if (stored.liveSession && stored.liveSessionUpdatedAt) {
      const age = Date.now() - stored.liveSessionUpdatedAt;
      if (age < 60000 && stored.liveSession.activeDurationSeconds > 0) {
        addDriftSample('timePressure', intervalMs / 1000 / 60);
      }
    }

    const state = await calculateDriftV2();
    const effects = getDriftEffects(state.composite);
    console.log('[YT Detox] Drift V2 calculated:', state.composite.toFixed(2), 'level:', state.level);

    // Record 30-minute drift snapshot
    const now = Date.now();
    if (now - lastSnapshotTime >= 30 * 60 * 1000) {
      lastSnapshotTime = now;
      await recordDriftSnapshot(state.composite, state.level);
    }

    // Broadcast drift update to content scripts
    chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtu.be/*'] }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          // V2 message
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'DRIFT_V2_UPDATED',
              data: {
                drift: state.composite,
                level: state.level,
                effects,
                axes: state.axes,
              },
            })
            .catch(() => {
              // Tab might not have content script loaded
            });
          // Legacy message for backward compat
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'DRIFT_UPDATED',
              data: {
                drift: state.composite,
                level: getDriftLevel(state.composite),
                effects,
              },
            })
            .catch(() => {
              // Tab might not have content script loaded
            });
        }
      }
    });
  }, intervalMs);
}

// ===== Drift Recalculation from Restored Data =====

export async function recalculateDriftFromHistory(
  videoSessions: Array<{ timestamp: number; watchedSeconds: number; productivityRating?: -1 | 0 | 1 | null }>,
): Promise<void> {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;

  // Reset drift state
  driftV2 = emptyDriftStateV2();

  // Replay time pressure samples from video sessions
  const recentSessions = videoSessions.filter((s) => s.timestamp > cutoff);
  for (const session of recentSessions) {
    const minutes = session.watchedSeconds / 60;
    driftV2.axes.timePressure.samples.push({
      timestamp: session.timestamp,
      weight: minutes,
    });
  }

  // Replay content quality samples from rated sessions
  const RATING_WEIGHTS: Record<number, number> = {
    1: -0.25,
    0: 0.05,
    '-1': 0.35,
  };
  for (const session of recentSessions) {
    if (session.productivityRating != null) {
      const weight = RATING_WEIGHTS[session.productivityRating] ?? 0;
      driftV2.axes.contentQuality.samples.push({
        timestamp: session.timestamp,
        weight,
      });
    }
  }

  // Recalculate composite
  await calculateDriftV2();
  console.log('[YT Detox] Drift recalculated from restored data, composite:', driftV2.composite.toFixed(2));
}

export function stopDriftCalculation(): void {
  if (driftInterval) {
    clearInterval(driftInterval);
    driftInterval = null;
  }
}
