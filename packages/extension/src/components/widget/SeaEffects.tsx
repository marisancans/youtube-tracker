import { useState, useEffect, useMemo } from 'react';
import type { SeaState } from '@yt-detox/shared';

interface SeaEffectsProps {
  seaState: SeaState;
  composite: number;
}

// ─── Keyframe ID (unique to avoid clashing in shadow DOM) ───
const STYLE_ID = 'yt-detox-sea-effects-keyframes';

function injectKeyframes(host: ShadowRoot | Document): void {
  const root = host instanceof ShadowRoot ? host : document;
  if (root.getElementById?.(STYLE_ID)) return;
  // For shadow DOM we append to the shadow root; for document we append to <head>.
  const container = host instanceof ShadowRoot ? host : document.head;
  if (container.querySelector(`#${STYLE_ID}`)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes yt-sea-wave-scroll {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    @keyframes yt-sea-rain-fall {
      0%   { transform: translateY(-20px) translateX(0px); opacity: var(--rain-opacity, 0.2); }
      100% { transform: translateY(40px) translateX(var(--rain-drift, -4px)); opacity: 0; }
    }
    @keyframes yt-sea-foam-rise {
      0%   { transform: translateY(0) scale(1); opacity: 0.7; }
      60%  { opacity: 0.5; }
      100% { transform: translateY(-18px) scale(0.4); opacity: 0; }
    }
    @keyframes yt-sea-wind-streak {
      0%   { transform: translateX(-10%); opacity: 0; }
      15%  { opacity: var(--wind-opacity, 0.12); }
      85%  { opacity: var(--wind-opacity, 0.12); }
      100% { transform: translateX(110%); opacity: 0; }
    }
    @keyframes yt-sea-lightning-double {
      0%   { opacity: 0; }
      5%   { opacity: 0.3; }
      18%  { opacity: 0; }
      38%  { opacity: 0; }
      42%  { opacity: 0.18; }
      50%  { opacity: 0; }
      100% { opacity: 0; }
    }
  `;
  container.appendChild(style);
}

// ─── Deterministic pseudo-random (seeded by index) ───
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// ─── Wave Path ───
// Smooth sine-wave that tiles seamlessly: first half = one full cycle, repeated.
const WAVE_PATH = 'M0,5 Q25,0 50,5 Q75,10 100,5 Q125,0 150,5 Q175,10 200,5';

interface WaveConfig {
  duration: string;
  opacity: number;
  yOffset: number;
  amplitude: number;   // scale Y for more drama
  color: string;
}

interface RainDrop {
  left: string;
  height: number;
  opacity: number;
  duration: string;
  delay: string;
  drift: string;
}

interface FoamDot {
  left: string;
  bottom: number;
  size: number;
  duration: string;
  delay: string;
}

interface WindStreak {
  top: string;
  duration: string;
  delay: string;
  opacity: number;
  height: number;
}

// ─── Component ───

export default function SeaEffects({ seaState, composite }: SeaEffectsProps): JSX.Element {
  // Use composite for smooth interpolation within each sea-state bracket.
  // This gives a 0-1 sub-range within the current state.
  const subIntensity = useMemo(() => {
    if (composite < 0.25) return composite / 0.25;
    if (composite < 0.50) return (composite - 0.25) / 0.25;
    if (composite < 0.75) return (composite - 0.50) / 0.25;
    return (composite - 0.75) / 0.25;
  }, [composite]);

  // Inject keyframes on mount (works in shadow DOM or normal DOM)
  useEffect(() => {
    // Walk up to find shadow root, or fall back to document
    const el = document.getElementById(STYLE_ID);
    if (!el) {
      // Attempt shadow root detection — the widget is rendered inside a shadow DOM host.
      // React doesn't expose the shadow root easily, so we inject into document as fallback.
      injectKeyframes(document);
    }
  }, []);

  // ─── Lightning state ───
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (seaState !== 'storm') {
      setFlash(false);
      return;
    }
    let timeout: number;
    let cancelled = false;
    const scheduleFlash = () => {
      const delay = 3000 + Math.random() * 5000; // 3-8 seconds
      timeout = window.setTimeout(() => {
        if (cancelled) return;
        setFlash(true);
        window.setTimeout(() => {
          if (!cancelled) setFlash(false);
        }, 500);
        scheduleFlash();
      }, delay);
    };
    scheduleFlash();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [seaState]);

  // ─── Wave configs by sea state ───
  // subIntensity scales opacity within a bracket for smoother transitions
  const waves: WaveConfig[] = useMemo(() => {
    const s = 0.7 + subIntensity * 0.3; // 0.7..1.0 scale factor
    switch (seaState) {
      case 'calm':
        return [
          { duration: '8s', opacity: +(0.15 * s).toFixed(2), yOffset: 0, amplitude: 1, color: '#0d9488' },
        ];
      case 'choppy':
        return [
          { duration: '6s', opacity: +(0.25 * s).toFixed(2), yOffset: 0, amplitude: 1.3, color: '#d4a574' },
          { duration: '9s', opacity: +(0.18 * s).toFixed(2), yOffset: -2, amplitude: 1.1, color: '#d4a574' },
        ];
      case 'rough':
        return [
          { duration: '4s', opacity: +(0.3 * s).toFixed(2), yOffset: 0, amplitude: 1.8, color: '#334155' },
          { duration: '6s', opacity: +(0.22 * s).toFixed(2), yOffset: -3, amplitude: 1.5, color: '#334155' },
          { duration: '8s', opacity: +(0.15 * s).toFixed(2), yOffset: -5, amplitude: 1.2, color: '#475569' },
        ];
      case 'storm':
        return [
          { duration: '2.5s', opacity: +(0.35 * s).toFixed(2), yOffset: 0, amplitude: 2.8, color: '#1e293b' },
          { duration: '3.5s', opacity: +(0.28 * s).toFixed(2), yOffset: -4, amplitude: 2.2, color: '#334155' },
          { duration: '5s', opacity: +(0.18 * s).toFixed(2), yOffset: -8, amplitude: 1.6, color: '#475569' },
        ];
      default:
        return [];
    }
  }, [seaState, subIntensity]);

  // ─── Rain drops ───
  const rainDrops: RainDrop[] = useMemo(() => {
    if (seaState !== 'rough' && seaState !== 'storm') return [];
    const count = seaState === 'storm' ? 35 : 18;
    const minOpacity = seaState === 'storm' ? 0.2 : 0.15;
    const maxOpacity = seaState === 'storm' ? 0.35 : 0.25;
    const minDuration = seaState === 'storm' ? 0.3 : 0.5;
    const maxDuration = seaState === 'storm' ? 1.0 : 1.5;
    const angle = seaState === 'storm' ? -8 : -4; // px of horizontal drift

    const drops: RainDrop[] = [];
    for (let i = 0; i < count; i++) {
      const r1 = seededRandom(i);
      const r2 = seededRandom(i + 100);
      const r3 = seededRandom(i + 200);
      const r4 = seededRandom(i + 300);
      drops.push({
        left: `${(r1 * 100).toFixed(1)}%`,
        height: Math.round(8 + r2 * 12),
        opacity: +(minOpacity + r3 * (maxOpacity - minOpacity)).toFixed(2),
        duration: `${(minDuration + r4 * (maxDuration - minDuration)).toFixed(2)}s`,
        delay: `${(seededRandom(i + 400) * 2).toFixed(2)}s`,
        drift: `${angle}px`,
      });
    }
    return drops;
  }, [seaState]);

  // ─── Foam particles (choppy only) ───
  const foamDots: FoamDot[] = useMemo(() => {
    if (seaState !== 'choppy') return [];
    const dots: FoamDot[] = [];
    for (let i = 0; i < 4; i++) {
      dots.push({
        left: `${15 + seededRandom(i + 500) * 70}%`,
        bottom: 2 + Math.round(seededRandom(i + 600) * 6),
        size: 2 + Math.round(seededRandom(i + 700)),
        duration: `${(2 + seededRandom(i + 800) * 2).toFixed(1)}s`,
        delay: `${(seededRandom(i + 900) * 3).toFixed(1)}s`,
      });
    }
    return dots;
  }, [seaState]);

  // ─── Wind streaks (rough/storm) ───
  const windStreaks: WindStreak[] = useMemo(() => {
    if (seaState !== 'rough' && seaState !== 'storm') return [];
    const count = seaState === 'storm' ? 4 : 3;
    const streaks: WindStreak[] = [];
    for (let i = 0; i < count; i++) {
      streaks.push({
        top: `${10 + seededRandom(i + 1000) * 60}%`,
        duration: `${(0.8 + seededRandom(i + 1100) * 1.2).toFixed(1)}s`,
        delay: `${(seededRandom(i + 1200) * 4).toFixed(1)}s`,
        opacity: seaState === 'storm' ? 0.15 : 0.1,
        height: 1,
      });
    }
    return streaks;
  }, [seaState]);

  // ─── Container style: absolute, covering the full bar ───
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    borderRadius: 'inherit',
  };

  // ─── Storm background overlay ───
  const stormOverlayStyle: React.CSSProperties | null =
    seaState === 'storm'
      ? {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(180deg, rgba(15,23,42,0.35) 0%, rgba(30,41,59,0.18) 100%)',
          pointerEvents: 'none',
        }
      : null;

  return (
    <div style={containerStyle}>
      {/* Storm dark overlay */}
      {stormOverlayStyle && <div style={stormOverlayStyle} />}

      {/* ─── Wave layers ─── */}
      {waves.map((wave, i) => (
        <div
          key={`wave-${i}`}
          style={{
            position: 'absolute',
            bottom: wave.yOffset,
            left: 0,
            width: '200%',
            height: `${10 * wave.amplitude}px`,
            opacity: wave.opacity,
            pointerEvents: 'none',
            animation: `yt-sea-wave-scroll ${wave.duration} linear infinite`,
          }}
        >
          <svg
            viewBox="0 0 200 10"
            preserveAspectRatio="none"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
            }}
          >
            <path d={WAVE_PATH} fill={wave.color} />
          </svg>
        </div>
      ))}

      {/* ─── Foam particles (choppy) ─── */}
      {foamDots.map((dot, i) => (
        <div
          key={`foam-${i}`}
          style={{
            position: 'absolute',
            left: dot.left,
            bottom: dot.bottom,
            width: dot.size,
            height: dot.size,
            borderRadius: '50%',
            background: 'white',
            pointerEvents: 'none',
            animation: `yt-sea-foam-rise ${dot.duration} ease-out ${dot.delay} infinite`,
            opacity: 0,
          }}
        />
      ))}

      {/* ─── Rain drops (rough / storm) ─── */}
      {rainDrops.map((drop, i) => (
        <div
          key={`rain-${i}`}
          style={{
            position: 'absolute',
            top: 0,
            left: drop.left,
            width: 1,
            height: drop.height,
            background: 'white',
            pointerEvents: 'none',
            opacity: 0,
            // CSS custom properties for the keyframe
            ['--rain-opacity' as string]: drop.opacity,
            ['--rain-drift' as string]: drop.drift,
            animation: `yt-sea-rain-fall ${drop.duration} linear ${drop.delay} infinite`,
          }}
        />
      ))}

      {/* ─── Wind streaks (rough / storm) ─── */}
      {windStreaks.map((streak, i) => (
        <div
          key={`wind-${i}`}
          style={{
            position: 'absolute',
            top: streak.top,
            left: 0,
            right: 0,
            height: streak.height,
            background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,${streak.opacity}) 30%, rgba(255,255,255,${streak.opacity}) 70%, transparent 100%)`,
            pointerEvents: 'none',
            ['--wind-opacity' as string]: streak.opacity,
            animation: `yt-sea-wind-streak ${streak.duration} linear ${streak.delay} infinite`,
            opacity: 0,
          }}
        />
      ))}

      {/* ─── Lightning flash (storm) ─── */}
      {seaState === 'storm' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'white',
            pointerEvents: 'none',
            opacity: flash ? 1 : 0,
            // The double-strike keyframe runs when flash is active
            animation: flash ? 'yt-sea-lightning-double 500ms ease-out forwards' : 'none',
          }}
        />
      )}
    </div>
  );
}
