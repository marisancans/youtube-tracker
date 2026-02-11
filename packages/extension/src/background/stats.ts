/**
 * Daily stats and baseline calculation
 */

import type { VideoSession, BrowserSession, DailyStats, ChannelStat } from '@yt-detox/shared';
import { getStorage, saveStorage, getTodayKey, getHour } from './storage';

// ===== Empty Stats Template =====

export function getEmptyDailyStats(dateStr: string): DailyStats {
  const hourlySeconds: Record<string, number> = {};
  for (let i = 0; i < 24; i++) {
    hourlySeconds[i.toString()] = 0;
  }

  return {
    date: dateStr,
    totalSeconds: 0,
    activeSeconds: 0,
    backgroundSeconds: 0,
    sessionCount: 0,
    avgSessionDurationSeconds: 0,
    firstCheckTime: undefined,
    videoCount: 0,
    videosCompleted: 0,
    videosAbandoned: 0,
    shortsCount: 0,
    uniqueChannels: 0,
    searchCount: 0,
    recommendationClicks: 0,
    autoplayCount: 0,
    autoplayCancelled: 0,
    totalScrollPixels: 0,
    avgScrollVelocity: 0,
    thumbnailsHovered: 0,
    thumbnailsClicked: 0,
    pageReloads: 0,
    backButtonPresses: 0,
    tabSwitches: 0,
    productiveVideos: 0,
    unproductiveVideos: 0,
    neutralVideos: 0,
    promptsShown: 0,
    promptsAnswered: 0,
    interventionsShown: 0,
    interventionsEffective: 0,
    hourlySeconds,
    topChannels: [],
    preSleepMinutes: 0,
    bingeSessions: 0,
  };
}

// ===== Update Daily Stats =====

interface TemporalData {
  firstCheckTime?: number;
  hourlySeconds?: Record<string, number>;
  bingeModeActive?: boolean;
  preSleepActive?: boolean;
}

