/**
 * Achievement System
 * Tracks and awards achievements based on user behavior
 */

import { getStorage, getTodayKey } from './storage';

// ===== Achievement Definitions =====

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  unlockedAt?: number;
}

export interface AchievementProgress {
  unlockedAchievements: string[];
  achievementData: Record<string, any>; // For tracking progress
}

const ACHIEVEMENTS: Achievement[] = [
  // Streak achievements
  {
    id: 'streak_3',
    name: '3-Day Streak',
    description: 'Stay under goal for 3 days',
    icon: '🔥',
    xpReward: 25,
    rarity: 'common',
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Stay under goal for 7 days',
    icon: '🗓️',
    xpReward: 50,
    rarity: 'uncommon',
  },
  {
    id: 'streak_14',
    name: 'Fortnight Focus',
    description: 'Stay under goal for 14 days',
    icon: '💪',
    xpReward: 100,
    rarity: 'rare',
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Stay under goal for 30 days',
    icon: '🏆',
    xpReward: 250,
    rarity: 'epic',
  },
  {
    id: 'streak_100',
    name: 'Centurion',
    description: 'Stay under goal for 100 days',
    icon: '👑',
    xpReward: 1000,
    rarity: 'legendary',
  },

  // Productivity achievements
  {
    id: 'productive_10',
    name: 'Productive Viewer',
    description: 'Rate 10 videos as productive',
    icon: '✅',
    xpReward: 30,
    rarity: 'common',
  },
  {
    id: 'productive_50',
    name: 'Quality Curator',
    description: 'Rate 50 videos as productive',
    icon: '🎯',
    xpReward: 75,
    rarity: 'uncommon',
  },
  {
    id: 'productive_100',
    name: 'Content Connoisseur',
    description: 'Rate 100 videos as productive',
    icon: '🍷',
    xpReward: 150,
    rarity: 'rare',
  },

  // Time achievements
  {
    id: 'under_30',
    name: 'Quick Check',
    description: 'Complete a day under 30 minutes',
    icon: '⚡',
    xpReward: 20,
    rarity: 'common',
  },
  {
    id: 'under_15',
    name: 'Lightning Visit',
    description: 'Complete a day under 15 minutes',
    icon: '⚡',
    xpReward: 40,
    rarity: 'uncommon',
  },
  {
    id: 'zero_day',
    name: 'Digital Detox',
    description: 'Complete a day with zero YouTube',
    icon: '🧘',
    xpReward: 100,
    rarity: 'rare',
  },

  // Engagement achievements
  {
    id: 'rate_first',
    name: 'First Rating',
    description: 'Rate your first video',
    icon: '👆',
    xpReward: 10,
    rarity: 'common',
  },
  {
    id: 'rate_100',
    name: 'Active Rater',
    description: 'Rate 100 videos total',
    icon: '📊',
    xpReward: 100,
    rarity: 'uncommon',
  },

  // Tier achievements
  {
    id: 'tier_focused',
    name: 'Getting Focused',
    description: 'Reach Focused tier',
    icon: '🎯',
    xpReward: 50,
    rarity: 'common',
  },
  {
    id: 'tier_disciplined',
    name: 'Disciplined',
    description: 'Reach Disciplined tier',
    icon: '⚡',
    xpReward: 100,
    rarity: 'uncommon',
  },
  { id: 'tier_monk', name: 'Monk Mode', description: 'Reach Monk tier', icon: '🔥', xpReward: 200, rarity: 'rare' },
  {
    id: 'tier_ascetic',
    name: 'Digital Ascetic',
    description: 'Reach Ascetic tier',
    icon: '💎',
    xpReward: 500,
    rarity: 'epic',
  },

  // Drift achievements
  {
    id: 'low_drift_day',
    name: 'Focused Day',
    description: 'End a day with drift under 20%',
    icon: '🎯',
    xpReward: 25,
    rarity: 'common',
  },
  {
    id: 'low_drift_week',
    name: 'Focused Week',
    description: 'Average drift under 30% for a week',
    icon: '🌟',
    xpReward: 75,
    rarity: 'uncommon',
  },

  // Special achievements
  {
    id: 'no_recommendations',
    name: 'Self-Directed',
    description: 'Watch 10 videos without using recommendations',
    icon: '🧭',
    xpReward: 50,
    rarity: 'uncommon',
  },
  {
    id: 'no_autoplay',
    name: 'Autoplay Avoider',
    description: 'Cancel autoplay 10 times',
    icon: '🛑',
    xpReward: 40,
    rarity: 'common',
  },
  {
    id: 'morning_person',
    name: 'Morning Person',
    description: 'Watch YouTube only before noon for a week',
    icon: '🌅',
    xpReward: 75,
    rarity: 'rare',
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Stay under goal on both weekend days',
    icon: '🎉',
    xpReward: 30,
    rarity: 'common',
  },
];

