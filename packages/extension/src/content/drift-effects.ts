import { safeSendMessageWithCallback } from '../lib/messaging';

/**
 * Drift Effects - Apply visual friction based on drift level
 *
 * This module injects CSS into YouTube pages to create progressive friction
 * based on the user's current drift level.
 *
 * Nautical Atmosphere System:
 * In addition to CSS-based thumbnail/sidebar/comment effects, this module
 * renders atmospheric overlays (background gradient, waves, fog, compass)
 * that intensify with the user's drift — creating an immersive "sea state".
 */

interface DriftEffects {
  thumbnailBlur: number;
  thumbnailGrayscale: number;
  commentsReduction: number;
  sidebarReduction: number;
  autoplayDelay: number;
  showTextOnly: boolean;
}

// ---------------------------------------------------------------------------
// Sea State Detection
// ---------------------------------------------------------------------------

type SeaState = 'calm' | 'choppy' | 'rough' | 'storm';

function getSeaState(effects: DriftEffects): SeaState {
  const intensity = (effects.thumbnailGrayscale / 100 + effects.thumbnailBlur / 20) / 2;
  if (intensity < 0.15) return 'calm';
  if (intensity < 0.35) return 'choppy';
  if (intensity < 0.6) return 'rough';
  return 'storm';
}

// ---------------------------------------------------------------------------
// Sea State Configuration
// ---------------------------------------------------------------------------

interface AtmosphereConfig {
  color: string;
  opacity: number;
  waveHeight: number;
  waveColor: string;
  fogOpacity: number;
  compassOpacity: number;
}

function getAtmosphereConfig(state: SeaState): AtmosphereConfig {
  switch (state) {
    case 'calm':
      return {
        color: 'rgba(13, 148, 136, 0.03)',
        opacity: 0.03,
        waveHeight: 0,
        waveColor: 'rgba(13, 148, 136, 0.4)',
        fogOpacity: 0,
        compassOpacity: 0.04,
      };
    case 'choppy':
      return {
        color: 'rgba(245, 158, 11, 0.06)',
        opacity: 0.06,
        waveHeight: 20,
        waveColor: 'rgba(245, 158, 11, 0.5)',
        fogOpacity: 0.15,
        compassOpacity: 0.05,
      };
    case 'rough':
      return {
        color: 'rgba(51, 65, 85, 0.08)',
        opacity: 0.08,
        waveHeight: 40,
        waveColor: 'rgba(51, 65, 85, 0.5)',
        fogOpacity: 0.35,
        compassOpacity: 0.06,
      };
    case 'storm':
      return {
        color: 'rgba(153, 27, 27, 0.1)',
        opacity: 0.1,
        waveHeight: 80,
        waveColor: 'rgba(153, 27, 27, 0.6)',
        fogOpacity: 0.6,
        compassOpacity: 0.08,
      };
  }
}

// ---------------------------------------------------------------------------
// Atmosphere CSS (injected once alongside drift styles)
// ---------------------------------------------------------------------------

function generateAtmosphereCSS(): string {
  return `
    /* === Nautical Atmosphere System === */

    /* Background gradient overlay via html::before */
    html::before {
      content: '';
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse at center, transparent 40%, var(--yt-detox-atmosphere-color, transparent) 100%);
      opacity: var(--yt-detox-atmosphere-opacity, 0);
      pointer-events: none;
      z-index: 9990;
      transition: opacity 2s ease, background 2s ease;
      will-change: transform, opacity;
    }

    /* Wave overlay container */
    #yt-detox-wave-overlay {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      pointer-events: none;
      z-index: 9991;
      overflow: hidden;
      transition: height 1.5s ease, opacity 1.5s ease;
      will-change: transform, opacity;
    }

    #yt-detox-wave-overlay svg {
      display: block;
      width: 200%;
      height: 100%;
    }

    @keyframes wave-translate-1 {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }

    @keyframes wave-translate-2 {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }

    #yt-detox-wave-overlay .wave-layer-1 {
      animation: wave-translate-1 7s linear infinite;
      will-change: transform;
    }

    #yt-detox-wave-overlay .wave-layer-2 {
      animation: wave-translate-2 11s linear infinite;
      will-change: transform;
    }

    /* Fog overlay */
    #yt-detox-fog-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9992;
      transition: opacity 2s ease;
      will-change: transform, opacity;
      animation: fog-drift 8s ease-in-out infinite;
    }

    @keyframes fog-drift {
      0%, 100% {
        background-position: 0% 0%;
      }
      50% {
        background-position: 3% 2%;
      }
    }

    /* Compass watermark */
    #yt-detox-compass-watermark {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 120px;
      height: 120px;
      pointer-events: none;
      z-index: 9989;
      transition: opacity 2s ease;
      will-change: transform, opacity;
    }
  `;
}

