/**
 * Friction Overlay - Full-screen "Worth your time?" prompt
 *
 * Mounts directly on document.body (not in shadow DOM) to cover the entire viewport.
 * Pauses the video and blurs the page until the user rates.
 */

const OVERLAY_ID = 'yt-detox-friction-overlay';

let resolveRating: ((rating: -1 | 0 | 1) => void) | null = null;

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
    setTimeout(() => overlay.remove(), 300);
  }
}

/**
 * Show a full-screen friction overlay that forces the user to rate the video.
 * Returns a promise that resolves with the rating.
 */
export function showFrictionOverlay(videoTitle: string): Promise<-1 | 0 | 1> {
  // Don't stack overlays
  if (document.getElementById(OVERLAY_ID)) {
    return Promise.resolve(0);
  }

  pauseVideo();

  return new Promise((resolve) => {
    resolveRating = resolve;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      opacity: 0;
      transition: opacity 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const truncatedTitle = videoTitle.length > 80 ? videoTitle.slice(0, 80) + '...' : videoTitle;

    overlay.innerHTML = `
      <div style="
        max-width: 480px;
        width: 90%;
        padding: 40px;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        border-radius: 24px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
        text-align: center;
        transform: scale(0.9);
        transition: transform 0.3s ease;
      " id="yt-detox-friction-card">
        <div style="
          font-size: 48px;
          margin-bottom: 16px;
        ">🧠</div>
        <div style="
          font-size: 24px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 8px;
        ">Was this worth your time?</div>
        <div style="
          font-size: 14px;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 32px;
          line-height: 1.4;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        " title="${videoTitle.replace(/"/g, '&quot;')}">${truncatedTitle}</div>

        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button data-rating="1" style="
            flex: 1;
            min-width: 120px;
            padding: 16px 24px;
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            border: none;
            border-radius: 16px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
          ">
            <span style="font-size: 28px;">👍</span>
            <span>Productive</span>
            <span style="font-size: 11px; opacity: 0.8;">+15 XP</span>
          </button>

          <button data-rating="0" style="
            flex: 1;
            min-width: 120px;
            padding: 16px 24px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 16px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
          ">
            <span style="font-size: 28px;">😐</span>
            <span>Neutral</span>
            <span style="font-size: 11px; opacity: 0.5;">+5 XP</span>
          </button>

          <button data-rating="-1" style="
            flex: 1;
            min-width: 120px;
            padding: 16px 24px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            border: none;
            border-radius: 16px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
          ">
            <span style="font-size: 28px;">👎</span>
            <span>Time Wasted</span>
            <span style="font-size: 11px; opacity: 0.8;">+2 XP</span>
          </button>
        </div>

        <div style="
          margin-top: 24px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.3);
        ">Rate to continue watching</div>
      </div>
    `;

    // Button hover effects and click handlers
    overlay.querySelectorAll('button[data-rating]').forEach((btn) => {
      const button = btn as HTMLButtonElement;
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.05)';
        button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.boxShadow = 'none';
      });
      button.addEventListener('click', () => {
        const rating = parseInt(button.dataset.rating!, 10) as -1 | 0 | 1;
        removeOverlay();
        if (resolveRating) {
          resolveRating(rating);
          resolveRating = null;
        }
      });
    });

    // Prevent clicks on the backdrop from dismissing (force rating)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // Shake the card to indicate they must rate
        const card = document.getElementById('yt-detox-friction-card');
        if (card) {
          card.style.animation = 'none';
          card.offsetHeight; // force reflow
          card.style.animation = 'yt-detox-shake 0.4s ease';
        }
      }
    });

    // Add shake keyframes if not present
    if (!document.getElementById('yt-detox-friction-styles')) {
      const style = document.createElement('style');
      style.id = 'yt-detox-friction-styles';
      style.textContent = `
        @keyframes yt-detox-shake {
          0%, 100% { transform: scale(1) translateX(0); }
          20% { transform: scale(1) translateX(-8px); }
          40% { transform: scale(1) translateX(8px); }
          60% { transform: scale(1) translateX(-4px); }
          80% { transform: scale(1) translateX(4px); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);

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
