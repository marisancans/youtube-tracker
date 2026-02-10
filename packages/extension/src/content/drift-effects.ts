/**
 * Drift Effects - Apply visual friction based on drift level
 * 
 * This module injects CSS into YouTube pages to create progressive friction
 * based on the user's current drift level.
 */

interface DriftEffects {
  thumbnailBlur: number;
  thumbnailGrayscale: number;
  commentsReduction: number;
  sidebarReduction: number;
  autoplayDelay: number;
  showTextOnly: boolean;
}

let currentEffects: DriftEffects | null = null;
let styleElement: HTMLStyleElement | null = null;

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
    ${effects.thumbnailGrayscale >= 50 ? `
      @keyframes drift-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.92; }
      }
      
      ytd-thumbnail img {
        animation: drift-pulse 3s ease-in-out infinite;
      }
    ` : ''}
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
      ${!effects.showTextOnly ? `
        ytd-thumbnail:hover img,
        ytd-playlist-thumbnail:hover img {
          filter: blur(${Math.max(0, effects.thumbnailBlur - 2)}px) grayscale(${Math.max(0, effects.thumbnailGrayscale - 20)}%) !important;
        }
      ` : ''}
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

  return css.join('\n');
}

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
  console.log('[YT Detox] Drift effects removed');
}

/**
 * Update drift effects from background
 */
export function initDriftEffects(): void {
  // Initial fetch
  chrome.runtime.sendMessage({ type: 'GET_DRIFT_EFFECTS' }, (effects) => {
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
    chrome.runtime.sendMessage({ type: 'GET_DRIFT_EFFECTS' }, (effects) => {
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
