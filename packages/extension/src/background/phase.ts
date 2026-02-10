/**
 * Phase Management System
 * Observation → Awareness → Intervention → Reduction
 */

import { getStorage, saveStorage } from './storage';

// ===== Phase Configuration =====

export const OBSERVATION_DAYS = 7;
export const AWARENESS_DAYS = 14;
export const INTERVENTION_DAYS = 30;

export type Phase = 'observation' | 'awareness' | 'intervention' | 'reduction';

export interface PhaseInfo {
  phase: Phase;
  daysRemaining: number;
  shouldNotify: boolean;
}

// ===== Phase Helpers =====

export function getDaysSinceInstall(installDate: number): number {
  return Math.floor((Date.now() - installDate) / (1000 * 60 * 60 * 24));
}

export function calculateRecommendedPhase(installDate: number): Phase {
  const days = getDaysSinceInstall(installDate);

  if (days < OBSERVATION_DAYS) return 'observation';
  if (days < OBSERVATION_DAYS + AWARENESS_DAYS) return 'awareness';
  if (days < OBSERVATION_DAYS + AWARENESS_DAYS + INTERVENTION_DAYS) return 'intervention';
  return 'reduction';
}

// ===== Check and Update Phase =====

export async function checkAndUpdatePhase(): Promise<PhaseInfo> {
  const storage = await getStorage();
  const settings = storage.settings;

  const installDate = settings.installDate || Date.now();
  const days = getDaysSinceInstall(installDate);
  const recommendedPhase = calculateRecommendedPhase(installDate);
  const currentPhase = settings.phase;

  let daysRemaining = 0;
  let shouldNotify = false;

  if (recommendedPhase === 'observation') {
    daysRemaining = OBSERVATION_DAYS - days;
  } else if (recommendedPhase === 'awareness') {
    daysRemaining = OBSERVATION_DAYS + AWARENESS_DAYS - days;
  } else if (recommendedPhase === 'intervention') {
    daysRemaining = OBSERVATION_DAYS + AWARENESS_DAYS + INTERVENTION_DAYS - days;
  }

  // Auto-advance phase if time has come
  if (currentPhase !== recommendedPhase) {
    settings.phase = recommendedPhase;
    await saveStorage({ settings });
    shouldNotify = true;
    console.log(`[YT Detox] Phase advanced: ${currentPhase} → ${recommendedPhase}`);
  }

  return { phase: recommendedPhase, daysRemaining, shouldNotify };
}

// ===== Set Phase Manually =====

export async function setPhase(phase: Phase): Promise<{ success: boolean; phase: Phase }> {
  const storage = await getStorage();
  storage.settings.phase = phase;
  await saveStorage({ settings: storage.settings });
  return { success: true, phase };
}

// ===== Get Current Phase =====

export async function getCurrentPhase(): Promise<Phase> {
  const storage = await getStorage();
  return storage.settings.phase || 'observation';
}

// ===== Initialize Phase =====

export async function initPhase(): Promise<void> {
  const { phase, daysRemaining, shouldNotify } = await checkAndUpdatePhase();
  console.log(`[YT Detox] Current phase: ${phase}, days remaining: ${daysRemaining}`);

  if (shouldNotify) {
    // Could show a notification here about phase change
    chrome.notifications.create('phase-change', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '🎯 Phase Updated',
      message: `You've advanced to the ${phase} phase!`,
    });
  }
}
