import { useState, useEffect, useMemo } from 'react';
import type { SeaState } from '@yt-detox/shared';

/**
 * SeaEffects — warm maritime overlay for the widget bar.
 *
 * Palette: amber / gold / teal / sienna. NO blue. NO white waves.
 * Waves scroll independently from ship motion so the ship appears
 * to fight the sea rather than ride it.
 */

interface SeaEffectsProps {
  seaState: SeaState;
  composite: number; // 0..1
}

// ─── Keyframes ───────────────────────────────────────────────────────────────

const STYLE_ID = 'yt-detox-sea-fx-v2';

function injectKeyframes(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    /* Horizontal wave scroll (doubled width tiles seamlessly) */
    @keyframes yt-sea2-scroll {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }

    /* Foam particle — rises and fades */
    @keyframes yt-sea2-foam {
      0%   { transform: translateY(0) scale(1); opacity: 0.6; }
      60%  { opacity: 0.35; }
      100% { transform: translateY(-14px) scale(0.3); opacity: 0; }
    }

    /* Rain — warm golden streaks falling diagonally */
    @keyframes yt-sea2-rain {
      0%   { transform: translateY(-10px) translateX(0); opacity: var(--drop-a, 0.2); }
      100% { transform: translateY(80px) translateX(var(--drop-dx, -6px)); opacity: 0; }
    }

    /* Horizontal wind streaks */
    @keyframes yt-sea2-wind {
      0%   { transform: translateX(-15%); opacity: 0; }
      20%  { opacity: var(--wind-a, 0.1); }
      80%  { opacity: var(--wind-a, 0.1); }
      100% { transform: translateX(115%); opacity: 0; }
    }

    /* Lightning double-strike — warm parchment flash */
    @keyframes yt-sea2-lightning {
      0%   { opacity: 0; }
      4%   { opacity: 0.25; }
      15%  { opacity: 0; }
      36%  { opacity: 0; }
      40%  { opacity: 0.15; }
      48%  { opacity: 0; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// ─── Warm wave SVG paths ─────────────────────────────────────────────────────
// Two different wave shapes for parallax depth.
const WAVE_A = 'M0,5 Q25,0 50,5 Q75,10 100,5 Q125,0 150,5 Q175,10 200,5';
const WAVE_B = 'M0,6 Q20,2 45,6 Q65,10 90,6 Q115,2 140,6 Q165,10 200,6';

// ─── Palette — warm amber / teal / sienna ────────────────────────────────────
const C = {
  // Wave fills — layered dark-to-light for depth
  seaDeep:     '#1a2e2a',  // darkest teal
  seaMid:      '#264040',  // mid teal-green
  waveGold:    '#b8956a',  // golden crest
  waveSienna:  '#8b6914',  // deep amber
  waveAmber:   '#d4a574',  // bright gold highlight

  // Foam / spray
  foamGold:    '#e8d5b7',  // parchment foam
  foamAmber:   '#c4956a',  // amber foam

  // Rain
  rainGold:    '#b8956a',

  // Wind streaks
  windGold:    '#d4a574',

  // Lightning
  flashWarm:   '#f5e6c8',  // warm parchment flash (not white)

  // Storm overlay
  stormDark:   '#1a0f0a',  // dark mahogany
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface WaveCfg {
  path: string;
  dur: string;
  opacity: number;
  yOff: number;
  ampScale: number;
  fill: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SeaEffects({ seaState, composite }: SeaEffectsProps): JSX.Element {
  // Sub-intensity within the current bracket (0..1)
  const sub = useMemo(() => {
    if (composite < 0.25) return composite / 0.25;
    if (composite < 0.5) return (composite - 0.25) / 0.25;
    if (composite < 0.75) return (composite - 0.5) / 0.25;
    return (composite - 0.75) / 0.25;
  }, [composite]);

  useEffect(() => { injectKeyframes(); }, []);

  // ── Lightning ──
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (seaState !== 'storm') { setFlash(false); return; }
    let t: number, dead = false;
    const go = () => {
      t = window.setTimeout(() => {
        if (dead) return;
        setFlash(true);
        window.setTimeout(() => { if (!dead) setFlash(false); }, 500);
        go();
      }, 2500 + Math.random() * 5000);
    };
    go();
    return () => { dead = true; clearTimeout(t); };
  }, [seaState]);

  // ── Wave configs ──
  const waves: WaveCfg[] = useMemo(() => {
    const s = 0.7 + sub * 0.3;
    switch (seaState) {
      case 'calm':
        return [
          { path: WAVE_A, dur: '12s', opacity: +(0.25 * s).toFixed(2), yOff: 0, ampScale: 1, fill: C.seaMid },
          { path: WAVE_B, dur: '18s', opacity: +(0.15 * s).toFixed(2), yOff: -2, ampScale: 0.8, fill: C.seaDeep },
        ];
      case 'choppy':
        return [
          { path: WAVE_A, dur: '7s', opacity: +(0.4 * s).toFixed(2), yOff: 0, ampScale: 1.4, fill: C.waveGold },
          { path: WAVE_B, dur: '10s', opacity: +(0.25 * s).toFixed(2), yOff: -3, ampScale: 1.1, fill: C.waveSienna },
          { path: WAVE_A, dur: '15s', opacity: +(0.15 * s).toFixed(2), yOff: -5, ampScale: 0.9, fill: C.seaMid },
        ];
      case 'rough':
        return [
          { path: WAVE_A, dur: '4s', opacity: +(0.45 * s).toFixed(2), yOff: 0, ampScale: 2, fill: C.waveAmber },
          { path: WAVE_B, dur: '5.5s', opacity: +(0.35 * s).toFixed(2), yOff: -4, ampScale: 1.7, fill: C.waveGold },
          { path: WAVE_A, dur: '8s', opacity: +(0.2 * s).toFixed(2), yOff: -8, ampScale: 1.3, fill: C.waveSienna },
        ];
      case 'storm':
        return [
          { path: WAVE_A, dur: '2.5s', opacity: +(0.55 * s).toFixed(2), yOff: 2, ampScale: 3, fill: C.waveAmber },
          { path: WAVE_B, dur: '3.2s', opacity: +(0.4 * s).toFixed(2), yOff: -3, ampScale: 2.4, fill: C.waveGold },
          { path: WAVE_A, dur: '4.5s', opacity: +(0.25 * s).toFixed(2), yOff: -8, ampScale: 1.8, fill: C.waveSienna },
          { path: WAVE_B, dur: '6s', opacity: +(0.15 * s).toFixed(2), yOff: -12, ampScale: 1.3, fill: C.seaMid },
        ];
      default:
        return [];
    }
  }, [seaState, sub]);

  // ── Foam dots (choppy+) ──
  const foamCount = seaState === 'calm' ? 0 : seaState === 'choppy' ? 5 : seaState === 'rough' ? 8 : 12;
  const foamDots = useMemo(() => Array.from({ length: foamCount }, (_, i) => ({
    left: `${(sr(i + 500) * 100).toFixed(1)}%`,
    bottom: 2 + Math.round(sr(i + 600) * 8),
    size: 2 + Math.round(sr(i + 700) * 2),
    dur: `${(1.5 + sr(i + 800) * 2).toFixed(1)}s`,
    delay: `${(sr(i + 900) * 3).toFixed(1)}s`,
    color: sr(i + 950) > 0.5 ? C.foamGold : C.foamAmber,
  })), [foamCount]);

  // ── Rain drops (rough/storm) ──
  const rainCount = seaState === 'rough' ? 15 : seaState === 'storm' ? 30 : 0;
  const rainDrops = useMemo(() => Array.from({ length: rainCount }, (_, i) => ({
    left: `${(sr(i) * 100).toFixed(1)}%`,
    h: Math.round(6 + sr(i + 100) * 10),
    a: +(0.12 + sr(i + 200) * 0.18).toFixed(2),
    dur: `${(0.4 + sr(i + 300) * 0.8).toFixed(2)}s`,
    delay: `${(sr(i + 400) * 2).toFixed(2)}s`,
    dx: `${seaState === 'storm' ? -8 : -4}px`,
  })), [rainCount, seaState]);

  // ── Wind streaks (rough/storm) ──
  const windCount = seaState === 'rough' ? 3 : seaState === 'storm' ? 5 : 0;
  const windStreaks = useMemo(() => Array.from({ length: windCount }, (_, i) => ({
    top: `${10 + sr(i + 1000) * 55}%`,
    dur: `${(0.6 + sr(i + 1100) * 1).toFixed(1)}s`,
    delay: `${(sr(i + 1200) * 3).toFixed(1)}s`,
    a: seaState === 'storm' ? 0.12 : 0.08,
  })), [windCount, seaState]);

  // ── Storm overlay gradient ──
  const stormBg = seaState === 'storm'
    ? `linear-gradient(180deg, ${C.stormDark}55 0%, ${C.stormDark}22 100%)`
    : seaState === 'rough'
      ? `linear-gradient(180deg, ${C.stormDark}30 0%, transparent 100%)`
      : 'none';

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      overflow: 'hidden', pointerEvents: 'none', borderRadius: 'inherit',
    }}>
      {/* Atmospheric overlay for rough / storm */}
      {(seaState === 'rough' || seaState === 'storm') && (
        <div style={{ position: 'absolute', inset: 0, background: stormBg, pointerEvents: 'none' }} />
      )}

      {/* ── Wave layers ── */}
      {waves.map((w, i) => (
        <div
          key={`w-${i}`}
          style={{
            position: 'absolute',
            bottom: w.yOff,
            left: 0,
            width: '200%',
            height: `${10 * w.ampScale}px`,
            opacity: w.opacity,
            pointerEvents: 'none',
            animation: `yt-sea2-scroll ${w.dur} linear infinite`,
          }}
        >
          <svg viewBox="0 0 200 10" preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: '100%' }}>
            <path d={w.path} fill={w.fill} />
          </svg>
        </div>
      ))}

      {/* ── Foam particles ── */}
      {foamDots.map((d, i) => (
        <div key={`f-${i}`} style={{
          position: 'absolute', left: d.left, bottom: d.bottom,
          width: d.size, height: d.size, borderRadius: '50%',
          background: d.color, pointerEvents: 'none', opacity: 0,
          animation: `yt-sea2-foam ${d.dur} ease-out ${d.delay} infinite`,
        }} />
      ))}

      {/* ── Rain drops (warm golden) ── */}
      {rainDrops.map((d, i) => (
        <div key={`r-${i}`} style={{
          position: 'absolute', top: 0, left: d.left,
          width: 1, height: d.h, background: C.rainGold,
          pointerEvents: 'none', opacity: 0,
          ['--drop-a' as string]: d.a,
          ['--drop-dx' as string]: d.dx,
          animation: `yt-sea2-rain ${d.dur} linear ${d.delay} infinite`,
        }} />
      ))}

      {/* ── Wind streaks (gold) ── */}
      {windStreaks.map((w, i) => (
        <div key={`gust-${i}`} style={{
          position: 'absolute', top: w.top, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${C.windGold}${Math.round(w.a * 255).toString(16).padStart(2, '0')} 30%, ${C.windGold}${Math.round(w.a * 255).toString(16).padStart(2, '0')} 70%, transparent 100%)`,
          pointerEvents: 'none', opacity: 0,
          ['--wind-a' as string]: w.a,
          animation: `yt-sea2-wind ${w.dur} linear ${w.delay} infinite`,
        }} />
      ))}

      {/* ── Lightning flash (warm parchment, not white) ── */}
      {seaState === 'storm' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: C.flashWarm, pointerEvents: 'none',
          opacity: flash ? 1 : 0,
          animation: flash ? 'yt-sea2-lightning 500ms ease-out forwards' : 'none',
        }} />
      )}
    </div>
  );
}