// ---------------------------------------------------------------------------
// Wave SVG builder
// ---------------------------------------------------------------------------

function createWaveSVG(color: string): string {
  // Two overlapping wave paths with different amplitudes for a natural look.
  // The viewBox width is doubled and the animation translates -50% to loop.
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 120" preserveAspectRatio="none"
         style="position:absolute;bottom:0;width:200%;height:100%;" class="wave-layer-1">
      <path d="M0,60 C200,100 400,20 600,60 C800,100 1000,20 1200,60
               C1400,100 1600,20 1800,60 C2000,100 2200,20 2400,60 L2400,120 L0,120 Z"
            fill="${color}" />
    </svg>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 120" preserveAspectRatio="none"
         style="position:absolute;bottom:0;width:200%;height:100%;opacity:0.6;" class="wave-layer-2">
      <path d="M0,80 C150,40 350,100 600,70 C850,40 1050,100 1200,80
               C1350,40 1550,100 1800,70 C2050,40 2250,100 2400,80 L2400,120 L0,120 Z"
            fill="${color}" />
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Compass SVG
// ---------------------------------------------------------------------------

function createCompassSVG(): string {
  // Minimalist compass rose: circle + cardinal lines + N/S/E/W labels.
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
      <circle cx="60" cy="60" r="3" fill="currentColor" opacity="0.5"/>
      <!-- Cardinal lines -->
      <line x1="60" y1="14" x2="60" y2="46" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
      <line x1="60" y1="74" x2="60" y2="106" stroke="currentColor" stroke-width="1" opacity="0.4"/>
      <line x1="14" y1="60" x2="46" y2="60" stroke="currentColor" stroke-width="1" opacity="0.4"/>
      <line x1="74" y1="60" x2="106" y2="60" stroke="currentColor" stroke-width="1" opacity="0.4"/>
      <!-- Intercardinal ticks -->
      <line x1="25" y1="25" x2="40" y2="40" stroke="currentColor" stroke-width="0.8" opacity="0.25"/>
      <line x1="95" y1="25" x2="80" y2="40" stroke="currentColor" stroke-width="0.8" opacity="0.25"/>
      <line x1="25" y1="95" x2="40" y2="80" stroke="currentColor" stroke-width="0.8" opacity="0.25"/>
      <line x1="95" y1="95" x2="80" y2="80" stroke="currentColor" stroke-width="0.8" opacity="0.25"/>
      <!-- N label (more prominent) -->
      <text x="60" y="10" text-anchor="middle" fill="currentColor" font-size="10" font-weight="bold" opacity="0.6">N</text>
      <text x="60" y="118" text-anchor="middle" fill="currentColor" font-size="9" opacity="0.3">S</text>
      <text x="5" y="63" text-anchor="middle" fill="currentColor" font-size="9" opacity="0.3">W</text>
      <text x="115" y="63" text-anchor="middle" fill="currentColor" font-size="9" opacity="0.3">E</text>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Overlay Element Management (create once, update via properties)
// ---------------------------------------------------------------------------

function ensureWaveOverlay(): HTMLDivElement {
  let el = document.getElementById('yt-detox-wave-overlay') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'yt-detox-wave-overlay';
    document.body.appendChild(el);
  }
  return el;
}

function ensureFogOverlay(): HTMLDivElement {
  let el = document.getElementById('yt-detox-fog-overlay') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'yt-detox-fog-overlay';
    document.body.appendChild(el);
  }
  return el;
}

