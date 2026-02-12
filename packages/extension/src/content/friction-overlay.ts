/**
 * Drift Rating Overlay — Nautical Cartography Edition
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

/* ── Inline SVG icons (stroke-based, ~24px) ────────────────────────── */

const OVERLAY_ICONS: Record<number, string> = {
  1: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="21"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`,
  2: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 20 L10 20 L10 14 L22 14"/><path d="M10 14 L16 6 L10 8 L10 14"/></svg>`,
  3: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1"/><line x1="12" y1="3" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="3" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/></svg>`,
  4: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12 Q5 8, 8 12 Q11 16, 14 12 Q17 8, 20 12 Q23 16, 26 12"/><path d="M2 16 Q5 12, 8 16 Q11 20, 14 16 Q17 12, 20 16"/></svg>`,
  5: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="5"/><path d="M8 14 L6 22 L12 19 L18 22 L16 14"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="14" cy="7" r="1" fill="currentColor"/></svg>`,
};

/* ── Floating ship icon for the card header ────────────────────────── */

const HEADER_SHIP_SVG = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8b5e3c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20 L10 20 L10 14 L22 14"/><path d="M10 14 L16 4 L10 7 L10 14"/><path d="M2 22 Q6 18, 12 22 Q18 18, 22 22"/></svg>`;

/* ── Drift levels ──────────────────────────────────────────────────── */

const DRIFT_LEVELS = [
  {
    value: 1,
    label: 'Anchored',
    desc: 'Focused & productive',
    color: '#0d9488',
  },
  {
    value: 2,
    label: 'Steady',
    desc: 'Mostly on course',
    color: '#3b82f6',
  },
  {
    value: 3,
    label: 'Drifting',
    desc: 'Losing focus a bit',
    color: '#f59e0b',
  },
  {
    value: 4,
    label: 'Adrift',
    desc: 'Pretty far off course',
    color: '#f97316',
  },
  {
    value: 5,
    label: 'Lost at Sea',
    desc: 'Total time sink',
    color: '#991b1b',
  },
];

/* ── Helpers ────────────────────────────────────────────────────────── */

/**
 * Mix a hex color at a given opacity with the parchment base (#f5e6c8).
 * Returns a solid hex-ish CSS color string for use in gradients.
 */
function parchmentTint(hexColor: string, amount: number): string {
  // Parse the level color
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  // Parchment base
  const pr = 0xf5,
    pg = 0xe6,
    pb = 0xc8;
  // Blend
  const mr = Math.round(pr * (1 - amount) + r * amount);
  const mg = Math.round(pg * (1 - amount) + g * amount);
  const mb = Math.round(pb * (1 - amount) + b * amount);
  return `rgb(${mr}, ${mg}, ${mb})`;
}

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

/* ── Main export ────────────────────────────────────────────────────── */

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

    // ── Font loading ──────────────────────────────────────────────
    if (!document.getElementById('yt-detox-friction-fonts')) {
      const fontStyle = document.createElement('style');
      fontStyle.id = 'yt-detox-friction-fonts';
      fontStyle.textContent = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap');`;
      document.head.appendChild(fontStyle);
    }

    // ── Keyframes ─────────────────────────────────────────────────
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

    // ── Overlay (backdrop) ────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, rgba(10, 22, 40, 0.92) 0%, rgba(26, 39, 68, 0.88) 50%, rgba(10, 22, 40, 0.95) 100%);
      backdrop-filter: blur(12px) saturate(1.1);
      -webkit-backdrop-filter: blur(12px) saturate(1.1);
      border-radius: 12px;
      opacity: 0;
      transition: opacity 0.4s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // ── Buttons ───────────────────────────────────────────────────
    const buttonsHtml = DRIFT_LEVELS.map((lvl) => {
      const tintLight = parchmentTint(lvl.color, 0.1);
      const tintDark = parchmentTint(lvl.color, 0.18);
      const borderColor = lvl.color + '4D'; // 30% opacity hex

      return `
      <button data-rating="${lvl.value}" style="
        width: 100%;
        padding: 12px 16px;
        background: linear-gradient(135deg, ${tintLight} 0%, ${tintDark} 100%);
        border: 1px solid ${borderColor};
        border-radius: 12px;
        color: #2c1810;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
      ">
        <span style="flex-shrink: 0; width: 32px; text-align: center; color: ${lvl.color}; display: flex; align-items: center; justify-content: center;">${OVERLAY_ICONS[lvl.value]}</span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; color: ${lvl.color};">${lvl.label}</div>
          <div style="font-size: 11px; color: #6b5545; margin-top: 1px;">${lvl.desc}</div>
        </div>
      </button>
    `;
    }).join('');

    // ── Card ──────────────────────────────────────────────────────
    overlay.innerHTML = `
      <div id="yt-detox-friction-card" style="
        max-width: 380px;
        width: 88%;
        padding: 28px 24px;
        background: linear-gradient(145deg, #f5e6c8 0%, #e8d5b7 50%, #d4c5a0 100%);
        border-radius: 16px;
        border: 2px solid #d4a574;
        box-shadow: inset 0 0 0 1px #b8956a, 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(212, 165, 116, 0.1);
        text-align: center;
        animation: yt-detox-fadein 0.4s ease;
      ">
        <div style="
          margin-bottom: 6px;
          animation: yt-detox-float 3s ease-in-out infinite;
          display: inline-block;
        ">${HEADER_SHIP_SVG}</div>
        <div style="
          font-size: 18px;
          font-weight: 700;
          color: #2c1810;
          margin-bottom: 4px;
          letter-spacing: -0.3px;
          font-family: 'Playfair Display', Georgia, serif;
        ">How far did you drift?</div>
        <div style="
          font-size: 12px;
          color: #6b5545;
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
          color: #9a8474;
          letter-spacing: 1.5px;
          font-variant: small-caps;
        ">LOG YOUR POSITION TO CONTINUE</div>
      </div>
    `;

    // ── Button interactions ───────────────────────────────────────
    overlay.querySelectorAll('button[data-rating]').forEach((btn) => {
      const button = btn as HTMLButtonElement;
      const level = DRIFT_LEVELS.find((l) => l.value === parseInt(button.dataset.rating!, 10));

      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.02) translateX(4px)';
        button.style.borderColor = '#d4a574';
        button.style.boxShadow = `0 4px 20px rgba(212, 165, 116, 0.25)`;
      });
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.borderColor = `${level?.color}4D`;
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

    // ── Backdrop click = shake card ──────────────────────────────
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
