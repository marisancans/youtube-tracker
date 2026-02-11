/**
 * Drift Rating Overlay
 *
 * Overlay layered on top of the video player that pauses the video
 * and forces the user to rate on a 1-5 drift scale before continuing.
 *
 * 1 = Anchored (fully focused/productive)
 * 2 = Steady (mostly on course)
 * 3 = Drifting (losing focus)
 * 4 = Adrift (pretty far off course)
 * 5 = Lost at Sea (total time sink)
 */

const OVERLAY_ID = 'yt-detox-friction-overlay';

let resolveRating: ((rating: number) => void) | null = null;

const DRIFT_LEVELS = [
  {
    value: 1,
    icon: '\u2693',
    label: 'Anchored',
    desc: 'Focused & productive',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.15)',
  },
  {
    value: 2,
    icon: '\u26f5',
    label: 'Steady',
    desc: 'Mostly on course',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.15)',
  },
  {
    value: 3,
    icon: '\u{1F32A}\uFE0F',
    label: 'Drifting',
    desc: 'Losing focus a bit',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.15)',
  },
  {
    value: 4,
    icon: '\u{1F30A}',
    label: 'Adrift',
    desc: 'Pretty far off course',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.15)',
  },
  {
    value: 5,
    icon: '\u{1F480}',
    label: 'Lost at Sea',
    desc: 'Total time sink',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.15)',
  },
];

function getPlayerElement(): HTMLElement | null {
  return (
    document.querySelector('#movie_player') ||
    document.querySelector('#player-container-inner') ||
    document.querySelector('ytd-player')
  );
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
    setTimeout(() => overlay.remove(), 300);
  }
}

/**
 * Show the drift rating overlay on top of the video player.
 * Returns a promise that resolves with the rating (1-5).
 */
export function showFrictionOverlay(videoTitle: string): Promise<number> {
  if (document.getElementById(OVERLAY_ID)) {
    return Promise.resolve(3);
  }

  const player = getPlayerElement();
  if (!player) {
    return Promise.resolve(3);
  }

  pauseVideo();

  // Ensure the player is positioned so our absolute overlay works
  const playerStyle = getComputedStyle(player);
  if (playerStyle.position === 'static') {
    player.style.position = 'relative';
  }

  return new Promise((resolve) => {
    resolveRating = resolve;

    const truncTitle = videoTitle.length > 70 ? videoTitle.slice(0, 70) + '...' : videoTitle;

    // Inject keyframes
    if (!document.getElementById('yt-detox-friction-styles')) {
      const style = document.createElement('style');
      style.id = 'yt-detox-friction-styles';
      style.textContent = `
        @keyframes yt-detox-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        @keyframes yt-detox-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes yt-detox-fadein {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(2, 6, 23, 0.88);
      backdrop-filter: blur(16px) saturate(1.2);
      -webkit-backdrop-filter: blur(16px) saturate(1.2);
      border-radius: 12px;
      opacity: 0;
      transition: opacity 0.4s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const buttonsHtml = DRIFT_LEVELS.map(
      (lvl) => `
      <button data-rating="${lvl.value}" style="
        width: 100%;
        padding: 12px 16px;
        background: ${lvl.bg};
        border: 1px solid ${lvl.color}33;
        border-radius: 12px;
        color: #fff;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
      ">
        <span style="font-size: 24px; flex-shrink: 0; width: 32px; text-align: center;">${lvl.icon}</span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; color: ${lvl.color};">${lvl.label}</div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 1px;">${lvl.desc}</div>
        </div>
      </button>
    `,
    ).join('');

    overlay.innerHTML = `
      <div id="yt-detox-friction-card" style="
        max-width: 380px;
        width: 88%;
        padding: 28px 24px;
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 50%, rgba(15, 23, 42, 0.95) 100%);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow:
          0 0 60px rgba(59, 130, 246, 0.08),
          0 20px 50px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
        text-align: center;
        animation: yt-detox-fadein 0.4s ease;
      ">
        <div style="
          font-size: 32px;
          margin-bottom: 6px;
          animation: yt-detox-float 3s ease-in-out infinite;
        ">\u{1F30A}</div>
        <div style="
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 4px;
          letter-spacing: -0.3px;
        ">How far did you drift?</div>
        <div style="
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 20px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        " title="${videoTitle.replace(/"/g, '&quot;')}">${truncTitle}</div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${buttonsHtml}
        </div>

        <div style="
          margin-top: 16px;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.2);
          letter-spacing: 0.5px;
        ">RATE TO CONTINUE WATCHING</div>
      </div>
    `;

    // Button interactions
    overlay.querySelectorAll('button[data-rating]').forEach((btn) => {
      const button = btn as HTMLButtonElement;
      const level = DRIFT_LEVELS.find((l) => l.value === parseInt(button.dataset.rating!, 10));

      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.02) translateX(4px)';
        button.style.borderColor = level?.color || '#fff';
        button.style.boxShadow = `0 4px 20px ${level?.color}22`;
      });
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.borderColor = `${level?.color}33`;
        button.style.boxShadow = 'none';
      });
      button.addEventListener('click', () => {
        const rating = parseInt(button.dataset.rating!, 10);
        removeOverlay();
        if (resolveRating) {
          resolveRating(rating);
          resolveRating = null;
        }
      });
    });

    // Backdrop click = shake card
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        const card = document.getElementById('yt-detox-friction-card');
        if (card) {
          card.style.animation = 'none';
          void card.offsetHeight;
          card.style.animation = 'yt-detox-shake 0.4s ease';
        }
      }
    });

    // Append inside the player element so it's positioned relative to it
    player.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  });
}

/**
 * Check if the friction overlay is currently showing.
 */
export function isFrictionOverlayVisible(): boolean {
  return !!document.getElementById(OVERLAY_ID);
}
