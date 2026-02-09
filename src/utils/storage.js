/**
 * Storage utilities for YouTube Detox
 * All data stays local - privacy first
 */

const STORAGE_KEYS = {
  SESSIONS: 'sessions',
  VIDEOS: 'videos',
  DAILY_STATS: 'dailyStats',
  SETTINGS: 'settings',
  BASELINE: 'baseline',
  CURRENT_SESSION: 'currentSession',
};

/**
 * Get data from chrome.storage.local
 */
export async function get(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

/**
 * Set data in chrome.storage.local
 */
export async function set(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

/**
 * Get multiple keys at once
 */
export async function getMany(keys) {
  return chrome.storage.local.get(keys);
}

/**
 * Append to an array in storage
 */
export async function append(key, item, maxItems = 10000) {
  const existing = (await get(key)) || [];
  existing.push(item);
  
  // Trim old entries if over limit
  if (existing.length > maxItems) {
    existing.splice(0, existing.length - maxItems);
  }
  
  return set(key, existing);
}

/**
 * Update daily stats
 */
export async function updateDailyStats(date, updates) {
  const stats = (await get(STORAGE_KEYS.DAILY_STATS)) || {};
  const today = stats[date] || {
    totalSeconds: 0,
    videoCount: 0,
    shortsCount: 0,
    searchCount: 0,
    recommendationClicks: 0,
    autoplayCount: 0,
    sessions: 0,
  };
  
  Object.keys(updates).forEach(key => {
    if (typeof updates[key] === 'number') {
      today[key] = (today[key] || 0) + updates[key];
    } else {
      today[key] = updates[key];
    }
  });
  
  stats[date] = today;
  return set(STORAGE_KEYS.DAILY_STATS, stats);
}

/**
 * Get today's date string (YYYY-MM-DD)
 */
export function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Export all data as JSON (for user download)
 */
export async function exportAll() {
  const data = await chrome.storage.local.get(null);
  return JSON.stringify(data, null, 2);
}

/**
 * Clear all data
 */
export async function clearAll() {
  return chrome.storage.local.clear();
}

/**
 * Get storage usage info
 */
export async function getUsage() {
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  return {
    bytesUsed: bytesInUse,
    bytesTotal: chrome.storage.local.QUOTA_BYTES,
    percentUsed: ((bytesInUse / chrome.storage.local.QUOTA_BYTES) * 100).toFixed(2),
  };
}

export { STORAGE_KEYS };
