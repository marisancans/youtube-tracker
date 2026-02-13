/**
 * Merges in-flight live session data into dailyStats for display.
 * Used by Dashboard and Settings so they show current session activity
 * even before the content script flushes on PAGE_UNLOAD.
 */

const STALE_THRESHOLD = 60_000; // 60 seconds

interface LiveData {
  liveSession?: {
    activeDurationSeconds?: number;
    backgroundSeconds?: number;
    totalDurationSeconds?: number;
    videosWatched?: number;
    shortsCount?: number;
    totalScrollPixels?: number;
    thumbnailsHovered?: number;
    thumbnailsClicked?: number;
  } | null;
  liveTemporal?: {
    hourlySeconds?: Record<string, number>;
  } | null;
  liveSessionUpdatedAt?: number;
}

interface DailyStats {
  totalSeconds: number;
  activeSeconds?: number;
  backgroundSeconds?: number;
  videoCount: number;
  shortsCount?: number;
  totalScrollPixels?: number;
  thumbnailsHovered?: number;
  thumbnailsClicked?: number;
  sessionCount?: number;
  hourlySeconds?: Record<string, number>;
  [key: string]: any;
}

export function mergeLiveStats(
  flushed: DailyStats | undefined,
  live: LiveData,
): DailyStats | undefined {
  if (!flushed) return flushed;

  const { liveSession, liveTemporal, liveSessionUpdatedAt } = live;
  if (!liveSession || !liveSessionUpdatedAt) return flushed;

  // Stale guard — don't merge if data is older than 60s
  if (Date.now() - liveSessionUpdatedAt > STALE_THRESHOLD) return flushed;

  const merged = { ...flushed };

  merged.totalSeconds = (flushed.totalSeconds || 0) + (liveSession.totalDurationSeconds || 0);
  merged.activeSeconds = (flushed.activeSeconds || 0) + (liveSession.activeDurationSeconds || 0);
  merged.backgroundSeconds = (flushed.backgroundSeconds || 0) + (liveSession.backgroundSeconds || 0);
  merged.videoCount = (flushed.videoCount || 0) + (liveSession.videosWatched || 0);
  merged.shortsCount = (flushed.shortsCount || 0) + (liveSession.shortsCount || 0);
  merged.totalScrollPixels = (flushed.totalScrollPixels || 0) + (liveSession.totalScrollPixels || 0);
  merged.thumbnailsHovered = (flushed.thumbnailsHovered || 0) + (liveSession.thumbnailsHovered || 0);
  merged.thumbnailsClicked = (flushed.thumbnailsClicked || 0) + (liveSession.thumbnailsClicked || 0);

  // Merge hourly seconds
  if (liveTemporal?.hourlySeconds) {
    const hourly = { ...(flushed.hourlySeconds || {}) };
    for (const [hr, secs] of Object.entries(liveTemporal.hourlySeconds)) {
      hourly[hr] = (hourly[hr] || 0) + secs;
    }
    merged.hourlySeconds = hourly;
  }

  return merged;
}
