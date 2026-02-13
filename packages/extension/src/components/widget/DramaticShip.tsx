import { useEffect, useState, useMemo } from 'react';
import type { SeaState } from '@yt-detox/shared';

/**
 * DramaticShip — PNG ship sprite with organic, independent motion.
 *
 * The ship does NOT rock in sync with waves. It has its own animation
 * timeline that is deliberately offset from wave scrolling speed,
 * creating the illusion of a vessel fighting the sea.
 *
 * Motion layers (applied via nested divs, each with its own animation):
 *   1. Heave  — slow vertical bob (different period than waves)
 *   2. Roll   — side-to-side tilt (counter-phased to heave)
 *   3. Surge  — slight horizontal drift
 *   4. Lurch  — occasional sharp corrections (rough/storm only)
 */

interface Props {
  seaState: SeaState;
  composite: number;
}

const KF_ID = 'yt-detox-ship-v2';

function injectKeyframes(): void {
  if (document.getElementById(KF_ID)) return;
  const s = document.createElement('style');
  s.id = KF_ID;
  s.textContent = `
    /* ── Heave (vertical bob) — asymmetric, organic ── */
    @keyframes yt-ship2-heave-calm {
      0%, 100% { transform: translateY(0); }
      30%  { transform: translateY(-2px); }
      65%  { transform: translateY(1px); }
    }
    @keyframes yt-ship2-heave-choppy {
      0%, 100% { transform: translateY(2px); }
      20%  { transform: translateY(-4px); }
      55%  { transform: translateY(3px); }
      80%  { transform: translateY(-2px); }
    }
    @keyframes yt-ship2-heave-rough {
      0%, 100% { transform: translateY(5px); }
      15%  { transform: translateY(-8px); }
      35%  { transform: translateY(6px); }
      55%  { transform: translateY(-6px); }
      75%  { transform: translateY(4px); }
      90%  { transform: translateY(-3px); }
    }
    @keyframes yt-ship2-heave-storm {
      0%   { transform: translateY(8px); }
      10%  { transform: translateY(-14px); }
      22%  { transform: translateY(10px); }
      38%  { transform: translateY(-12px); }
      50%  { transform: translateY(9px); }
      65%  { transform: translateY(-15px); }
      78%  { transform: translateY(11px); }
      90%  { transform: translateY(-10px); }
      100% { transform: translateY(8px); }
    }

    /* ── Roll (rotation) — deliberately different period than heave ── */
    @keyframes yt-ship2-roll-calm {
      0%, 100% { transform: rotate(0deg); }
      40%  { transform: rotate(1.5deg); }
      70%  { transform: rotate(-1deg); }
    }
    @keyframes yt-ship2-roll-choppy {
      0%, 100% { transform: rotate(-3deg); }
      25%  { transform: rotate(4deg); }
      60%  { transform: rotate(-5deg); }
      85%  { transform: rotate(3deg); }
    }
    @keyframes yt-ship2-roll-rough {
      0%, 100% { transform: rotate(-8deg); }
      18%  { transform: rotate(12deg); }
      35%  { transform: rotate(-10deg); }
      55%  { transform: rotate(14deg); }
      72%  { transform: rotate(-12deg); }
      88%  { transform: rotate(9deg); }
    }
    @keyframes yt-ship2-roll-storm {
      0%   { transform: rotate(-18deg); }
      12%  { transform: rotate(24deg); }
      25%  { transform: rotate(-20deg); }
      40%  { transform: rotate(28deg); }
      55%  { transform: rotate(-22deg); }
      68%  { transform: rotate(25deg); }
      82%  { transform: rotate(-24deg); }
      92%  { transform: rotate(20deg); }
      100% { transform: rotate(-18deg); }
    }

    /* ── Surge (horizontal drift) ── */
    @keyframes yt-ship2-surge-calm {
      0%, 100% { transform: translateX(0); }
      50%  { transform: translateX(1px); }
    }
    @keyframes yt-ship2-surge-choppy {
      0%, 100% { transform: translateX(0); }
      30%  { transform: translateX(2px); }
      70%  { transform: translateX(-2px); }
    }
    @keyframes yt-ship2-surge-rough {
      0%, 100% { transform: translateX(-3px); }
      25%  { transform: translateX(4px); }
      55%  { transform: translateX(-5px); }
      80%  { transform: translateX(3px); }
    }
    @keyframes yt-ship2-surge-storm {
      0%   { transform: translateX(-6px); }
      15%  { transform: translateX(8px); }
      35%  { transform: translateX(-10px); }
      50%  { transform: translateX(7px); }
      70%  { transform: translateX(-9px); }
      85%  { transform: translateX(6px); }
      100% { transform: translateX(-6px); }
    }

    /* ── Lightning illumination ── */
    @keyframes yt-ship2-flash {
      0%, 100% { filter: brightness(1) drop-shadow(0 0 0 transparent); }
      8%   { filter: brightness(2) drop-shadow(0 0 12px rgba(245, 230, 200, 0.8)); }
      18%  { filter: brightness(1) drop-shadow(0 0 0 transparent); }
      38%  { filter: brightness(1.5) drop-shadow(0 0 8px rgba(245, 230, 200, 0.5)); }
      48%  { filter: brightness(1) drop-shadow(0 0 0 transparent); }
    }
  `;
  document.head.appendChild(s);
}