// ===== Achievement Checking =====

export async function checkAchievements(): Promise<Achievement[]> {
  const storage = await getStorage();
  const progressData = await chrome.storage.local.get(['achievementProgress', 'streak', 'xp', 'driftState']);

  const progress: AchievementProgress = progressData.achievementProgress || {
    unlockedAchievements: [],
    achievementData: {},
  };

  const newlyUnlocked: Achievement[] = [];
  const streak = progressData.streak || 0;
  const dailyStats = storage.dailyStats;
  const todayKey = getTodayKey();
  const todayStats = dailyStats[todayKey];
  const settings = storage.settings as any;

  // Calculate totals
  let totalProductiveRatings = 0;
  let totalRatings = 0;
  let _totalRecommendationClicks = 0;
  let totalAutoplayCancelled = 0;

  for (const day of Object.values(dailyStats)) {
    totalProductiveRatings += day.productiveVideos || 0;
    totalRatings += (day.productiveVideos || 0) + (day.unproductiveVideos || 0) + (day.neutralVideos || 0);
    _totalRecommendationClicks += day.recommendationClicks || 0;
    totalAutoplayCancelled += day.autoplayCancelled || 0;
  }

  // Check each achievement
  for (const achievement of ACHIEVEMENTS) {
    if (progress.unlockedAchievements.includes(achievement.id)) continue;

    let unlocked = false;

    switch (achievement.id) {
      // Streak achievements
      case 'streak_3':
        unlocked = streak >= 3;
        break;
      case 'streak_7':
        unlocked = streak >= 7;
        break;
      case 'streak_14':
        unlocked = streak >= 14;
        break;
      case 'streak_30':
        unlocked = streak >= 30;
        break;
      case 'streak_100':
        unlocked = streak >= 100;
        break;

      // Productivity achievements
      case 'productive_10':
        unlocked = totalProductiveRatings >= 10;
        break;
      case 'productive_50':
        unlocked = totalProductiveRatings >= 50;
        break;
      case 'productive_100':
        unlocked = totalProductiveRatings >= 100;
        break;

      // Time achievements
      case 'under_30':
        unlocked = todayStats && todayStats.totalSeconds > 0 && todayStats.totalSeconds < 30 * 60;
        break;
      case 'under_15':
        unlocked = todayStats && todayStats.totalSeconds > 0 && todayStats.totalSeconds < 15 * 60;
        break;
      case 'zero_day':
        // Check if yesterday had zero usage
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().split('T')[0];
        const yesterdayStats = dailyStats[yesterdayKey];
        unlocked = yesterdayStats && (yesterdayStats.totalSeconds || 0) === 0;
        break;

      // Rating achievements
      case 'rate_first':
        unlocked = totalRatings >= 1;
        break;
      case 'rate_100':
        unlocked = totalRatings >= 100;
        break;

      // Tier achievements
      case 'tier_focused':
        unlocked =
          settings?.challengeTier === 'focused' || ['disciplined', 'monk', 'ascetic'].includes(settings?.challengeTier);
        break;
      case 'tier_disciplined':
        unlocked = settings?.challengeTier === 'disciplined' || ['monk', 'ascetic'].includes(settings?.challengeTier);
        break;
      case 'tier_monk':
        unlocked = settings?.challengeTier === 'monk' || settings?.challengeTier === 'ascetic';
        break;
      case 'tier_ascetic':
        unlocked = settings?.challengeTier === 'ascetic';
        break;

      // Drift achievements
      case 'low_drift_day':
        const driftState = progressData.driftState;
        unlocked = driftState && driftState.current < 0.2;
        break;

      // Behavioral achievements
      case 'no_autoplay':
        unlocked = totalAutoplayCancelled >= 10;
        break;

      // Weekend warrior
      case 'weekend_warrior':
        const saturday = new Date();
        saturday.setDate(saturday.getDate() - saturday.getDay() - 1); // Last Saturday
        const sunday = new Date(saturday);
        sunday.setDate(sunday.getDate() + 1);
        const satKey = saturday.toISOString().split('T')[0];
        const sunKey = sunday.toISOString().split('T')[0];
        const satStats = dailyStats[satKey];
        const sunStats = dailyStats[sunKey];
        const goalMinutes = settings?.dailyGoalMinutes || 60;
        const goalSeconds = goalMinutes * 60;
        unlocked =
          satStats &&
          sunStats &&
          (satStats.totalSeconds || 0) <= goalSeconds &&
          (sunStats.totalSeconds || 0) <= goalSeconds;
        break;
    }

    if (unlocked) {
      progress.unlockedAchievements.push(achievement.id);
      newlyUnlocked.push({ ...achievement, unlockedAt: Date.now() });
    }
  }

  // Save progress
  if (newlyUnlocked.length > 0) {
    await chrome.storage.local.set({ achievementProgress: progress });

    // Award XP
    const totalXpReward = newlyUnlocked.reduce((sum, a) => sum + a.xpReward, 0);
    const currentXp = progressData.xp || 0;
    await chrome.storage.local.set({ xp: currentXp + totalXpReward });

    console.log(
      '[YT Detox] Achievements unlocked:',
      newlyUnlocked.map((a) => a.name),
    );
  }

  return newlyUnlocked;
}

