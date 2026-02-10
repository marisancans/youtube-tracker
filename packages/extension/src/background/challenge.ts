/**
 * Challenge System - Tiers and XP
 */

import { getStorage, saveStorage, type ChallengeTier, type ChallengeProgress } from './storage';

// ===== Challenge Tiers =====

export const CHALLENGE_TIERS: Record<ChallengeTier, { goalMinutes: number; xpMultiplier: number }> = {
  casual: { goalMinutes: 60, xpMultiplier: 1.0 },
  focused: { goalMinutes: 45, xpMultiplier: 1.5 },
  disciplined: { goalMinutes: 30, xpMultiplier: 2.0 },
  monk: { goalMinutes: 15, xpMultiplier: 3.0 },
  ascetic: { goalMinutes: 5, xpMultiplier: 5.0 },
};

export const TIER_ORDER: ChallengeTier[] = ['casual', 'focused', 'disciplined', 'monk', 'ascetic'];
export const DAYS_TO_UPGRADE = 5; // Days under goal to unlock next tier

// ===== Get Challenge Progress =====

export async function getChallengeProgress(): Promise<ChallengeProgress> {
  const data = await chrome.storage.local.get(['challengeProgress', 'settings', 'dailyStats', 'xp']);
  const settings = data.settings || {};
  const currentTier: ChallengeTier = (settings.challengeTier as ChallengeTier) || 'casual';
  const dailyStats = data.dailyStats || {};

  let progress: ChallengeProgress = data.challengeProgress || {
    currentTier,
    daysUnderGoal: 0,
    lastUnderGoalDate: null,
    totalXp: data.xp || 0,
    tierHistory: [{ tier: currentTier, date: new Date().toISOString().split('T')[0] }],
    eligibleForUpgrade: false,
  };

  // Calculate consecutive days under goal
  const goalMinutes = CHALLENGE_TIERS[currentTier]?.goalMinutes || 60;
  const today = new Date().toISOString().split('T')[0];

  // Check recent days
  let consecutiveDays = 0;
  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    const dayStats = dailyStats[dateKey];

    if (dayStats) {
      const dayMinutes = Math.floor((dayStats.totalSeconds || 0) / 60);
      if (dayMinutes <= goalMinutes) {
        consecutiveDays++;
      } else {
        break; // Streak broken
      }
    } else if (i === 0) {
      // Today with no data counts as under goal
      consecutiveDays++;
    } else {
      break;
    }
  }

  progress.daysUnderGoal = consecutiveDays;
  progress.lastUnderGoalDate = today;

  // Check eligibility for upgrade
  const currentTierIndex = TIER_ORDER.indexOf(currentTier);
  const canUpgrade = currentTierIndex < TIER_ORDER.length - 1;
  progress.eligibleForUpgrade = canUpgrade && consecutiveDays >= DAYS_TO_UPGRADE;

  // Save progress
  await chrome.storage.local.set({ challengeProgress: progress });

  return progress;
}

// ===== Upgrade Tier =====

export async function upgradeTier(): Promise<{
  success: boolean;
  newTier: ChallengeTier;
  xpBonus: number;
}> {
  const storage = await getStorage();
  const settings = storage.settings as any;
  const currentTier = settings.challengeTier || 'casual';
  const currentIndex = TIER_ORDER.indexOf(currentTier);

  if (currentIndex >= TIER_ORDER.length - 1) {
    return { success: false, newTier: currentTier, xpBonus: 0 };
  }

  const newTier = TIER_ORDER[currentIndex + 1];
  const xpBonus = 100; // Bonus XP for accepting challenge

  // Update settings
  settings.challengeTier = newTier;
  settings.dailyGoalMinutes = CHALLENGE_TIERS[newTier].goalMinutes;
  await saveStorage({ settings });

  // Update XP
  const currentXp = (await chrome.storage.local.get('xp')).xp || 0;
  await chrome.storage.local.set({ xp: currentXp + xpBonus });

  // Update progress
  const progress = await getChallengeProgress();
  progress.currentTier = newTier;
  progress.daysUnderGoal = 0;
  progress.eligibleForUpgrade = false;
  progress.tierHistory.push({ tier: newTier, date: new Date().toISOString().split('T')[0] });
  await chrome.storage.local.set({ challengeProgress: progress });

  console.log(`[YT Detox] Tier upgraded: ${currentTier} → ${newTier}, +${xpBonus} XP`);

  return { success: true, newTier, xpBonus };
}

