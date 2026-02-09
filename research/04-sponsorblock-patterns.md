# SponsorBlock Code Patterns

Extracted from `ajayyy/SponsorBlock` and `ajayyy/maze-utils` (MIT License).
These are battle-tested patterns used by an extension with 10M+ users.

## 1. YouTube Domains

```typescript
const YT_DOMAINS = [
  "m.youtube.com",
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "music.youtube.com",
  "www.youtubekids.com",
  "tv.youtube.com"
]
```

## 2. Page Types

```typescript
enum PageType {
  Unknown = "unknown",
  Shorts = "shorts",
  Watch = "watch",
  Search = "search",
  Browse = "browse",
  Channel = "channel",
  Embed = "embed"
}

function onVideoPage() {
  return !!document.URL.match(/\/watch|\/shorts|\/live|\/embed/);
}
```

## 3. Video ID Extraction

```typescript
// From URL
function getYouTubeVideoIDFromURL(url: string): VideoID | null {
  let urlObject: URL;
  try {
    urlObject = new URL(url);
  } catch {
    return null;
  }
  
  // Handle different URL formats
  // /watch?v=VIDEO_ID
  // /shorts/VIDEO_ID
  // /embed/VIDEO_ID
  // /live/VIDEO_ID
}

// From DOM (for embeds, channel trailers)
const embedTitleSelector = "a.ytp-title-link[data-sessionlink='feature=player-title']";
const channelTrailerSelector = "ytd-channel-video-player-renderer a.ytp-title-link";
```

## 4. Thumbnail Selectors (CRITICAL)

### Desktop
```typescript
const brandingBoxSelector = `
  ytd-rich-grid-media,
  ytd-video-renderer,
  ytd-compact-video-renderer,
  ytd-playlist-video-renderer,
  ytd-playlist-panel-video-renderer,
  ytd-grid-video-renderer,
  ytd-reel-item-renderer,
  ytd-compact-playlist-renderer,
  ytd-playlist-renderer,
  yt-lockup-view-model
`;

// Thumbnail elements
const thumbnailElements = [
  "ytd-thumbnail",
  "ytd-playlist-thumbnail",
  "yt-thumbnail-view-model"
];

// Thumbnail images
const thumbnailImageSelector = `
  ytd-thumbnail:not([hidden]) img,
  ytd-playlist-thumbnail yt-image:not(.blurred-image) img,
  yt-thumbnail-view-model *:not(.ytThumbnailViewModelBlurredImage) img
`;
```

### Mobile
```typescript
const mobileBrandingBoxSelector = `
  ytm-video-with-context-renderer,
  ytm-compact-video-renderer,
  ytm-reel-item-renderer,
  ytm-playlist-video-renderer,
  ytm-shorts-lockup-view-model
`;

const mobileThumbnailElements = [
  ".media-item-thumbnail-container",
  ".video-thumbnail-container-compact",
  "ytm-thumbnail-cover"
];
```

## 5. Controls Selectors

```typescript
const controlsSelectors = [
  ".ytp-right-controls",           // YouTube desktop
  ".player-controls-top",          // Mobile YouTube
  ".vjs-control-bar",              // Invidious/videojs
  ".ypcs-control-buttons-right"    // tv.youtube.com
];
```

## 6. Video Element Detection

```typescript
function isVisible(element: HTMLElement | null): boolean {
  if (!element) return false;
  
  // Special case: main video element might be "hidden" initially
  if (element.tagName === "VIDEO" 
      && (element.classList.contains("html5-main-video") || element.id === "player")
      && [...document.querySelectorAll("video")].filter((v) => v.duration).length === 1
      && (element as HTMLVideoElement).duration) {
    return true;
  }
  
  if (element.offsetHeight === 0 || element.offsetWidth === 0) {
    return false;
  }
  
  // Check if element is actually at that point (not covered)
  const boundingRect = element.getBoundingClientRect();
  const elementAtPoint = document.elementFromPoint(
    boundingRect.left + boundingRect.width / 2,
    boundingRect.top + boundingRect.height / 2
  );
  
  return elementAtPoint === element || element.contains(elementAtPoint);
}
```

