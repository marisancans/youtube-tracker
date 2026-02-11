import type { MessageType, Message, StatsResponse, Settings, WeeklySummary } from '@yt-detox/shared';

/**
 * Check if the extension context is still valid.
 * Returns false after extension reload/update when old content scripts are still running.
 */
export function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export function sendMessage<T = unknown>(type: MessageType, data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!isContextValid()) {
      reject(new Error('Extension context invalidated'));
      return;
    }
    try {
      chrome.runtime.sendMessage({ type, data } as Message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response as T);
        }
      });
    } catch {
      reject(new Error('Extension context invalidated'));
    }
  });
}

/**
 * Fire-and-forget message send that silently ignores "Extension context invalidated" errors.
 * Use this for non-critical messages (tracking events, page load/unload, etc.)
 */
export function safeSendMessage(type: string, data?: unknown): void {
  if (!isContextValid()) return;
  try {
    chrome.runtime.sendMessage({ type, data } as Message, () => {
      // Consume lastError to prevent console warnings
      void chrome.runtime.lastError;
    });
  } catch {
    // Extension context invalidated — content script is stale, ignore
  }
}

/**
 * Send a message and get a response, with callback. Silently handles context invalidation.
 * Use this for messages where you need the response (GET_STATS, GET_SETTINGS, etc.)
 */
export function safeSendMessageWithCallback<T = unknown>(
  type: string,
  data: unknown,
  callback: (response: T) => void,
): void {
  if (!isContextValid()) return;
  try {
    chrome.runtime.sendMessage({ type, data } as Message, (response) => {
      if (chrome.runtime.lastError) return;
      callback(response as T);
    });
  } catch {
    // Extension context invalidated
  }
}

export async function getStats(): Promise<StatsResponse> {
  return sendMessage<StatsResponse>('GET_STATS');
}

export async function getSettings(): Promise<Settings> {
  return sendMessage<Settings>('GET_SETTINGS');
}

export async function updateSettings(settings: Partial<Settings>): Promise<{ success: boolean }> {
  return sendMessage<{ success: boolean }>('UPDATE_SETTINGS', settings);
}

export async function rateVideo(videoId: string, rating: number): Promise<{ success: boolean }> {
  return sendMessage<{ success: boolean }>('RATE_VIDEO', { videoId, rating });
}

export async function getWeeklySummary(): Promise<WeeklySummary> {
  return sendMessage<WeeklySummary>('GET_WEEKLY_SUMMARY');
}