// ===== Downgrade Tier =====

export async function downgradeTier(): Promise<{ success: boolean; newTier: ChallengeTier }> {
  const storage = await getStorage();
  const settings = storage.settings as any;
  const currentTier = settings.challengeTier || 'casual';
  const currentIndex = TIER_ORDER.indexOf(currentTier);

  if (currentIndex <= 0) {
    return { success: false, newTier: currentTier };
  }

  const newTier = TIER_ORDER[currentIndex - 1];

  // Update settings
  settings.challengeTier = newTier;
  settings.dailyGoalMinutes = CHALLENGE_TIERS[newTier].goalMinutes;
  await saveStorage({ settings });

  console.log(`[YT Detox] Tier downgraded: ${currentTier} → ${newTier}`);

  return { success: true, newTier };
}

// ===== XP Management =====

export function getXpMultiplier(tier: ChallengeTier): number {
  return CHALLENGE_TIERS[tier]?.xpMultiplier || 1.0;
}

export async function awardXp(baseXp: number, reason: string): Promise<number> {
  const storage = await getStorage();
  const tier = (storage.settings as any).challengeTier || 'casual';
  const multiplier = getXpMultiplier(tier);
  const totalXp = Math.floor(baseXp * multiplier);

  const currentXp = (await chrome.storage.local.get('xp')).xp || 0;
  const newXp = currentXp + totalXp;
  await chrome.storage.local.set({ xp: newXp });

  console.log(`[YT Detox] XP awarded: +${totalXp} (${baseXp} × ${multiplier}x) for ${reason}`);

  return totalXp;
}

// ===== Daily Challenge Check =====

export async function checkDailyChallenge(): Promise<void> {
  const progress = await getChallengeProgress();

  if (progress.eligibleForUpgrade) {
    // Notify user they can upgrade
    chrome.notifications.create('challenge-upgrade', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '🏆 Challenge Unlocked!',
      message: `You've been under goal for ${progress.daysUnderGoal} days! Ready to level up?`,
      buttons: [{ title: 'Accept Challenge' }, { title: 'Maybe Later' }],
    });
  }
}

// ===== Set Goal Mode =====

export async function setGoalMode(
  mode: 'music' | 'time_reduction' | 'strict' | 'cold_turkey'
): Promise<{ success: boolean; mode: string }> {
  const storage = await getStorage();
  (storage.settings as any).goalMode = mode;
  await saveStorage({ settings: storage.settings });
  return { success: true, mode };
}

// ===== Set Challenge Tier =====

export async function setChallengeTier(
  tier: ChallengeTier
): Promise<{ success: boolean; tier: ChallengeTier }> {
  const storage = await getStorage();
  (storage.settings as any).challengeTier = tier;
  storage.settings.dailyGoalMinutes = CHALLENGE_TIERS[tier].goalMinutes;
  await saveStorage({ settings: storage.settings });
  return { success: true, tier };
}

// ===== Initialize Challenge System =====

let challengeInterval: ReturnType<typeof setInterval> | null = null;

export function startChallengeChecks(intervalMs: number = 60 * 60 * 1000): void {
  // Check once per hour
  if (challengeInterval) {
    clearInterval(challengeInterval);
  }
  challengeInterval = setInterval(checkDailyChallenge, intervalMs);
}

export function stopChallengeChecks(): void {
  if (challengeInterval) {
    clearInterval(challengeInterval);
    challengeInterval = null;
  }
}

// ===== Notification Handler =====

export function handleNotificationClick(notificationId: string, buttonIndex: number): void {
  if (notificationId === 'challenge-upgrade') {
    if (buttonIndex === 0) {
      // Accept
      upgradeTier();
    }
    chrome.notifications.clear(notificationId);
  }
}
