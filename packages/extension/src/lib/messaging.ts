import type { MessageType, Message, StatsResponse, Settings, WeeklySummary } from '@yt-detox/shared'

export function sendMessage<T = unknown>(type: MessageType, data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, data } as Message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        resolve(response as T)
      }
    })
  })
}

export async function getStats(): Promise<StatsResponse> {
  return sendMessage<StatsResponse>('GET_STATS')
}

export async function getSettings(): Promise<Settings> {
  return sendMessage<Settings>('GET_SETTINGS')
}

export async function updateSettings(settings: Partial<Settings>): Promise<{ success: boolean }> {
  return sendMessage<{ success: boolean }>('UPDATE_SETTINGS', settings)
}

export async function rateVideo(videoId: string, rating: number): Promise<{ success: boolean }> {
  return sendMessage<{ success: boolean }>('RATE_VIDEO', { videoId, rating })
}

export async function getWeeklySummary(): Promise<WeeklySummary> {
  return sendMessage<WeeklySummary>('GET_WEEKLY_SUMMARY')
}