// ── Configs ─────────────────────────────────────────────────────────────────

interface MotionCfg {
  heave: string;   // keyframe name
  heaveDur: string; // period — deliberately NOT matching wave scroll speed
  roll: string;
  rollDur: string;  // different period than heave for organic feel
  surge: string;
  surgeDur: string;
  brightness: number;
  dropShadow: string;
}

const MOTION: Record<SeaState, MotionCfg> = {
  calm: {
    heave: 'yt-ship2-heave-calm',   heaveDur: '5.5s',
    roll:  'yt-ship2-roll-calm',    rollDur: '7s',
    surge: 'yt-ship2-surge-calm',   surgeDur: '9s',
    brightness: 1.1,
    dropShadow: '0 2px 8px rgba(26, 15, 10, 0.3)',
  },
  choppy: {
    heave: 'yt-ship2-heave-choppy', heaveDur: '3.2s',
    roll:  'yt-ship2-roll-choppy',  rollDur: '4.5s',
    surge: 'yt-ship2-surge-choppy', surgeDur: '6s',
    brightness: 1,
    dropShadow: '0 3px 12px rgba(26, 15, 10, 0.4)',
  },
  rough: {
    heave: 'yt-ship2-heave-rough',  heaveDur: '2s',
    roll:  'yt-ship2-roll-rough',   rollDur: '2.8s',
    surge: 'yt-ship2-surge-rough',  surgeDur: '3.5s',
    brightness: 0.9,
    dropShadow: '0 4px 16px rgba(26, 15, 10, 0.5)',
  },
  storm: {
    heave: 'yt-ship2-heave-storm',  heaveDur: '1.3s',
    roll:  'yt-ship2-roll-storm',   rollDur: '1.8s',
    surge: 'yt-ship2-surge-storm',  surgeDur: '2.2s',
    brightness: 0.75,
    dropShadow: '0 6px 24px rgba(26, 15, 10, 0.7)',
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export default function DramaticShip({ seaState }: Props): JSX.Element {
  const [lightningHit, setLightningHit] = useState(false);

  useEffect(() => { injectKeyframes(); }, []);

  // Lightning illumination (storm only)
  useEffect(() => {
    if (seaState !== 'storm') { setLightningHit(false); return; }
    let t: number, dead = false;
    const go = () => {
      t = window.setTimeout(() => {
        if (dead) return;
        setLightningHit(true);
        window.setTimeout(() => { if (!dead) setLightningHit(false); }, 700);
        go();
      }, 2500 + Math.random() * 4500);
    };
    go();
    return () => { dead = true; clearTimeout(t); };
  }, [seaState]);

  const m = MOTION[seaState] || MOTION.calm;

  const shipUrl = useMemo(() => {
    try { return chrome.runtime.getURL('src/assets/ship-icon.png'); }
    catch { return ''; }
  }, []);

  // Three nested divs — each with its own keyframe and period.
  // Because the periods are all different primes-ish ratios,
  // the combined motion never repeats exactly, giving organic feel.
  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '64px',
      height: '64px',
      zIndex: 1,
    }}>
      {/* Layer 1: Surge (horizontal drift) */}
      <div style={{
        animation: `${m.surge} ${m.surgeDur} ease-in-out infinite`,
      }}>
        {/* Layer 2: Heave (vertical bob) */}
        <div style={{
          animation: `${m.heave} ${m.heaveDur} ease-in-out infinite`,
        }}>
          {/* Layer 3: Roll (rotation) */}
          <div style={{
            animation: `${m.roll} ${m.rollDur} ease-in-out infinite`,
            transformOrigin: 'center 70%', // pivot below center for natural roll
          }}>
            {/* Ship PNG */}
            <img
              src={shipUrl}
              alt=""
              width={48}
              height={48}
              style={{
                display: 'block',
                filter: `brightness(${m.brightness}) drop-shadow(${m.dropShadow})${
                  lightningHit ? ' brightness(2) drop-shadow(0 0 12px rgba(245,230,200,0.8))' : ''
                }`,
                ...(lightningHit && {
                  animation: 'yt-ship2-flash 700ms ease-out forwards',
                }),
                // Warm tint via sepia + hue-rotate to match parchment palette
                imageRendering: 'auto',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