function ensureCompassWatermark(): HTMLDivElement {
  let el = document.getElementById('yt-detox-compass-watermark') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'yt-detox-compass-watermark';
    el.innerHTML = createCompassSVG();
    document.body.appendChild(el);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Atmosphere Updater
// ---------------------------------------------------------------------------

function updateAtmosphere(effects: DriftEffects): void {
  const state = getSeaState(effects);
  const config = getAtmosphereConfig(state);

  // Determine whether drift is essentially zero (perfectly calm with no effects).
  const hasDrift =
    effects.thumbnailBlur > 0 ||
    effects.thumbnailGrayscale > 0 ||
    effects.commentsReduction > 0 ||
    effects.sidebarReduction > 0 ||
    effects.autoplayDelay > 0 ||
    effects.showTextOnly;

  // ----- Background gradient (CSS custom properties on <html>) -----
  const htmlEl = document.documentElement;
  htmlEl.style.setProperty('--yt-detox-atmosphere-color', config.color);
  htmlEl.style.setProperty('--yt-detox-atmosphere-opacity', String(config.opacity));

  // ----- Wave overlay -----
  const waveEl = ensureWaveOverlay();
  waveEl.style.height = `${config.waveHeight}px`;
  waveEl.style.opacity = config.waveHeight > 0 ? '1' : '0';
  // Update wave color by re-rendering the SVG (fast: just innerHTML swap on a small element).
  waveEl.innerHTML = createWaveSVG(config.waveColor);

  // ----- Fog overlay -----
  const fogEl = ensureFogOverlay();
  fogEl.style.opacity = String(config.fogOpacity);
  fogEl.style.background = `radial-gradient(ellipse at center, transparent 30%, rgba(10, 22, 40, ${config.fogOpacity}) 100%)`;

  // ----- Compass watermark -----
  const compassEl = ensureCompassWatermark();
  compassEl.style.opacity = hasDrift ? String(config.compassOpacity) : '0';
  compassEl.style.color = '#94a3b8'; // slate-400 — neutral across light & dark themes
}

// ---------------------------------------------------------------------------
// Atmosphere Removal
// ---------------------------------------------------------------------------

function removeAtmosphere(): void {
  // Remove CSS custom properties from <html>
  const htmlEl = document.documentElement;
  htmlEl.style.removeProperty('--yt-detox-atmosphere-color');
  htmlEl.style.removeProperty('--yt-detox-atmosphere-opacity');

  // Remove overlay elements
  document.getElementById('yt-detox-wave-overlay')?.remove();
  document.getElementById('yt-detox-fog-overlay')?.remove();
  document.getElementById('yt-detox-compass-watermark')?.remove();
}

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let currentEffects: DriftEffects | null = null;
let styleElement: HTMLStyleElement | null = null;

// ---------------------------------------------------------------------------
// CSS Generation (original drift effects)
// ---------------------------------------------------------------------------

/**
 * Generate CSS based on drift effects
 */
function generateDriftCSS(effects: DriftEffects): string {
  const css: string[] = [];

  // Base transition for smooth changes + CSS custom properties
  css.push(`
    :root {
      --yt-detox-drift: ${effects.thumbnailBlur};
      --yt-detox-grayscale: ${effects.thumbnailGrayscale};
      --yt-detox-blur: ${effects.thumbnailBlur}px;
    }

    ytd-thumbnail img,
    #secondary,
    #comments,
    ytd-rich-item-renderer,
    ytd-compact-video-renderer,
    ytd-playlist-thumbnail,
    yt-image {
      transition: filter 0.8s cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 0.5s ease,
                  font-size 0.3s ease,
                  transform 0.3s ease !important;
    }

    /* Subtle animation for high drift */
    ${
      effects.thumbnailGrayscale >= 50
        ? `
      @keyframes drift-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.92; }
      }

      ytd-thumbnail img {
        animation: drift-pulse 3s ease-in-out infinite;
      }
    `
        : ''
    }
  `);

  // Thumbnail effects
  if (effects.thumbnailBlur > 0 || effects.thumbnailGrayscale > 0) {
    css.push(`
      ytd-thumbnail img,
      ytd-playlist-thumbnail img,
      yt-image img {
        filter: blur(${effects.thumbnailBlur}px) grayscale(${effects.thumbnailGrayscale}%) !important;
      }

      /* Show clearer on hover (unless text-only mode) */
      ${
        !effects.showTextOnly
          ? `
        ytd-thumbnail:hover img,
        ytd-playlist-thumbnail:hover img {
          filter: blur(${Math.max(0, effects.thumbnailBlur - 2)}px) grayscale(${Math.max(0, effects.thumbnailGrayscale - 20)}%) !important;
        }
      `
          : ''
      }
    `);
  }

  // Text-only mode (extreme drift)
  if (effects.showTextOnly) {
    css.push(`
      /* Hide all thumbnails */
      ytd-thumbnail img,
      ytd-playlist-thumbnail img,
      yt-image img,
      #thumbnail img {
        display: none !important;
      }

      /* Style thumbnail containers */
      ytd-thumbnail,
      #thumbnail {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 94px !important;
      }

      ytd-thumbnail::after {
        content: '📺' !important;
        font-size: 32px !important;
        opacity: 0.3 !important;
      }

      /* Make titles more prominent */
      #video-title,
      .title {
        font-weight: 600 !important;
      }
    `);
  }

  // Sidebar reduction
  if (effects.sidebarReduction > 0) {
    if (effects.sidebarReduction >= 100) {
      // Hide entirely
      css.push(`
        #secondary,
        #related,
        ytd-watch-next-secondary-results-renderer {
          display: none !important;
        }
      `);
    } else if (effects.sidebarReduction >= 75) {
      // Collapsed with button
      css.push(`
        #secondary,
        #related {
          max-height: 60px !important;
          overflow: hidden !important;
          position: relative !important;
        }

        #secondary::after,
        #related::after {
          content: 'Recommendations hidden to reduce drift 🌊' !important;
          position: absolute !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          padding: 12px !important;
          background: linear-gradient(transparent, rgba(0,0,0,0.9)) !important;
          color: #888 !important;
          font-size: 12px !important;
          text-align: center !important;
        }
      `);
    } else {
      // Reduced opacity/blur
      css.push(`
        #secondary ytd-thumbnail img,
        #related ytd-thumbnail img {
          filter: blur(4px) grayscale(60%) !important;
        }

        #secondary,
        #related {
          opacity: ${1 - effects.sidebarReduction / 100} !important;
        }
      `);
    }
  }

  // Comments reduction
  if (effects.commentsReduction > 0) {
    if (effects.commentsReduction >= 100) {
      // Hidden with message
      css.push(`
        #comments {
          display: none !important;
        }

        /* Add message where comments would be */
        ytd-comments::before {
          content: 'Comments hidden to help you stay focused 🎯' !important;
          display: block !important;
          padding: 20px !important;
          text-align: center !important;
          color: #666 !important;
          font-size: 14px !important;
          background: rgba(0,0,0,0.1) !important;
          border-radius: 8px !important;
          margin: 16px 0 !important;
        }
      `);
    } else if (effects.commentsReduction >= 50) {
      // Blurred, smaller
      css.push(`
        #comments {
          filter: blur(3px) !important;
          font-size: ${100 - effects.commentsReduction}% !important;
        }

        #comments:hover {
          filter: blur(0) !important;
        }

        #comments::before {
          content: 'Hover to reveal comments' !important;
          display: block !important;
          text-align: center !important;
          padding: 8px !important;
          color: #666 !important;
          font-size: 12px !important;
        }
      `);
    } else {
      // Just smaller
      css.push(`
        #comments {
          font-size: ${100 - effects.commentsReduction}% !important;
        }
      `);
    }
  }

  // Homepage feed effects (when drift is high)
  if (effects.thumbnailGrayscale >= 60) {
    css.push(`
      /* Emphasize search on homepage */
      ytd-browse[page-subtype="home"] #search {
        transform: scale(1.05) !important;
        box-shadow: 0 0 20px rgba(59, 130, 246, 0.3) !important;
      }

      /* De-emphasize feed */
      ytd-browse[page-subtype="home"] ytd-rich-grid-renderer {
        opacity: 0.6 !important;
      }

      ytd-browse[page-subtype="home"] ytd-rich-grid-renderer::before {
        content: 'What are you looking for? Try searching instead 🔍' !important;
        display: block !important;
        text-align: center !important;
        padding: 16px !important;
        margin-bottom: 16px !important;
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%) !important;
        border-radius: 12px !important;
        color: #888 !important;
        font-size: 14px !important;
      }
    `);
  }

  // Autoplay indicator (visual cue that autoplay is delayed/disabled)
  if (effects.autoplayDelay > 15) {
    css.push(`
      .ytp-autonav-endscreen-countdown-overlay {
        background: rgba(0, 0, 0, 0.9) !important;
      }

      .ytp-autonav-endscreen-countdown-overlay::after {
        content: 'Autoplay ${effects.autoplayDelay >= 999 ? 'disabled' : 'delayed'} by YouTube Detox 🌊' !important;
        position: absolute !important;
        bottom: 20px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        color: #888 !important;
        font-size: 12px !important;
      }
    `);
  }

  // Atmosphere CSS rules (injected once, controlled via custom properties)
  css.push(generateAtmosphereCSS());

  return css.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply drift effects to the page
 */
