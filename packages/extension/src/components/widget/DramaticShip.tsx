import { useEffect, useState } from 'react';
import type { SeaState } from '@yt-detox/shared';

interface DramaticShipProps {
  seaState: SeaState;
  composite: number;
}

// Inject dramatic ship keyframes
const SHIP_KEYFRAMES_ID = 'yt-detox-dramatic-ship-keyframes';

function injectShipKeyframes(): void {
  if (document.getElementById(SHIP_KEYFRAMES_ID)) return;

  const style = document.createElement('style');
  style.id = SHIP_KEYFRAMES_ID;
  style.textContent = `
    /* Calm - Gentle sway like a ship at anchor */
    @keyframes yt-ship-calm-rock {
      0%, 100% { transform: rotate(-2deg) translateY(0px); }
      25% { transform: rotate(1.5deg) translateY(-2px); }
      50% { transform: rotate(2deg) translateY(0px); }
      75% { transform: rotate(-1.5deg) translateY(-2px); }
    }

    /* Choppy - Active sailing, responding to waves */
    @keyframes yt-ship-choppy-rock {
      0%, 100% { transform: rotate(-5deg) translateY(2px); }
      15% { transform: rotate(6deg) translateY(-4px); }
      30% { transform: rotate(-4deg) translateY(0px); }
      50% { transform: rotate(7deg) translateY(-5px); }
      70% { transform: rotate(-6deg) translateY(2px); }
      85% { transform: rotate(5deg) translateY(-3px); }
    }

    /* Rough - Heavy seas, dramatic tilts */
    @keyframes yt-ship-rough-rock {
      0%, 100% { transform: rotate(-12deg) translateY(6px) translateX(-3px); }
      12% { transform: rotate(15deg) translateY(-8px) translateX(4px); }
      25% { transform: rotate(-10deg) translateY(4px) translateX(-2px); }
      40% { transform: rotate(18deg) translateY(-10px) translateX(5px); }
      55% { transform: rotate(-14deg) translateY(7px) translateX(-4px); }
      70% { transform: rotate(16deg) translateY(-9px) translateX(3px); }
      85% { transform: rotate(-11deg) translateY(5px) translateX(-3px); }
    }

    /* Storm - Violent heaving, ship fighting for survival */
    @keyframes yt-ship-storm-rock {
      0% { transform: rotate(-22deg) translateY(12px) translateX(-8px) scale(0.98); }
      8% { transform: rotate(28deg) translateY(-15px) translateX(10px) scale(1.02); }
      18% { transform: rotate(-25deg) translateY(10px) translateX(-6px) scale(0.99); }
      28% { transform: rotate(30deg) translateY(-18px) translateX(12px) scale(1.03); }
      40% { transform: rotate(-20deg) translateY(14px) translateX(-9px) scale(0.97); }
      52% { transform: rotate(26deg) translateY(-16px) translateX(11px) scale(1.02); }
      65% { transform: rotate(-28deg) translateY(13px) translateX(-7px) scale(0.98); }
      78% { transform: rotate(24deg) translateY(-14px) translateX(9px) scale(1.01); }
      90% { transform: rotate(-23deg) translateY(11px) translateX(-8px) scale(0.99); }
      100% { transform: rotate(-22deg) translateY(12px) translateX(-8px) scale(0.98); }
    }

    /* Sail flutter */
    @keyframes yt-ship-sail-flutter {
      0%, 100% { transform: scaleX(1); }
      50% { transform: scaleX(0.95); }
    }

    /* Splash particles */
    @keyframes yt-ship-splash {
      0% { transform: translate(0, 0) scale(0); opacity: 0; }
      20% { transform: translate(var(--splash-x, 20px), var(--splash-y, -30px)) scale(1); opacity: 0.8; }
      100% { transform: translate(calc(var(--splash-x, 20px) * 1.5), calc(var(--splash-y, -30px) * 1.2)) scale(0.3); opacity: 0; }
    }

    /* Spray mist */
    @keyframes yt-ship-spray {
      0% { transform: translateX(0) scale(0.5); opacity: 0; }
      30% { opacity: 0.6; }
      100% { transform: translateX(60px) scale(1.5); opacity: 0; }
    }

    /* Lightning pulse on ship */
    @keyframes yt-ship-lightning-pulse {
      0%, 100% { filter: brightness(1) drop-shadow(0 0 0px rgba(255,255,255,0)); }
      10% { filter: brightness(1.8) drop-shadow(0 0 20px rgba(255,255,255,0.9)); }
      20% { filter: brightness(1) drop-shadow(0 0 0px rgba(255,255,255,0)); }
      35% { filter: brightness(1) drop-shadow(0 0 0px rgba(255,255,255,0)); }
      40% { filter: brightness(1.6) drop-shadow(0 0 15px rgba(255,255,255,0.7)); }
      50% { filter: brightness(1) drop-shadow(0 0 0px rgba(255,255,255,0)); }
    }

    /* Glow pulse for storm */
    @keyframes yt-ship-storm-glow {
      0%, 100% { filter: drop-shadow(0 4px 12px rgba(30, 41, 59, 0.6)); }
      50% { filter: drop-shadow(0 6px 20px rgba(30, 41, 59, 0.8)); }
    }
  `;
  document.head.appendChild(style);
}

