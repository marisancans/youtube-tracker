import { getVideoInfo, getPageType, isAutoplayEnabled, getSearchQuery, detectSource } from '@/lib/scraper'

interface CurrentVideo {
  videoId: string
  title: string
  channel: string
  durationSeconds: number
  playbackSpeed: number
  isShort: boolean
  source: string
  startedAt: number
  watchedSeconds: number
}

interface TrackerCallbacks {
  onVideoFinished: (video: {
    videoId: string
    title: string
    channel: string
    durationSeconds: number
    watchedSeconds: number
    source: string
    isShort: boolean
    playbackSpeed: number
  }) => void
}

let currentVideo: CurrentVideo | null = null
let videoStartTime: number | null = null
let lastUrl = window.location.href

export function initTracker(callbacks: TrackerCallbacks) {
  console.log('[YT Detox] Tracker initialized')
  
  chrome.runtime.sendMessage({ type: 'PAGE_LOAD', data: { url: window.location.href } })

  setupNavigationObserver(callbacks)
  setupVideoObserver(callbacks)
  setupVisibilityTracking()
  setupClickTracking()

  handlePageChange(callbacks)
}

function setupNavigationObserver(callbacks: TrackerCallbacks) {
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      const oldUrl = lastUrl
      lastUrl = window.location.href
      handlePageChange(callbacks, oldUrl)
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })

  window.addEventListener('popstate', () => {
    if (window.location.href !== lastUrl) {
      const oldUrl = lastUrl
      lastUrl = window.location.href
      handlePageChange(callbacks, oldUrl)
    }
  })
}

function setupVideoObserver(callbacks: TrackerCallbacks) {
  const checkVideo = setInterval(() => {
    const video = document.querySelector('video')
    if (video && !video.hasAttribute('data-detox-tracked')) {
      video.setAttribute('data-detox-tracked', 'true')
      attachVideoListeners(video, callbacks)
      clearInterval(checkVideo)
    }
  }, 500)

  setTimeout(() => clearInterval(checkVideo), 30000)
}

function attachVideoListeners(video: HTMLVideoElement, callbacks: TrackerCallbacks) {
  video.addEventListener('play', () => onVideoPlay())
  video.addEventListener('pause', () => onVideoPause())
  video.addEventListener('ended', () => onVideoEnded(callbacks))
  console.log('[YT Detox] Video listeners attached')
}

function onVideoPlay() {
  const info = getVideoInfo()
  if (!info || !info.videoId) return

  if (!currentVideo || currentVideo.videoId !== info.videoId) {
    if (currentVideo) {
      // Finish previous video silently
      if (videoStartTime) {
        currentVideo.watchedSeconds += (Date.now() - videoStartTime) / 1000
        videoStartTime = null
      }
    }

    currentVideo = {
      videoId: info.videoId,
      title: info.title,
      channel: info.channel,
      durationSeconds: info.durationSeconds,
      playbackSpeed: info.playbackSpeed,
      isShort: info.isShort,
      source: detectSource(),
      startedAt: Date.now(),
      watchedSeconds: 0,
    }
    videoStartTime = Date.now()
    console.log('[YT Detox] Video started:', info.title?.substring(0, 40))
  } else {
    videoStartTime = Date.now()
  }
}

function onVideoPause() {
  if (currentVideo && videoStartTime) {
    currentVideo.watchedSeconds += (Date.now() - videoStartTime) / 1000
    videoStartTime = null
  }
}

function onVideoEnded(callbacks: TrackerCallbacks) {
  finishCurrentVideo(callbacks)
  if (isAutoplayEnabled()) {
    chrome.runtime.sendMessage({ type: 'AUTOPLAY_PENDING' })
  }
}

function finishCurrentVideo(callbacks: TrackerCallbacks) {
  if (!currentVideo) return

  if (videoStartTime) {
    currentVideo.watchedSeconds += (Date.now() - videoStartTime) / 1000
  }

  const videoData = {
    videoId: currentVideo.videoId,
    title: currentVideo.title,
    channel: currentVideo.channel,
    durationSeconds: currentVideo.durationSeconds,
    watchedSeconds: Math.round(currentVideo.watchedSeconds),
    source: currentVideo.source,
    isShort: currentVideo.isShort,
    playbackSpeed: currentVideo.playbackSpeed,
  }

  chrome.runtime.sendMessage({ type: 'VIDEO_WATCHED', data: videoData })
  callbacks.onVideoFinished(videoData)

  currentVideo = null
  videoStartTime = null
}

function handlePageChange(callbacks: TrackerCallbacks, oldUrl?: string) {
  const pageType = getPageType()
  console.log('[YT Detox] Page:', pageType)

  if (oldUrl?.includes('/watch') || oldUrl?.includes('/shorts/')) {
    finishCurrentVideo(callbacks)
  }

  if (pageType === 'search') {
    const query = getSearchQuery()
    if (query) chrome.runtime.sendMessage({ type: 'SEARCH', data: { query } })
  }

  if (pageType === 'watch' || pageType === 'shorts') {
    setupVideoObserver(callbacks)
  }

  if (pageType === 'watch' && oldUrl?.includes('/watch')) {
    chrome.runtime.sendMessage({ type: 'RECOMMENDATION_CLICK' })
  }
}

function setupVisibilityTracking() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (currentVideo && videoStartTime) {
        currentVideo.watchedSeconds += (Date.now() - videoStartTime) / 1000
        videoStartTime = null
      }
      chrome.runtime.sendMessage({ type: 'TAB_HIDDEN' })
    } else {
      if (currentVideo) videoStartTime = Date.now()
      chrome.runtime.sendMessage({ type: 'TAB_VISIBLE' })
    }
  })

  window.addEventListener('beforeunload', () => {
    if (currentVideo) {
      if (videoStartTime) {
        currentVideo.watchedSeconds += (Date.now() - videoStartTime) / 1000
      }
      chrome.runtime.sendMessage({
        type: 'VIDEO_WATCHED',
        data: {
          videoId: currentVideo.videoId,
          title: currentVideo.title,
          channel: currentVideo.channel,
          durationSeconds: currentVideo.durationSeconds,
          watchedSeconds: Math.round(currentVideo.watchedSeconds),
          source: currentVideo.source,
          isShort: currentVideo.isShort,
          playbackSpeed: currentVideo.playbackSpeed,
        }
      })
    }
    chrome.runtime.sendMessage({ type: 'PAGE_UNLOAD' })
  })
}

function setupClickTracking() {
  document.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('a')
    if (!target) return

    const isRecommendation =
      target.closest('ytd-compact-video-renderer') ||
      target.closest('ytd-rich-item-renderer') ||
      target.closest('ytd-video-renderer')

    if (isRecommendation && (target as HTMLAnchorElement).href?.includes('/watch')) {
      chrome.runtime.sendMessage({ type: 'RECOMMENDATION_CLICK' })
    }
  }, true)
}
