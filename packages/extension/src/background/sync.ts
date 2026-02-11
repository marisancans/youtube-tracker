/**
 * Backend Sync Logic
 *
 * Security: Uses Google OAuth Bearer token for authentication
 */

import { getStorage, saveStorage, EMPTY_EVENT_QUEUES } from './storage';
import { getAuthState } from './auth';

// ===== Unified Backend Sync =====

export async function syncToBackend(): Promise<boolean> {
  const storage = await getStorage();
  const settings = storage.settings;

  if (!settings.backend.enabled || !settings.backend.url) {
    return false;
  }

  if (storage.syncState.syncInProgress) {
    return false;
  }

  // Get productive URLs from storage
  const allData = await chrome.storage.local.get(['productiveUrls']);
  const productiveUrls = allData.productiveUrls || [];

  // Check if there's anything to sync
  const hasData =
    storage.videoSessions.length > 0 ||
    storage.browserSessions.length > 0 ||
    Object.keys(storage.dailyStats).length > 0 ||
    storage.pendingEvents.scroll.length > 0 ||
    storage.pendingEvents.thumbnail.length > 0 ||
    storage.pendingEvents.page.length > 0 ||
    storage.pendingEvents.video_watch.length > 0 ||
    storage.pendingEvents.recommendation.length > 0 ||
    storage.pendingEvents.intervention.length > 0 ||
    storage.pendingEvents.mood.length > 0 ||
    productiveUrls.length > 0;

  if (!hasData) {
    return true;
  }

  storage.syncState.syncInProgress = true;
  await saveStorage({ syncState: storage.syncState });

  // Get auth state for Bearer token (optional in dev mode)
  const authState = await getAuthState();
  const userId = authState.user?.id || settings.backend.userId || 'dev-user';

  try {
    // Build unified sync request
    const syncRequest = {
      userId,
      lastSyncTime: storage.syncState.lastSyncTime,
      data: {
        videoSessions: storage.videoSessions.slice(-100),
        browserSessions: storage.browserSessions.slice(-50),
        dailyStats: storage.dailyStats,
        scrollEvents: storage.pendingEvents.scroll,
        thumbnailEvents: storage.pendingEvents.thumbnail,
        pageEvents: storage.pendingEvents.page,
        videoWatchEvents: storage.pendingEvents.video_watch,
        recommendationEvents: storage.pendingEvents.recommendation,
        interventionEvents: storage.pendingEvents.intervention,
        moodReports: storage.pendingEvents.mood,
        productiveUrls: productiveUrls,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    };
    if (authState.token) {
      headers['Authorization'] = `Bearer ${authState.token}`;
    }

    const response = await fetch(`${settings.backend.url}/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(syncRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[YT Detox] Sync failed:', errorText);
      storage.syncState.retryCount++;
      chrome.storage.local.set({
        lastSyncResult: { success: false, error: errorText, timestamp: Date.now() },
      });
      return false;
    }

    const result = await response.json();

    // Clear synced data
    storage.pendingEvents = { ...EMPTY_EVENT_QUEUES };
    storage.syncState.lastSyncTime = result.lastSyncTime;
    storage.syncState.retryCount = 0;
    settings.backend.lastSync = Date.now();

    await saveStorage({
      settings,
      pendingEvents: storage.pendingEvents,
      syncState: storage.syncState,
    });

    console.log('[YT Detox] Sync successful:', result.syncedCounts);
    chrome.storage.local.set({
      lastSyncResult: { success: true, syncedCounts: result.syncedCounts, timestamp: Date.now() },
    });
    return true;
  } catch (error) {
    console.error('[YT Detox] Sync error:', error);
    storage.syncState.retryCount++;
    chrome.storage.local.set({
      lastSyncResult: { success: false, error: String(error), timestamp: Date.now() },
    });
    return false;
  } finally {
    storage.syncState.syncInProgress = false;
    await saveStorage({ syncState: storage.syncState });
  }
}

// ===== Event Queue Management =====

export async function queueEvents(events: Record<string, any[]>): Promise<void> {
  const storage = await getStorage();

  for (const [eventType, eventList] of Object.entries(events)) {
    if (eventList && eventList.length > 0 && eventType in storage.pendingEvents) {
      (storage.pendingEvents as any)[eventType].push(...eventList);
    }
  }

  // Keep queues bounded
  const maxQueueSize = 500;
  for (const eventType of Object.keys(storage.pendingEvents)) {
    const queue = (storage.pendingEvents as any)[eventType];
    if (queue.length > maxQueueSize) {
      (storage.pendingEvents as any)[eventType] = queue.slice(-maxQueueSize);
    }
  }

  await saveStorage({ pendingEvents: storage.pendingEvents });
}

// ===== Get Sync Status =====

export async function getSyncStatus(): Promise<{
  lastSyncTime: number;
  pendingCounts: Record<string, number>;
  syncInProgress: boolean;
}> {
  const storage = await getStorage();

  const pendingCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(storage.pendingEvents)) {
    pendingCounts[key] = value.length;
  }

  return {
    lastSyncTime: storage.syncState.lastSyncTime,
    pendingCounts,
    syncInProgress: storage.syncState.syncInProgress,
  };
}

// ===== Periodic Sync =====

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startPeriodicSync(intervalMs: number = 5 * 60 * 1000): void {
  // Default: sync every 5 minutes
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(async () => {
    const storage = await getStorage();
    if (storage.settings.backend.enabled) {
      await syncToBackend();
    }
  }, intervalMs);

  // Also create a Chrome alarm as backup
  chrome.alarms.create('syncToBackend', { periodInMinutes: 5 });
}

export function stopPeriodicSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  chrome.alarms.clear('syncToBackend');
}

// ===== Alarm Handler =====

export async function handleSyncAlarm(): Promise<void> {
  const storage = await getStorage();
  if (storage.settings.backend.enabled) {
    await syncToBackend();
  }
}