// ===== Get Unlocked Achievements =====

export async function getUnlockedAchievements(): Promise<Achievement[]> {
  const data = await chrome.storage.local.get('achievementProgress');
  const progress: AchievementProgress = data.achievementProgress || {
    unlockedAchievements: [],
    achievementData: {},
  };

  return ACHIEVEMENTS.filter((a) => progress.unlockedAchievements.includes(a.id)).map((a) => ({ ...a }));
}

// ===== Get All Achievements =====

export function getAllAchievements(): Achievement[] {
  return [...ACHIEVEMENTS];
}

// ===== Get Achievement By ID =====

export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

// ===== Calculate Streak =====

export async function calculateStreak(): Promise<number> {
  const storage = await getStorage();
  const dailyStats = storage.dailyStats;
  const settings = storage.settings as any;
  const goalMinutes = settings?.dailyGoalMinutes || 60;
  const goalSeconds = goalMinutes * 60;

  let streak = 0;
  const today = new Date();

  // Start from yesterday and go backwards
  // Streak = consecutive days where user watched AND stayed under goal
  for (let i = 1; i <= 365; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    const dayStats = dailyStats[key];

    // No data = no streak (they didn't track that day)
    if (!dayStats || dayStats.totalSeconds === undefined) {
      break;
    }

    // Check if under goal
    if (dayStats.totalSeconds <= goalSeconds) {
      streak++;
    } else {
      break; // Streak broken - over goal
    }
  }

  // Save streak
  await chrome.storage.local.set({ streak });

  return streak;
}

// ===== Initialize =====

export async function initAchievements(): Promise<void> {
  // Calculate initial streak
  await calculateStreak();

  // Check achievements
  const newAchievements = await checkAchievements();

  if (newAchievements.length > 0) {
    // Show notification for new achievements
    const names = newAchievements.map((a) => `${a.icon} ${a.name}`).join(', ');
    chrome.notifications.create('achievements', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '🎉 Achievement Unlocked!',
      message: names,
    });
  }
}

// ===== Periodic Check =====

let achievementInterval: ReturnType<typeof setInterval> | null = null;

export function startAchievementChecks(intervalMs: number = 60 * 60 * 1000): void {
  // Check every hour
  if (achievementInterval) {
    clearInterval(achievementInterval);
  }

  achievementInterval = setInterval(async () => {
    await calculateStreak();
    await checkAchievements();
  }, intervalMs);
}

export function stopAchievementChecks(): void {
  if (achievementInterval) {
    clearInterval(achievementInterval);
    achievementInterval = null;
  }
}
