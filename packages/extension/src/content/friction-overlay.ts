/**
 * Friction Overlay - Video player "Worth your time?" prompt
 *
 * Covers only the video player with a glassmorphism overlay.
 * Pauses the video until the user rates.
 */

const OVERLAY_ID = 'yt-detox-friction-overlay';

let resolveRating: ((rating: -1 | 0 | 1) => void) | null = null;

function getVideoContainer(): HTMLElement | null {
  // Try different selectors for video player container
  return (
    document.querySelector('#movie_player') ||
    document.querySelector('.html5-video-player') ||
    document.querySelector('ytd-player') ||
    document.querySelector('#player-container-inner')
  ) as HTMLElement | null;
}

function pauseVideo(): void {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  if (video && !video.paused) {
    video.pause();
  }
}

function removeOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
  }
}

/**
 * Show a friction overlay over the video player.
 * Returns a promise that resolves with the rating.
 */
export function showFrictionOverlay(videoTitle: string): Promise<-1 | 0 | 1> {
  // Don't stack overlays
  if (document.getElementById(OVERLAY_ID)) {
    return Promise.resolve(0);
  }

  const container = getVideoContainer();
  if (!container) {
    console.warn('[YT Detox] Could not find video container for friction overlay');
    return Promise.resolve(0);
  }

  pauseVideo();

  return new Promise((resolve) => {
    resolveRating = resolve;

    // Ensure container has relative positioning for absolute child
    const originalPosition = container.style.position;
    if (!container.style.position || container.style.position === 'static') {
      container.style.position = 'relative';
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      transition: opacity 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const truncatedTitle = videoTitle.length > 60 ? videoTitle.slice(0, 60) + '...' : videoTitle;

    overlay.innerHTML = `
      <div style="
        max-width: 400px;
        width: 90%;
        padding: 24px;
        background: rgba(30, 41, 59, 0.9);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
        text-align: center;
        transform: scale(0.95);
        transition: transform 0.2s ease;
      " id="yt-detox-friction-card">
        <div style="font-size: 32px; margin-bottom: 12px;">🧠</div>
        <div style="
          font-size: 18px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 6px;
        ">Was this worth your time?</div>
        <div style="
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 20px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        " title="${videoTitle.replace(/"/g, '&quot;')}">${truncatedTitle}</div>

        <div style="display: flex; gap: 8px; justify-content: center;">
          <button data-rating="1" style="
            flex: 1;
            padding: 12px 16px;
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            border: none;
            border-radius: 12px;
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s ease, opacity 0.1s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
          ">
            <span style="font-size: 20px;">👍</span>
            <span>Productive</span>
          </button>

          <button data-rating="0" style="
            flex: 1;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s ease, opacity 0.1s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
          ">
            <span style="font-size: 20px;">😐</span>
            <span>Neutral</span>
          </button>

          <button data-rating="-1" style="
            flex: 1;
            padding: 12px 16px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            border: none;
            border-radius: 12px;
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s ease, opacity 0.1s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
          ">
            <span style="font-size: 20px;">👎</span>
            <span>Wasted</span>
          </button>
        </div>
      </div>
    `;

    // Button hover and click handlers
    overlay.querySelectorAll('button[data-rating]').forEach((btn) => {
      const button = btn as HTMLButtonElement;
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.05)';
        button.style.opacity = '0.9';
      });
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.opacity = '1';
      });
      button.addEventListener('click', () => {
        const rating = parseInt(button.dataset.rating!, 10) as -1 | 0 | 1;
        // Restore container position
        if (originalPosition) {
          container.style.position = originalPosition;
        }
        removeOverlay();
        if (resolveRating) {
          resolveRating(rating);
          resolveRating = null;
        }
      });
    });

    container.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      const card = document.getElementById('yt-detox-friction-card');
      if (card) card.style.transform = 'scale(1)';
    });
  });
}

/**
 * Check if the friction overlay is currently showing.
 */
export function isFrictionOverlayVisible(): boolean {
  return !!document.getElementById(OVERLAY_ID);
}
