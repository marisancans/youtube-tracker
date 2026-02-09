/**
 * YouTube page scraping utilities
 */

import type { VideoInfo, PageType } from '@yt-detox/shared';

export function getPageType(): PageType {
  const path = window.location.pathname;
  const search = window.location.search;
  
  if (path === '/' || path === '/feed/trending' || path === '/feed/explore') return 'homepage';
  if (path === '/watch' || search.includes('v=')) return 'watch';
  if (path.startsWith('/shorts')) return 'shorts';
  if (path === '/results' || search.includes('search_query=')) return 'search';
  if (path === '/feed/subscriptions') return 'subscriptions';
  if (path === '/feed/history') return 'history';
  if (path.startsWith('/@') || path.startsWith('/channel') || path.startsWith('/c/')) return 'channel';
  return 'other';
}

export function getVideoId(): string | null {
  const url = new URL(window.location.href);
  if (url.pathname.startsWith('/shorts/')) {
    return url.pathname.split('/shorts/')[1]?.split('/')[0] || null;
  }
  return url.searchParams.get('v');
}

export function scrapeVideoInfo(): VideoInfo | null {
  const videoElement = document.querySelector('video') as HTMLVideoElement | null;
  const isShorts = window.location.pathname.startsWith('/shorts');
  
  // Get title
  let title = '';
  if (isShorts) {
    const titleEl = document.querySelector('yt-shorts-video-title-view-model h2');
    title = titleEl?.textContent?.trim() || '';
  } else {
    const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
                    document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                    document.querySelector('#title h1 yt-formatted-string');
    title = titleEl?.textContent?.trim() || '';
  }
  
  // Get channel
  let channel = '';
  let channelId: string | undefined;
  if (isShorts) {
    const channelEl = document.querySelector('ytd-channel-name yt-formatted-string a');
    channel = channelEl?.textContent?.trim() || '';
    channelId = channelEl?.getAttribute('href')?.replace(/^\/@?/, '').replace(/^channel\//, '');
  } else {
    const channelEl = document.querySelector('#owner #channel-name a') ||
                      document.querySelector('#owner ytd-channel-name a') ||
                      document.querySelector('ytd-video-owner-renderer ytd-channel-name a');
    channel = channelEl?.textContent?.trim() || '';
    channelId = channelEl?.getAttribute('href')?.replace(/^\/@?/, '').replace(/^channel\//, '');
  }
  
  // Get duration
  let durationSeconds = 0;
  if (videoElement && videoElement.duration && !isNaN(videoElement.duration)) {
    durationSeconds = Math.floor(videoElement.duration);
  } else {
    const durationEl = document.querySelector('.ytp-time-duration');
    if (durationEl) {
      const parts = durationEl.textContent?.split(':').map(Number) || [];
      if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];
      if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  
  const currentTime = videoElement?.currentTime || 0;
  const playbackSpeed = videoElement?.playbackRate || 1;
  const isPaused = videoElement?.paused ?? true;
  
  return {
    videoId: getVideoId(),
    title,
    channel,
    channelId,
    durationSeconds,
    currentTime,
    playbackSpeed,
    isPaused,
    isShort: isShorts,
    category: inferCategory(title, channel),
  };
}

function inferCategory(title: string, channel: string): string | undefined {
  const text = `${title} ${channel}`.toLowerCase();
  
  const keywords: Record<string, string[]> = {
    education: ['tutorial', 'learn', 'course', 'lecture', 'explained', 'how to', 'documentary', 'science'],
    entertainment: ['funny', 'comedy', 'prank', 'meme', 'react', 'vlog', 'challenge'],
    music: ['music', 'song', 'official video', 'lyrics', 'album', 'concert', 'cover'],
    gaming: ['gameplay', 'playthrough', 'gaming', 'stream', 'esports', 'minecraft', 'fortnite'],
    news: ['news', 'breaking', 'update', 'report', 'politics', 'election'],
    tech: ['review', 'unboxing', 'tech', 'iphone', 'android', 'computer', 'software'],
    fitness: ['workout', 'exercise', 'fitness', 'yoga', 'gym', 'training'],
    cooking: ['recipe', 'cooking', 'food', 'chef', 'kitchen', 'baking'],
  };
  
  for (const [category, words] of Object.entries(keywords)) {
    if (words.some(word => text.includes(word))) {
      return category;
    }
  }
  
  return undefined;
}

export function getThumbnails(): NodeListOf<Element> {
  return document.querySelectorAll('ytd-thumbnail:not(.ytd-thumbnail-overlay-time-status-renderer)');
}

export function getRecommendations(): NodeListOf<Element> {
  return document.querySelectorAll(
    'ytd-compact-video-renderer, ' +
    'ytd-grid-video-renderer, ' +
    'ytd-rich-grid-media, ' +
    '.ytp-videowall-still'
  );
}

export function isAutoplayCountdownActive(): boolean {
  const countdown = document.querySelector('.ytp-autonav-endscreen-countdown');
  return countdown !== null && !countdown.classList.contains('ytp-autonav-endscreen-countdown-hidden');
}

export function getSearchQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('search_query');
}
