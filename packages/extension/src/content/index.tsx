import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTracker } from './tracker'
import { getPageType } from '@/lib/scraper'
import { getSettings } from '@/lib/messaging'
import globalStyles from '@/styles/globals.css?inline'

// Store prompt callback
let showPromptCallback: ((video: { videoId: string; title: string }) => void) | null = null

// Mount widget in Shadow DOM
function mountWidget() {
  const pageType = getPageType()
  if (pageType !== 'watch' && pageType !== 'shorts') {
    removeWidget()
    return
  }

  if (document.getElementById('yt-detox-host')) return

  // Create shadow host
  const host = document.createElement('div')
  host.id = 'yt-detox-host'
  host.style.cssText = `
    position: relative;
    z-index: 9999;
    margin-bottom: 16px;
  `

  // Attach shadow DOM
  const shadow = host.attachShadow({ mode: 'open' })

  // Inject styles
  const style = document.createElement('style')
  style.textContent = globalStyles
  shadow.appendChild(style)

  // Create React root container
  const container = document.createElement('div')
  container.id = 'yt-detox-root'
  shadow.appendChild(container)

  // Insert into page
  if (!insertWidget(host)) {
    waitForPlayer(host)
  }

  // Mount React
  const root = createRoot(container)
  root.render(
    <App 
      onPromptRequest={(callback) => {
        showPromptCallback = callback
      }}
    />
  )
}

function insertWidget(host: HTMLElement): boolean {
  const player = document.querySelector('#primary-inner > #player')
  if (player && player.parentElement) {
    player.parentElement.insertBefore(host, player)
    console.log('[YT Detox] Widget mounted before #player')
    return true
  }
  return false
}

function waitForPlayer(host: HTMLElement) {
  const observer = new MutationObserver((_, obs) => {
    if (insertWidget(host)) {
      obs.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), 15000)
}

function removeWidget() {
  const host = document.getElementById('yt-detox-host')
  if (host) {
    host.remove()
  }
}

// Handle productivity prompts
async function maybeShowPrompt(videoData: { 
  videoId: string
  title: string
  isShort: boolean
  watchedSeconds: number
  channel: string
}) {
  if (!videoData || videoData.isShort) return
  if (videoData.watchedSeconds < 10) return

  const settings = await getSettings()
  if (!settings.interventionsEnabled?.productivityPrompts) return

  // Whitelisted channels auto-rate as productive
  const whitelist = (settings.whitelistedChannels || []).map((c: string) => c.toLowerCase())
  if (videoData.channel && whitelist.includes(videoData.channel.toLowerCase())) {
    chrome.runtime.sendMessage({
      type: 'RATE_VIDEO',
      data: { videoId: videoData.videoId, rating: 1 },
    })
    return
  }

  // Random chance
  const chance = settings.productivityPromptChance || 0.3
  if (Math.random() > chance) return

  chrome.runtime.sendMessage({ type: 'PROMPT_SHOWN' })
  showPromptCallback?.({ videoId: videoData.videoId, title: videoData.title })
}

// Navigation observer for SPA
let lastUrl = window.location.href
function setupNavObserver() {
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      // Re-mount widget on navigation
      setTimeout(() => {
        removeWidget()
        mountWidget()
      }, 100)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

// Initialize
function init() {
  console.log('[YT Detox] Content script loaded')

  // Initialize tracker
  initTracker({
    onVideoFinished: maybeShowPrompt
  })

  // Mount widget
  mountWidget()
  
  // Watch for navigation
  setupNavObserver()
}

// Run
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