export function applyDriftEffects(effects: DriftEffects): void {
  // Skip if same effects
  if (currentEffects && JSON.stringify(currentEffects) === JSON.stringify(effects)) {
    return;
  }

  currentEffects = effects;

  // Remove existing style element
  if (styleElement) {
    styleElement.remove();
  }

  // Create new style element
  styleElement = document.createElement('style');
  styleElement.id = 'yt-detox-drift-styles';
  styleElement.textContent = generateDriftCSS(effects);

  // Inject into page
  document.head.appendChild(styleElement);

  // Update atmospheric overlays
  updateAtmosphere(effects);

  console.log('[YT Detox] Drift effects applied:', effects);
}

/**
 * Remove all drift effects
 */
export function removeDriftEffects(): void {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
  currentEffects = null;

  // Remove atmospheric overlays
  removeAtmosphere();

  console.log('[YT Detox] Drift effects removed');
}

/**
 * Update drift effects from background
 */
export function initDriftEffects(): void {
  // Initial fetch
  safeSendMessageWithCallback('GET_DRIFT_EFFECTS', undefined, (effects: any) => {
    if (effects) {
      applyDriftEffects(effects);
    }
  });

  // Listen for drift updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DRIFT_UPDATED' && message.effects) {
      applyDriftEffects(message.effects);
    }
  });

  // Periodic refresh (every 30 seconds)
  setInterval(() => {
    safeSendMessageWithCallback('GET_DRIFT_EFFECTS', undefined, (effects: any) => {
      if (effects) {
        applyDriftEffects(effects);
      }
    });
  }, 30000);
}

/**
 * Control autoplay based on drift
 */
export function controlAutoplay(delay: number): void {
  if (delay >= 999) {
    // Disable autoplay entirely
    const autoplayToggle = document.querySelector('.ytp-autonav-toggle-button');
    if (autoplayToggle && autoplayToggle.getAttribute('aria-checked') === 'true') {
      (autoplayToggle as HTMLElement).click();
      console.log('[YT Detox] Autoplay disabled due to high drift');
    }
  }
}
