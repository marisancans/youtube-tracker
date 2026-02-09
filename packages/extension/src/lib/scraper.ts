import type { VideoInfo, PageType } from '@yt-detox/shared'
import { parseDuration } from './utils'

export function getVideoInfo(): VideoInfo | null {
  const videoElement = document.querySelector('video')
  if (!videoElement) return null

  const videoId = new URLSearchParams(window.location.search).get('v')
  const isShort = window.location.pathname.startsWith('/shorts/')

  const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')
    || document.querySelector('h1.ytd-video-primary-info-renderer')
    || document.querySelector('#title h1')
  const title = titleEl?.textContent?.trim() || ''

  const channelEl = document.querySelector('#channel-name a')
    || document.querySelector('ytd-channel-name a')
  const channel = channelEl?.textContent?.trim() || ''

  const durationEl = document.querySelector('.ytp-time-duration')
  const durationText = durationEl?.textContent || '0:00'
  const durationSeconds = parseDuration(durationText)

  return {
    videoId: isShort ? window.location.pathname.split('/shorts/')[1] : videoId,
    title,
    channel,
    durationSeconds,
    currentTime: Math.round(videoElement.currentTime || 0),
    playbackSpeed: videoElement.playbackRate || 1,
    isPaused: videoElement.paused,
    isShort,
  }
}

export function getPageType(): PageType {
  const path = window.location.pathname
  if (path === '/' || path === '') return 'homepage'
  if (path === '/watch') return 'watch'
  if (path.startsWith('/shorts/')) return 'shorts'
  if (path === '/results') return 'search'
  if (path.startsWith('/feed/subscriptions')) return 'subscriptions'
  return 'other'
}

export function isAutoplayEnabled(): boolean {
  const toggle = document.querySelector('.ytp-autonav-toggle-button')
  return toggle?.getAttribute('aria-checked') === 'true'
}

export function getSearchQuery(): string {
  return new URLSearchParams(window.location.search).get('search_query') || ''
}

export function detectSource(): string {
  const referrer = document.referrer
  const pageType = getPageType()

  if (pageType === 'shorts') return 'shorts'
  if (referrer.includes('/results')) return 'search'
  if (referrer.includes('/feed/subscriptions')) return 'subscription'
  if (referrer.includes('youtube.com/watch')) return 'recommendation'
  if (referrer.includes('youtube.com')) return 'homepage'
  return 'direct'
}