export async function updateDailyStats(
  browserSession: BrowserSession,
  videoSessions: VideoSession[],
  temporal?: TemporalData,
): Promise<void> {
  const storage = await getStorage();
  const today = getTodayKey();

  if (!storage.dailyStats[today]) {
    storage.dailyStats[today] = getEmptyDailyStats(today);
  }

  const stats = storage.dailyStats[today];

  // Update from browser session
  stats.totalSeconds += browserSession.totalDurationSeconds;
  stats.activeSeconds += browserSession.activeDurationSeconds;
  stats.backgroundSeconds += browserSession.backgroundSeconds;
  stats.sessionCount++;

  if (stats.sessionCount > 0) {
    stats.avgSessionDurationSeconds = Math.floor(stats.totalSeconds / stats.sessionCount);
  }

  // First check time from temporal tracking
  if (temporal?.firstCheckTime && !stats.firstCheckTime) {
    // Convert timestamp to HH:MM format
    const date = new Date(temporal.firstCheckTime);
    stats.firstCheckTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  // Behavioral metrics
  stats.searchCount += browserSession.searchCount;
  stats.recommendationClicks += browserSession.recommendationClicks;
  stats.autoplayCount += browserSession.autoplayCount;
  stats.autoplayCancelled += browserSession.autoplayCancelled;
  stats.totalScrollPixels += browserSession.totalScrollPixels;
  stats.thumbnailsHovered += browserSession.thumbnailsHovered;
  stats.thumbnailsClicked += browserSession.thumbnailsClicked;
  stats.pageReloads += browserSession.pageReloads;
  stats.backButtonPresses += browserSession.backButtonPresses;

  // Productivity
  stats.productiveVideos += browserSession.productiveVideos;
  stats.unproductiveVideos += browserSession.unproductiveVideos;
  stats.neutralVideos += browserSession.neutralVideos;

  // Update hourly distribution from temporal data
  if (temporal?.hourlySeconds) {
    for (const [hour, seconds] of Object.entries(temporal.hourlySeconds)) {
      stats.hourlySeconds[hour] = (stats.hourlySeconds[hour] || 0) + (seconds as number);
    }
  } else {
    const hour = getHour();
    stats.hourlySeconds[hour] = (stats.hourlySeconds[hour] || 0) + browserSession.totalDurationSeconds;
  }

  // Binge detection
  if (browserSession.totalDurationSeconds > 3600 || temporal?.bingeModeActive) {
    stats.bingeSessions++;
  }

  // Pre-sleep tracking
  if (temporal?.preSleepActive) {
    stats.preSleepMinutes += Math.floor(browserSession.totalDurationSeconds / 60);
  }

  // Process video sessions
  const channelMinutes: Record<string, { minutes: number; count: number }> = {};

  for (const session of videoSessions) {
    stats.videoCount++;

    if (session.isShort) {
      stats.shortsCount++;
    }

    if (session.watchedPercent >= 90) {
      stats.videosCompleted++;
    } else if (session.watchedPercent < 30) {
      stats.videosAbandoned++;
    }

    if (session.channel) {
      if (!channelMinutes[session.channel]) {
        channelMinutes[session.channel] = { minutes: 0, count: 0 };
      }
      channelMinutes[session.channel].minutes += Math.floor(session.watchedSeconds / 60);
      channelMinutes[session.channel].count++;
    }

    stats.tabSwitches += session.tabSwitchCount;
  }

  // Update top channels
  const channels = Object.entries(channelMinutes)
    .map(([channel, data]) => ({
      channel,
      minutes: data.minutes,
      videoCount: data.count,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const existingChannels = new Map((stats.topChannels || []).map((c: ChannelStat) => [c.channel, c]));

  for (const ch of channels) {
    if (existingChannels.has(ch.channel)) {
      const existing = existingChannels.get(ch.channel)!;
      existing.minutes += ch.minutes;
      existing.videoCount += ch.videoCount;
    } else {
      existingChannels.set(ch.channel, ch);
    }
  }

  stats.topChannels = Array.from(existingChannels.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  stats.uniqueChannels = existingChannels.size;

  await saveStorage({ dailyStats: storage.dailyStats });
}

// ===== Baseline Stats =====

export interface BaselineStats {
  avgDailyMinutes: number;
  avgDailyVideos: number;
  avgSessionMinutes: number;
  totalDays: number;
  peakHours: number[];
  topChannels: Array<{ channel: string; minutes: number }>;
  productivityRatio: number;
  recommendationRatio: number;
  completionRate: number;
  shortsRatio: number;
}

export async function calculateBaselineStats(): Promise<BaselineStats> {
  const storage = await getStorage();
  const dailyStats = storage.dailyStats || {};
  const videoSessions = storage.videoSessions || [];

  const stats = Object.values(dailyStats);
  const daysWithData = stats.length;

  if (daysWithData === 0) {
    return {
      avgDailyMinutes: 0,
      avgDailyVideos: 0,
      avgSessionMinutes: 0,
      totalDays: 0,
      peakHours: [],
      topChannels: [],
      productivityRatio: 0,
      recommendationRatio: 0,
      completionRate: 0,
      shortsRatio: 0,
    };
  }

  // Calculate averages
  const totalSeconds = stats.reduce((sum, d) => sum + (d.totalSeconds || 0), 0);
  const totalVideos = stats.reduce((sum, d) => sum + (d.videoCount || 0), 0);
  const totalSessions = stats.reduce((sum, d) => sum + (d.sessionCount || 0), 0);
  const totalProductive = stats.reduce((sum, d) => sum + (d.productiveVideos || 0), 0);
  const totalUnproductive = stats.reduce((sum, d) => sum + (d.unproductiveVideos || 0), 0);
  const totalNeutral = stats.reduce((sum, d) => sum + (d.neutralVideos || 0), 0);
  const totalRated = totalProductive + totalUnproductive + totalNeutral;
  const totalCompleted = stats.reduce((sum, d) => sum + (d.videosCompleted || 0), 0);
  const totalAbandoned = stats.reduce((sum, d) => sum + (d.videosAbandoned || 0), 0);
  const totalShorts = stats.reduce((sum, d) => sum + (d.shortsCount || 0), 0);
  const totalRecommendationClicks = stats.reduce((sum, d) => sum + (d.recommendationClicks || 0), 0);

  // Peak hours (aggregate hourly data)
  const hourlyTotals: Record<string, number> = {};
  for (let i = 0; i < 24; i++) hourlyTotals[i.toString()] = 0;

  stats.forEach((d) => {
    if (d.hourlySeconds) {
      Object.entries(d.hourlySeconds).forEach(([hour, secs]) => {
        hourlyTotals[hour] = (hourlyTotals[hour] || 0) + secs;
      });
    }
  });

  // Top 3 peak hours
  const peakHours = Object.entries(hourlyTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  // Top channels from video sessions
  const channelMap = new Map<string, number>();
  videoSessions.forEach((v) => {
    if (v.channel) {
      channelMap.set(v.channel, (channelMap.get(v.channel) || 0) + (v.watchedSeconds || 0));
    }
  });

  const topChannels = Array.from(channelMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([channel, seconds]) => ({ channel, minutes: Math.round(seconds / 60) }));

  const avgSessionSeconds = totalSessions > 0 ? totalSeconds / totalSessions : 0;

  return {
    avgDailyMinutes: Math.round(totalSeconds / 60 / daysWithData),
    avgDailyVideos: Math.round(totalVideos / daysWithData),
    avgSessionMinutes: Math.round(avgSessionSeconds / 60),
    totalDays: daysWithData,
    peakHours,
    topChannels,
    productivityRatio: totalRated > 0 ? Math.round((totalProductive / totalRated) * 100) : 0,
    recommendationRatio: totalVideos > 0 ? Math.round((totalRecommendationClicks / totalVideos) * 100) : 0,
    completionRate:
      totalCompleted + totalAbandoned > 0 ? Math.round((totalCompleted / (totalCompleted + totalAbandoned)) * 100) : 0,
    shortsRatio: totalVideos > 0 ? Math.round((totalShorts / totalVideos) * 100) : 0,
  };
}

// ===== Weekly Summary =====

export async function getWeeklySummary(): Promise<any> {
  const storage = await getStorage();
  const stats = storage.dailyStats;

  const days: DailyStats[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    if (stats[key]) {
      days.push(stats[key]);
    }
  }

  const thisWeek = days.reduce(
    (acc, day) => ({
      totalSeconds: acc.totalSeconds + day.totalSeconds,
      totalMinutes: acc.totalMinutes + Math.floor(day.totalSeconds / 60),
      videoCount: acc.videoCount + day.videoCount,
      shortsCount: acc.shortsCount + day.shortsCount,
      productiveVideos: acc.productiveVideos + day.productiveVideos,
      unproductiveVideos: acc.unproductiveVideos + day.unproductiveVideos,
      sessions: acc.sessions + day.sessionCount,
      avgSessionMinutes: 0,
      recommendationRatio: 0,
    }),
    {
      totalSeconds: 0,
      totalMinutes: 0,
      videoCount: 0,
      shortsCount: 0,
      productiveVideos: 0,
      unproductiveVideos: 0,
      sessions: 0,
      avgSessionMinutes: 0,
      recommendationRatio: 0,
    },
  );

  if (thisWeek.sessions > 0) {
    thisWeek.avgSessionMinutes = Math.floor(thisWeek.totalMinutes / thisWeek.sessions);
  }

  const channelMap = new Map<string, ChannelStat>();
  for (const day of days) {
    for (const ch of day.topChannels || []) {
      if (channelMap.has(ch.channel)) {
        const existing = channelMap.get(ch.channel)!;
        existing.minutes += ch.minutes;
        existing.videoCount += ch.videoCount;
      } else {
        channelMap.set(ch.channel, { ...ch });
      }
    }
  }

  const topChannels = Array.from(channelMap.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  const hourlyTotals: Record<string, number> = {};
  for (const day of days) {
    for (const [hour, seconds] of Object.entries(day.hourlySeconds || {})) {
      hourlyTotals[hour] = (hourlyTotals[hour] || 0) + seconds;
    }
  }

  const peakHours = Object.entries(hourlyTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  return {
    thisWeek,
    prevWeek: { ...thisWeek, totalSeconds: 0, totalMinutes: 0 },
    changePercent: 0,
    topChannels,
    peakHours,
    generatedAt: Date.now(),
  };
}