// Seeded random for consistent particle positions
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

export default function DramaticShip({ seaState, composite }: DramaticShipProps): JSX.Element {
  const [lightningActive, setLightningActive] = useState(false);

  useEffect(() => {
    injectShipKeyframes();
  }, []);

  // Lightning effect for storm
  useEffect(() => {
    if (seaState !== 'storm') {
      setLightningActive(false);
      return;
    }

    let timeout: number;
    let cancelled = false;

    const scheduleFlash = () => {
      const delay = 2000 + Math.random() * 4000; // 2-6 seconds
      timeout = window.setTimeout(() => {
        if (cancelled) return;
        setLightningActive(true);
        window.setTimeout(() => {
          if (!cancelled) setLightningActive(false);
        }, 800);
        scheduleFlash();
      }, delay);
    };

    scheduleFlash();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [seaState]);

  // Animation config by sea state
  const shipConfig = {
    calm: {
      animation: 'yt-ship-calm-rock 6s ease-in-out infinite',
      scale: 1,
      brightness: 1.1,
      showSplashes: false,
      splashCount: 0,
      showSpray: false,
      sprayCount: 0,
      shadowIntensity: 0.2,
    },
    choppy: {
      animation: 'yt-ship-choppy-rock 3.5s ease-in-out infinite',
      scale: 1,
      brightness: 1,
      showSplashes: true,
      splashCount: 2,
      showSpray: true,
      sprayCount: 1,
      shadowIntensity: 0.35,
    },
    rough: {
      animation: 'yt-ship-rough-rock 2s ease-in-out infinite',
      scale: 1.02,
      brightness: 0.9,
      showSplashes: true,
      splashCount: 4,
      showSpray: true,
      sprayCount: 2,
      shadowIntensity: 0.5,
    },
    storm: {
      animation: 'yt-ship-storm-rock 1.2s ease-in-out infinite',
      scale: 1.05,
      brightness: 0.75,
      showSplashes: true,
      splashCount: 8,
      showSpray: true,
      sprayCount: 4,
      shadowIntensity: 0.7,
    },
  };

  const config = shipConfig[seaState] || shipConfig.calm;

  // Generate splash particles
  const splashes = config.showSplashes ? Array.from({ length: config.splashCount || 0 }, (_, i) => {
    const r1 = seededRandom(i + 100);
    const r2 = seededRandom(i + 200);
    const r3 = seededRandom(i + 300);

    return {
      id: i,
      x: (r1 * 40 - 20).toFixed(1),
      y: -(r2 * 40 + 20).toFixed(1),
      size: (3 + r3 * 6).toFixed(1),
      delay: (r1 * 1.5).toFixed(2),
      duration: (0.8 + r2 * 0.6).toFixed(2),
    };
  }) : [];

  // Generate spray mist
  const sprays = config.showSpray ? Array.from({ length: config.sprayCount || 0 }, (_, i) => {
    const r1 = seededRandom(i + 400);
    const r2 = seededRandom(i + 500);

    return {
      id: i,
      delay: (r1 * 2).toFixed(2),
      duration: (1.2 + r2 * 0.8).toFixed(2),
      opacity: (0.3 + r2 * 0.3).toFixed(2),
    };
  }) : [];

  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '120px',
      height: '120px',
    }}>
      {/* Atmospheric glow behind ship */}
      {seaState === 'storm' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '140px',
          height: '140px',
          background: 'radial-gradient(circle, rgba(71, 85, 105, 0.4) 0%, transparent 70%)',
          animation: 'yt-ship-storm-glow 3s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      {/* Main ship container with rocking animation */}
      <div style={{
        position: 'relative',
        animation: config.animation,
        transformOrigin: 'center 80%',
        filter: `brightness(${config.brightness})`,
        transform: `scale(${config.scale})`,
        ...(lightningActive && { animation: `${config.animation}, yt-ship-lightning-pulse 800ms ease-out` }),
      }}>
        {/* Ship SVG */}
        <svg
          width="100"
          height="100"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            filter: `drop-shadow(0 ${4 + composite * 8}px ${12 + composite * 12}px rgba(0, 0, 0, ${config.shadowIntensity}))`,
          }}
        >
          {/* Hull shadow in water */}
          <ellipse
            cx="50"
            cy="88"
            rx="30"
            ry="6"
            fill="rgba(30, 41, 59, 0.3)"
            style={{ opacity: 0.3 + composite * 0.4 }}
          />

          {/* Hull - dark wood */}
          <path
            d="M25 65 Q20 70, 22 80 L78 80 Q80 70, 75 65 L70 60 L30 60 Z"
            fill="#2c1810"
            stroke="#1a0f0a"
            strokeWidth="1.5"
          />

          {/* Hull highlight */}
          <path
            d="M28 65 Q25 68, 26 75 L74 75 Q75 68, 72 65"
            fill="rgba(212, 165, 116, 0.15)"
          />

          {/* Deck */}
          <rect
            x="28"
            y="58"
            width="44"
            height="4"
            rx="1"
            fill="#3d2817"
            stroke="#2c1810"
            strokeWidth="1"
          />

          {/* Main mast */}
          <rect
            x="48"
            y="20"
            width="4"
            height="40"
            fill="#4a3426"
            stroke="#2c1810"
            strokeWidth="1"
          />

          {/* Main sail - flutters slightly */}
          <g style={{
            animation: 'yt-ship-sail-flutter 2s ease-in-out infinite',
            transformOrigin: '48px 35px',
          }}>
            <path
              d="M48 25 Q65 28, 75 35 Q65 42, 48 45 Z"
              fill="#f5e6d3"
              stroke="#d4a574"
              strokeWidth="1"
              opacity="0.95"
            />
            {/* Sail shading */}
            <path
              d="M48 25 Q58 27, 65 32 Q58 37, 48 39 Z"
              fill="rgba(212, 165, 116, 0.2)"
            />
          </g>

          {/* Fore mast */}
          <rect
            x="33"
            y="30"
            width="3"
            height="30"
            fill="#4a3426"
            stroke="#2c1810"
            strokeWidth="0.8"
          />

          {/* Fore sail */}
          <g style={{
            animation: 'yt-ship-sail-flutter 2.3s ease-in-out infinite',
            transformOrigin: '33px 42px',
          }}>
            <path
              d="M33 35 Q22 38, 18 42 Q22 46, 33 49 Z"
              fill="#f5e6d3"
              stroke="#d4a574"
              strokeWidth="0.8"
              opacity="0.9"
            />
          </g>

          {/* Rigging lines */}
          <line x1="48" y1="25" x2="75" y2="35" stroke="#8b7355" strokeWidth="0.5" opacity="0.6" />
          <line x1="48" y1="45" x2="75" y2="35" stroke="#8b7355" strokeWidth="0.5" opacity="0.6" />
          <line x1="33" y1="35" x2="18" y2="42" stroke="#8b7355" strokeWidth="0.4" opacity="0.5" />

          {/* Flag at top of mast - waves in wind */}
          <path
            d="M52 20 L52 16 Q58 17, 60 16 Q58 15, 52 16 Z"
            fill="#dc2626"
            style={{
              animation: 'yt-ship-sail-flutter 1s ease-in-out infinite',
              transformOrigin: '52px 18px',
            }}
          />

          {/* Windows on hull */}
          <circle cx="40" cy="68" r="1.5" fill="#d4a574" opacity="0.8" />
          <circle cx="50" cy="68" r="1.5" fill="#d4a574" opacity="0.8" />
          <circle cx="60" cy="68" r="1.5" fill="#d4a574" opacity="0.8" />

          {/* Waterline waves */}
          <path
            d="M20 82 Q30 80, 40 82 Q50 84, 60 82 Q70 80, 80 82"
            stroke="rgba(148, 163, 184, 0.4)"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>

        {/* Splash particles */}
        {splashes.map(splash => (
          <div
            key={splash.id}
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              width: `${splash.size}px`,
              height: `${splash.size}px`,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(148,163,184,0.6) 50%, transparent 100%)',
              ['--splash-x' as string]: `${splash.x}px`,
              ['--splash-y' as string]: `${splash.y}px`,
              animation: `yt-ship-splash ${splash.duration}s ease-out ${splash.delay}s infinite`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Spray mist */}
        {sprays.map(spray => (
          <div
            key={spray.id}
            style={{
              position: 'absolute',
              bottom: '25px',
              left: '20%',
              width: '40px',
              height: '30px',
              background: 'radial-gradient(ellipse, rgba(148,163,184,0.5) 0%, transparent 70%)',
              opacity: spray.opacity,
              animation: `yt-ship-spray ${spray.duration}s ease-out ${spray.delay}s infinite`,
              pointerEvents: 'none',
              filter: 'blur(3px)',
            }}
          />
        ))}
      </div>

      {/* Storm atmospheric vignette */}
      {seaState === 'storm' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at center, transparent 40%, rgba(15, 23, 42, 0.3) 80%)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
