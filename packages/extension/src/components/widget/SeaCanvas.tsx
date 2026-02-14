import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { SeaState } from '@yt-detox/shared';

/**
 * SeaCanvas — Canvas 2D ocean + ship renderer.
 *
 * Layered sine waves + Simplex noise. Ship rides the wave surface.
 * Foam rendered as slope-based continuous whitecaps — wherever the
 * front wave is falling after a crest, a cream-colored fill appears
 * proportional to steepness. No circles, no blobs.
 */

interface Props {
  seaState: SeaState;
  composite: number; // 0..1
}

// ─── Simplex 2D noise ───────────────────────────────────────────────────────

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
const perm = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 42;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

function simplex2(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t, Y0 = j - t;
  const x0 = x - X0, y0 = y - Y0;
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  const dot = (gi: number, dx: number, dy: number) => {
    const g = grad3[gi % 8];
    return g[0] * dx + g[1] * dy;
  };
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * dot(perm[ii + perm[jj]], x0, y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * dot(perm[ii + i1 + perm[jj + j1]], x1, y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * dot(perm[ii + 1 + perm[jj + 1]], x2, y2); }
  return 70 * (n0 + n1 + n2);
}

// ─── Wave layer config ──────────────────────────────────────────────────────

interface WaveLayer {
  amp: number;
  freq: number;
  speed: number;       // SLOW — calm ~0.15, storm ~0.8
  noiseAmp: number;
  noiseFreq: number;
  fillTop: string;
  fillBot: string;
  crestColor: string;
  crestWidth: number;
}

interface SeaCfg {
  layers: WaveLayer[];
  foamIntensity: number;  // 0..1 — controls whitecap opacity on breaking faces
  rainCount: number;
  windCount: number;      // horizontal wind streaks
  stormOverlay: number;
  shipAmpMult: number;
}

const P = {
  deepOcean:   '#0a1a3a',
  midOcean:    '#143052',
  shallowSea:  '#1e4a6e',
  crestGold:   '#e8b84d',
  crestAmber:  '#d4955a',
  crestLight:  '#7eb8d8',
  foamCream:   '#d0e8f5',
  foamBright:  '#e8f4ff',
  rainGold:    '#8ab4d0',
  stormDark:   '#060e1e',
  flashWarm:   '#c8ddef',
};

function getCfg(state: SeaState, sub: number): SeaCfg {
  const s = 0.7 + sub * 0.3;
  switch (state) {
    case 'calm':
      return {
        layers: [
          { amp: 3*s, freq: 0.018, speed: 0.15, noiseAmp: 1.5*s, noiseFreq: 0.008, fillTop: P.shallowSea, fillBot: P.midOcean, crestColor: P.crestLight, crestWidth: 1 },
          { amp: 2*s, freq: 0.012, speed: 0.08, noiseAmp: 1*s, noiseFreq: 0.005, fillTop: P.midOcean, fillBot: P.deepOcean, crestColor: P.crestGold, crestWidth: 0.5 },
        ],
        foamIntensity: 0.1, rainCount: 0, windCount: 0,
        stormOverlay: 0, shipAmpMult: 0.8,
      };
    case 'choppy':
      return {
        layers: [
          { amp: 5*s, freq: 0.022, speed: 0.3, noiseAmp: 3*s, noiseFreq: 0.012, fillTop: P.shallowSea, fillBot: P.midOcean, crestColor: P.crestGold, crestWidth: 1.5 },
          { amp: 3.5*s, freq: 0.035, speed: 0.45, noiseAmp: 2*s, noiseFreq: 0.015, fillTop: P.midOcean, fillBot: P.deepOcean, crestColor: P.crestAmber, crestWidth: 1 },
          { amp: 2*s, freq: 0.01, speed: 0.12, noiseAmp: 1*s, noiseFreq: 0.006, fillTop: P.deepOcean, fillBot: P.deepOcean, crestColor: P.crestGold, crestWidth: 0.5 },
        ],
        foamIntensity: 0.3, rainCount: 0, windCount: 0,
        stormOverlay: 0, shipAmpMult: 1,
      };
    case 'rough':
      return {
        layers: [
          { amp: 8*s, freq: 0.028, speed: 0.5, noiseAmp: 5*s, noiseFreq: 0.014, fillTop: P.shallowSea, fillBot: P.midOcean, crestColor: P.crestGold, crestWidth: 2 },
          { amp: 6*s, freq: 0.04, speed: 0.7, noiseAmp: 3*s, noiseFreq: 0.02, fillTop: P.midOcean, fillBot: P.deepOcean, crestColor: P.crestAmber, crestWidth: 1.5 },
          { amp: 3*s, freq: 0.015, speed: 0.2, noiseAmp: 2*s, noiseFreq: 0.008, fillTop: P.deepOcean, fillBot: P.deepOcean, crestColor: P.crestGold, crestWidth: 1 },
        ],
        foamIntensity: 0.5, rainCount: 30, windCount: 4,
        stormOverlay: 0.12, shipAmpMult: 1.2,
      };
    case 'storm':
      return {
        layers: [
          { amp: 14*s, freq: 0.032, speed: 1.0, noiseAmp: 9*s, noiseFreq: 0.02, fillTop: P.shallowSea, fillBot: P.midOcean, crestColor: P.crestGold, crestWidth: 3 },
          { amp: 11*s, freq: 0.05, speed: 1.4, noiseAmp: 6*s, noiseFreq: 0.028, fillTop: P.midOcean, fillBot: P.deepOcean, crestColor: P.crestAmber, crestWidth: 2.5 },
          { amp: 6*s, freq: 0.02, speed: 0.5, noiseAmp: 4*s, noiseFreq: 0.015, fillTop: P.deepOcean, fillBot: P.deepOcean, crestColor: P.crestGold, crestWidth: 1.5 },
        ],
        foamIntensity: 0.85, rainCount: 70, windCount: 20,
        stormOverlay: 0.3, shipAmpMult: 1.8,
      };
    default:
      return getCfg('calm', sub);
  }
}

// ─── Wave math ──────────────────────────────────────────────────────────────

function waveY(x: number, t: number, layer: WaveLayer): number {
  return (
    Math.sin(x * layer.freq + t * layer.speed) * layer.amp +
    Math.sin(x * layer.freq * 2.3 + t * layer.speed * 1.7) * layer.amp * 0.3 +
    simplex2(x * layer.noiseFreq + t * 0.1, t * 0.05) * layer.noiseAmp
  );
}

function compositeWaveY(x: number, t: number, layers: WaveLayer[]): number {
  if (layers.length === 0) return 0;
  return waveY(x, t, layers[0]);
}

function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SeaCanvas({ seaState, composite }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shipImgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);
  const lightningRef = useRef(0);

  const sub = useMemo(() => {
    if (composite < 0.25) return composite / 0.25;
    if (composite < 0.5) return (composite - 0.25) / 0.25;
    if (composite < 0.75) return (composite - 0.5) / 0.25;
    return (composite - 0.75) / 0.25;
  }, [composite]);

  const cfg = useMemo(() => getCfg(seaState, sub), [seaState, sub]);

  useEffect(() => {
    const img = new Image();
    try { img.src = chrome.runtime.getURL('src/assets/ship-icon.png'); }
    catch { return; }
    img.onload = () => { shipImgRef.current = img; };
  }, []);

  useEffect(() => {
    if (seaState !== 'storm') return;
    let dead = false;
    const go = () => {
      setTimeout(() => {
        if (dead) return;
        lightningRef.current = performance.now();
        go();
      }, 1500 + Math.random() * 4000); // More frequent lightning in storm
    };
    go();
    return () => { dead = true; };
  }, [seaState]);

  const rainPos = useMemo(() =>
    Array.from({ length: cfg.rainCount }, (_, i) => ({
      xPct: sr(i + 100),
      speed: 50 + sr(i + 200) * 80,
      len: 5 + sr(i + 300) * 10,
      drift: seaState === 'storm' ? -0.35 : -0.2,
    })),
  [cfg.rainCount, seaState]);

  // Wind streaks — long horizontal lines that fly right-to-left
  const windPos = useMemo(() =>
    Array.from({ length: cfg.windCount }, (_, i) => ({
      yPct: 0.03 + sr(i + 2000) * 0.6,   // spread more across bar height
      speed: seaState === 'storm' ? 120 + sr(i + 2100) * 200 : 60 + sr(i + 2100) * 100,
      length: seaState === 'storm' ? 50 + sr(i + 2200) * 100 : 30 + sr(i + 2200) * 60,
      phase: sr(i + 2300) * 400,
      alpha: seaState === 'storm' ? 0.1 + sr(i + 2400) * 0.15 : 0.06 + sr(i + 2400) * 0.1,
    })),
  [cfg.windCount, seaState]);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const t = timestamp * 0.001;

    ctx.clearRect(0, 0, w, h);

    // ── Ocean base gradient ──
    const baseGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
    baseGrad.addColorStop(0, 'transparent');
    baseGrad.addColorStop(0.3, P.deepOcean + '60');
    baseGrad.addColorStop(1, P.deepOcean + 'cc');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, h);

    // ── Storm overlay ──
    if (cfg.stormOverlay > 0) {
      ctx.fillStyle = P.stormDark;
      ctx.globalAlpha = cfg.stormOverlay;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // ── Lightning ──
    const lightningAge = timestamp - lightningRef.current;
    if (lightningAge < 500 && seaState === 'storm') {
      const flash1 = lightningAge < 80 ? 0.25 * (1 - lightningAge / 80) : 0;
      const flash2 = (lightningAge > 180 && lightningAge < 280) ? 0.15 * (1 - (lightningAge - 180) / 100) : 0;
      const flashA = flash1 + flash2;
      if (flashA > 0) {
        ctx.fillStyle = P.flashWarm;
        ctx.globalAlpha = flashA;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }

    // ── Wave layers (back to front) ──
    const baseY = h * 0.55;
    const step = 2;

    // Store front wave points for foam pass
    let frontPoints: [number, number][] | null = null;

    for (let li = cfg.layers.length - 1; li >= 0; li--) {
      const layer = cfg.layers[li];
      const depthScale = li === 0 ? 1 : 0.6 + li * 0.1;

      const points: [number, number][] = [];
      for (let x = 0; x <= w; x += step) {
        const y = baseY + waveY(x, t, layer) * depthScale + li * 6;
        points.push([x, y]);
      }

      if (li === 0) frontPoints = points;

      // Wave body fill
      const minY = Math.min(...points.map(p => p[1]));
      const waveGrad = ctx.createLinearGradient(0, minY, 0, h);
      waveGrad.addColorStop(0, layer.fillTop);
      waveGrad.addColorStop(1, layer.fillBot);

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (const [px, py] of points) ctx.lineTo(px, py);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = waveGrad;
      ctx.globalAlpha = li === 0 ? 0.9 : 0.5 + li * 0.1;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Crest highlight line
      if (layer.crestWidth > 0) {
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
          if (i === 0) ctx.moveTo(points[i][0], points[i][1]);
          else ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.strokeStyle = layer.crestColor;
        ctx.lineWidth = layer.crestWidth;
        ctx.globalAlpha = li === 0 ? 0.7 : 0.35;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ── Slope-based foam on front wave ──
    // Where the wave surface is descending (positive dY = going down on screen
    // = the "breaking" face after a crest), paint a cream fill between the
    // wave surface and a few pixels below. Intensity ∝ slope steepness.
    if (frontPoints && cfg.foamIntensity > 0) {
      for (let i = 1; i < frontPoints.length; i++) {
        const [x0, y0] = frontPoints[i - 1];
        const [x1, y1] = frontPoints[i];
        const slope = (y1 - y0) / step; // positive = wave going down (breaking)

        if (slope > 0.05) {
          // Foam intensity scales with how steep the breaking face is
          const intensity = Math.min(1, slope * 3) * cfg.foamIntensity;
          const foamDepth = 2 + slope * 6; // how far below the surface the foam extends

          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.lineTo(x1, y1 + foamDepth);
          ctx.lineTo(x0, y0 + foamDepth);
          ctx.closePath();
          ctx.fillStyle = P.foamCream;
          ctx.globalAlpha = intensity * 0.5;
          ctx.fill();

          // Bright edge right at the surface
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.strokeStyle = P.foamBright;
          ctx.lineWidth = 1 + slope * 2;
          ctx.globalAlpha = intensity * 0.7;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // ── Wind streaks (horizontal, right-to-left) ──
    if (windPos.length > 0) {
      for (const wind of windPos) {
        const wy = wind.yPct * h;
        // Streak moves right-to-left, wraps around
        const wx = ((wind.phase + t * wind.speed) % (w + wind.length * 2)) - wind.length;
        const streakX = w - wx; // right-to-left

        // Gradient fade: transparent → visible → transparent
        const grad = ctx.createLinearGradient(streakX - wind.length, wy, streakX, wy);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.2, P.foamCream);
        grad.addColorStop(0.8, P.foamCream);
        grad.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.moveTo(streakX - wind.length, wy);
        ctx.lineTo(streakX, wy);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.globalAlpha = wind.alpha;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Rain (diagonal streaks, right-to-left) ──
    if (rainPos.length > 0) {
      ctx.lineWidth = 1;
      for (const rain of rainPos) {
        // Rain falls top-to-bottom and drifts right-to-left
        const rx = ((rain.xPct * w + t * rain.drift * 60) % (w + 20)) - 10;
        const ry = ((t * rain.speed + rain.xPct * 200) % (h + rain.len * 2)) - rain.len;
        ctx.strokeStyle = P.rainGold;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + rain.drift * rain.len, ry + rain.len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Ship ──
    const shipImg = shipImgRef.current;
    if (shipImg) {
      const shipX = 24;
      const shipSize = 36;
      const cx = shipX + shipSize / 2;
      const frontWave = compositeWaveY(cx, t, cfg.layers);
      const shipY = baseY + frontWave * cfg.shipAmpMult - shipSize * 0.7;

      const dx = 4;
      const yL = compositeWaveY(cx - dx, t, cfg.layers);
      const yR = compositeWaveY(cx + dx, t, cfg.layers);
      const slope = (yR - yL) / (dx * 2);
      const angle = Math.atan(slope * cfg.shipAmpMult) * 0.6;

      ctx.save();
      ctx.translate(cx, shipY + shipSize / 2);
      ctx.rotate(angle);
      ctx.shadowColor = 'rgba(232, 184, 77, 0.3)';
      ctx.shadowBlur = 6;

      if (lightningAge < 300 && seaState === 'storm') {
        ctx.filter = 'brightness(2)';
        ctx.shadowColor = 'rgba(245, 230, 200, 0.8)';
        ctx.shadowBlur = 16;
      }

      ctx.drawImage(shipImg, -shipSize / 2, -shipSize / 2, shipSize, shipSize);
      ctx.filter = 'none';
      ctx.shadowBlur = 0;
      ctx.restore();

      // Wake V-lines behind ship
      if (seaState !== 'calm') {
        const wakeX = cx + shipSize * 0.4;
        const wakeBaseY = baseY + compositeWaveY(wakeX, t, cfg.layers) * cfg.shipAmpMult;
        ctx.strokeStyle = P.foamCream;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < 3; i++) {
          const off = i * 7 + Math.sin(t * 1.5 + i) * 2;
          ctx.beginPath();
          ctx.moveTo(wakeX + off, wakeBaseY - 1);
          ctx.lineTo(wakeX + off + 5, wakeBaseY - 2 - i);
          ctx.moveTo(wakeX + off, wakeBaseY + 1);
          ctx.lineTo(wakeX + off + 5, wakeBaseY + 2 + i);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [cfg, rainPos, windPos, seaState]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={340}
      height={72}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        borderRadius: 'inherit',
      }}
    />
  );
}