## 7. waitForElement Pattern

```typescript
async function waitForElement(selector: string, visibleCheck = false): Promise<Element> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element && (!visibleCheck || isVisible(element))) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element && (!visibleCheck || isVisible(element))) {
        obs.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  });
}
```

## 8. Thumbnail Listener with MutationObserver

```typescript
const handledThumbnails = new Map<HTMLElement, MutationObserver>();

function newThumbnails() {
  const thumbnails = document.querySelectorAll(getThumbnailSelector());
  const newOnes: HTMLElement[] = [];
  
  for (const thumbnail of thumbnails) {
    if (!handledThumbnails.has(thumbnail)) {
      newOnes.push(thumbnail);
      
      // Watch for href changes (video changes in same thumbnail)
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "href") {
            // Thumbnail video changed
            processThumbnail(thumbnail);
          }
        }
      });
      
      const link = thumbnail.querySelector("a");
      if (link) observer.observe(link, { attributes: true });
      
      handledThumbnails.set(thumbnail, observer);
    }
  }
  
  processThumbnails(newOnes);
}
```

## 9. Navigation API for SPA Detection

```typescript
// Modern Navigation API (better than MutationObserver for URL changes)
if ("navigation" in window) {
  window.navigation.addEventListener("navigate", (e) => {
    const url = e.destination.url;
    handlePageChange(url);
  });
}
```

## 10. getThumbnailLink (extract video info from thumbnail)

```typescript
function getThumbnailLink(thumbnail: HTMLElement): HTMLElement | null {
  return thumbnail.querySelector([
    "ytd-thumbnail a",
    "ytd-playlist-thumbnail a",
    "a.media-item-thumbnail-container",
    "a.reel-item-endpoint"
  ].join(", "));
}

// Extract video ID from thumbnail link
function getVideoIDFromThumbnail(thumbnail: HTMLElement): string | null {
  const link = getThumbnailLink(thumbnail);
  if (!link) return null;
  
  const href = link.getAttribute("href");
  if (!href) return null;
  
  // Parse /watch?v=XXX or /shorts/XXX
  const match = href.match(/[?&]v=([^&]+)/) || href.match(/\/shorts\/([^/?]+)/);
  return match ? match[1] : null;
}
```

## 11. Checking for Inline Preview Player

```typescript
function isInPreviewPlayer(element: Element): boolean {
  return !!element.closest("#inline-preview-player");
}
```

## 12. Garbage Collection for Observers

```typescript
// Periodically clean up observers for removed elements
if (performance.now() - lastGarbageCollection > 5000) {
  for (const [thumbnail, observer] of handledThumbnails) {
    if (!document.body.contains(thumbnail)) {
      observer.disconnect();
      handledThumbnails.delete(thumbnail);
    }
  }
  lastGarbageCollection = performance.now();
}
```

## 13. waitFor Utility

```typescript
async function waitFor<T>(
  condition: () => T,
  timeout = 5000,
  checkInterval = 100
): Promise<T> {
  return new Promise((resolve, reject) => {
    const intervalCheck = () => {
      const result = condition();
      if (result) {
        resolve(result);
        clearInterval(interval);
      }
    };
    
    const interval = setInterval(intervalCheck, checkInterval);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error("Timeout"));
    }, timeout);
    
    intervalCheck(); // Run once immediately
  });
}
```

## Key Takeaways for Our Extension

1. **Use MutationObserver** for thumbnail tracking, not polling
2. **Use Navigation API** for URL changes (SPA navigation)
3. **Check visibility** before assuming element is valid
4. **Handle both desktop and mobile** selectors
5. **Garbage collect** observers to prevent memory leaks
6. **Use specific selectors** — they've identified exactly which elements matter
7. **waitForElement** is essential for async DOM
8. **Debounce thumbnail checks** (50ms in their code)
