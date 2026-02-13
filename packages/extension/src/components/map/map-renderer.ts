/**
 * Static map layer renderer — 17th-century maritime chart style.
 *
 * Draws an aged parchment ocean, nautical chart grid, ornate rope border,
 * ink voyage trail, illustrated sailing vessel, ornate star compass rose,
 * and dramatic treasure X marker.  All drawing uses Canvas 2D API with a
 * warm, layered colour palette inspired by real antique maps.
 */

import type { PathPoint, PathSegment, GeneratedPath } from './path-generator';
import { getDriftPathColor } from './path-generator';

// Re-export imported types so consumers can use them from either module.
export type { PathPoint, PathSegment, GeneratedPath };

// ── Palette ──────────────────────────────────────────────────────────────────

const PARCHMENT_LIGHT = '#f5e6c8';
const PARCHMENT = '#e8d5b7';
const PARCHMENT_DARK = '#c4a882';
const PARCHMENT_SHADOW = '#a08060';
const GOLD_DARK = '#8b6914';
const GOLD = '#b8956a';
const GOLD_LIGHT = '#d4a574';
const INK = '#2c1810';
const INK_LIGHT = '#5a3d2b';
const TEAL_DEEP = '#0a6b5f';
const CRIMSON = '#5c1010';
const DARK_RED = '#8b2020';
const SAIL_WHITE = '#f0e8d8';

// ── Deterministic hash helper ────────────────────────────────────────────────

/** Simple integer hash for deterministic pseudo-random placement. */
function hash32(a: number, b: number, seed: number): number {
  let h = (a * 374761393 + b * 668265263 + seed) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Returns 0-1 float from hash. */
function hashFloat(a: number, b: number, seed: number): number {
  return hash32(a, b, seed) / 4294967296;
}

// ── 1. Sea ───────────────────────────────────────────────────────────────────

/** Draw rich, layered aged parchment ocean background. */
export function drawSea(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  // Layer 0: Base parchment gradient (top-left lighter, bottom-right warmer)
  const baseGrad = ctx.createLinearGradient(0, 0, w, h);
  baseGrad.addColorStop(0, PARCHMENT_LIGHT);
  baseGrad.addColorStop(0.4, PARCHMENT);
  baseGrad.addColorStop(1, PARCHMENT_DARK);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Layer 1: Radial vignette — darker warm brown at edges, lighter centre
  const vignetteGrad = ctx.createRadialGradient(
    w * 0.5, h * 0.5, Math.min(w, h) * 0.15,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.75,
  );
  vignetteGrad.addColorStop(0, 'rgba(160, 128, 96, 0)');
  vignetteGrad.addColorStop(0.6, 'rgba(160, 128, 96, 0.04)');
  vignetteGrad.addColorStop(1, 'rgba(100, 70, 40, 0.14)');
  ctx.fillStyle = vignetteGrad;
  ctx.fillRect(0, 0, w, h);

  // Layer 2: Coffee stain watermarks — 4 deterministic spots
  const stainSeed = ((w * 13 + h * 7) | 0);
  const stains = [
    { fx: 0.2, fy: 0.3, r: 0.18, alpha: 0.04 },
    { fx: 0.7, fy: 0.2, r: 0.14, alpha: 0.035 },
    { fx: 0.4, fy: 0.75, r: 0.2, alpha: 0.05 },
    { fx: 0.85, fy: 0.65, r: 0.12, alpha: 0.03 },
  ];
  for (let si = 0; si < stains.length; si++) {
    const st = stains[si];
    // Offset positions deterministically
    const ox = hashFloat(si, 0, stainSeed) * 0.1 - 0.05;
    const oy = hashFloat(si, 1, stainSeed) * 0.1 - 0.05;
    const sx = (st.fx + ox) * w;
    const sy = (st.fy + oy) * h;
    const sr = st.r * Math.max(w, h);
    const stainGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    stainGrad.addColorStop(0, `rgba(140, 100, 55, ${st.alpha})`);
    stainGrad.addColorStop(0.5, `rgba(120, 85, 45, ${st.alpha * 0.6})`);
    stainGrad.addColorStop(1, 'rgba(120, 85, 45, 0)');
    ctx.fillStyle = stainGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // Layer 3: Organic grain — scattered arcs and small shapes (NOT a grid of dots)
  const grainStep = 11;
  for (let gx = 0; gx < w; gx += grainStep) {
    for (let gy = 0; gy < h; gy += grainStep) {
      const h1 = hash32(gx, gy, 42);
      // Only ~40% of positions get a mark
      if ((h1 & 7) > 2) continue;

      const px = gx + (h1 % 9) - 4;
      const py = gy + ((h1 >>> 4) % 9) - 4;
      const radius = 0.5 + ((h1 >>> 8) % 5) * 0.35;
      const alpha = 0.02 + ((h1 >>> 12) % 5) * 0.01;
      // Vary colour between warm browns and tans
      const rr = 100 + ((h1 >>> 16) % 60);
      const gg = 70 + ((h1 >>> 20) % 40);
      const bb = 30 + ((h1 >>> 24) % 20);
      ctx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;

      const shapeType = (h1 >>> 3) & 3;
      ctx.beginPath();
      if (shapeType === 0) {
        // Small arc
        const startAngle = ((h1 >>> 6) % 6);
        ctx.arc(px, py, radius, startAngle, startAngle + 2 + ((h1 >>> 10) % 3));
        ctx.fill();
      } else if (shapeType === 1) {
        // Tiny ellipse
        ctx.ellipse(px, py, radius, radius * 0.6, (h1 >>> 14) % 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Small circle
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Layer 4: Very subtle blue-teal ocean wash
  ctx.fillStyle = 'rgba(10, 107, 95, 0.03)';
  ctx.fillRect(0, 0, w, h);
}

// ── 2. Grid ──────────────────────────────────────────────────────────────────

/** Draw hand-drawn quality nautical chart grid lines with coordinate labels. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const SPACING = 80;
  const MAJOR_EVERY = 4; // every 4th line = 320px

  ctx.save();

  // Draw grid lines with hand-drawn wobble
  const drawWobbleLine = (
    x1: number, y1: number, x2: number, y2: number,
    lineW: number, alpha: number,
  ) => {
    ctx.strokeStyle = `rgba(139, 105, 20, ${alpha})`;
    ctx.lineWidth = lineW;
    ctx.beginPath();

    const isVertical = Math.abs(x2 - x1) < 1;
    const len = isVertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
    const steps = Math.ceil(len / 20);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      let px: number, py: number;
      if (isVertical) {
        const wobble = Math.sin(t * Math.PI * 3 + x1 * 0.1) * 0.3;
        px = x1 + wobble;
        py = y1 + (y2 - y1) * t;
      } else {
        px = x1 + (x2 - x1) * t;
        const wobble = Math.sin(t * Math.PI * 3 + y1 * 0.1) * 0.3;
        py = y1 + wobble;
      }
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  // Vertical lines
  let idx = 0;
  for (let x = SPACING; x < w; x += SPACING) {
    idx++;
    const isMajor = idx % MAJOR_EVERY === 0;
    const lineW = isMajor ? 0.6 : 0.3;
    const alpha = isMajor ? 0.2 : (0.12 + hashFloat(idx, 0, 777) * 0.06);
    drawWobbleLine(x, 0, x, h, lineW, alpha);
  }

  // Horizontal lines
  idx = 0;
  for (let y = SPACING; y < h; y += SPACING) {
    idx++;
    const isMajor = idx % MAJOR_EVERY === 0;
    const lineW = isMajor ? 0.6 : 0.3;
    const alpha = isMajor ? 0.2 : (0.12 + hashFloat(0, idx, 888) * 0.06);
    drawWobbleLine(0, y, w, y, lineW, alpha);
  }

  // Draw small + crosses at major intersections
  ctx.strokeStyle = `rgba(139, 105, 20, 0.22)`;
  ctx.lineWidth = 0.5;
  const majorSpacing = SPACING * MAJOR_EVERY;
  for (let mx = majorSpacing; mx < w; mx += majorSpacing) {
    for (let my = majorSpacing; my < h; my += majorSpacing) {
      const crossSize = 3;
      ctx.beginPath();
      ctx.moveTo(mx - crossSize, my);
      ctx.lineTo(mx + crossSize, my);
      ctx.moveTo(mx, my - crossSize);
      ctx.lineTo(mx, my + crossSize);
      ctx.stroke();
    }
  }

  // Coordinate labels at edges — latitude/longitude style
  ctx.fillStyle = `rgba(139, 105, 20, 0.18)`;
  ctx.font = '7px serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';

  idx = 0;
  for (let x = majorSpacing; x < w; x += majorSpacing) {
    idx++;
    const lonDeg = (idx * 5) % 180;
    const label = `${lonDeg}\u00B0W`;
    ctx.fillText(label, x, 3);
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  idx = 0;
  for (let y = majorSpacing; y < h; y += majorSpacing) {
    idx++;
    const latDeg = 60 - (idx * 5) % 90;
    const label = `${Math.abs(latDeg)}\u00B0${latDeg >= 0 ? 'N' : 'S'}`;
    ctx.fillText(label, 3, y);
  }

  ctx.restore();
}

// ── 3. Border ────────────────────────────────────────────────────────────────

/** Draw ornate double border with rope pattern, corner flourishes, and compass labels. */
export function drawBorder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.save();

  const OUTER_INSET = 12;
  const INNER_INSET = 24;

  // Outer border — thick dark gold
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 3;
  ctx.strokeRect(OUTER_INSET, OUTER_INSET, w - OUTER_INSET * 2, h - OUTER_INSET * 2);

  // Inner border — thinner lighter gold
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.lineWidth = 1;
  ctx.strokeRect(INNER_INSET, INNER_INSET, w - INNER_INSET * 2, h - INNER_INSET * 2);

  // Rope pattern between borders — alternating diagonal dashes
  const ropeColor = GOLD;
  ctx.strokeStyle = ropeColor;
  ctx.lineWidth = 1;
  const mid = (OUTER_INSET + INNER_INSET) / 2;
  const ropeStep = 8;
  const dashLen = 4;

  // Top edge rope
  for (let rx = OUTER_INSET + ropeStep; rx < w - OUTER_INSET; rx += ropeStep) {
    const dir = ((rx / ropeStep) | 0) % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(rx - dashLen * 0.4, mid - dir * dashLen * 0.4);
    ctx.lineTo(rx + dashLen * 0.4, mid + dir * dashLen * 0.4);
    ctx.stroke();
  }
  // Bottom edge rope
  const midB = h - mid;
  for (let rx = OUTER_INSET + ropeStep; rx < w - OUTER_INSET; rx += ropeStep) {
    const dir = ((rx / ropeStep) | 0) % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(rx - dashLen * 0.4, midB - dir * dashLen * 0.4);
    ctx.lineTo(rx + dashLen * 0.4, midB + dir * dashLen * 0.4);
    ctx.stroke();
  }
  // Left edge rope
  for (let ry = OUTER_INSET + ropeStep; ry < h - OUTER_INSET; ry += ropeStep) {
    const dir = ((ry / ropeStep) | 0) % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(mid - dir * dashLen * 0.4, ry - dashLen * 0.4);
    ctx.lineTo(mid + dir * dashLen * 0.4, ry + dashLen * 0.4);
    ctx.stroke();
  }
  // Right edge rope
  const midR = w - mid;
  for (let ry = OUTER_INSET + ropeStep; ry < h - OUTER_INSET; ry += ropeStep) {
    const dir = ((ry / ropeStep) | 0) % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(midR - dir * dashLen * 0.4, ry - dashLen * 0.4);
    ctx.lineTo(midR + dir * dashLen * 0.4, ry + dashLen * 0.4);
    ctx.stroke();
  }

  // Corner flourishes — ornate curlicue bezier curves at each corner
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const cLen = 40;

  // Helper: draw a corner flourish
  const drawCornerFlourish = (
    ox: number, oy: number, sx: number, sy: number,
  ) => {
    // Main L-bracket with inward curl
    ctx.beginPath();
    ctx.moveTo(ox + sx * cLen, oy);
    ctx.bezierCurveTo(
      ox + sx * cLen * 0.3, oy + sy * 2,
      ox + sx * 2, oy + sy * cLen * 0.3,
      ox, oy + sy * cLen,
    );
    ctx.stroke();

    // Inner decorative spiral curl
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ox + sx * cLen * 0.4, oy + sy * 3);
    ctx.bezierCurveTo(
      ox + sx * cLen * 0.15, oy + sy * 5,
      ox + sx * 5, oy + sy * cLen * 0.15,
      ox + sx * 3, oy + sy * cLen * 0.4,
    );
    ctx.stroke();

    // Tiny inner flourish dot
    ctx.lineWidth = 2;
    ctx.fillStyle = GOLD_DARK;
    ctx.beginPath();
    ctx.arc(ox + sx * 8, oy + sy * 8, 1.5, 0, Math.PI * 2);
    ctx.fill();
  };

  drawCornerFlourish(OUTER_INSET, OUTER_INSET, 1, 1);       // top-left
  drawCornerFlourish(w - OUTER_INSET, OUTER_INSET, -1, 1);  // top-right
  drawCornerFlourish(OUTER_INSET, h - OUTER_INSET, 1, -1);  // bottom-left
  drawCornerFlourish(w - OUTER_INSET, h - OUTER_INSET, -1, -1); // bottom-right

  // Compass direction labels — bold serif with ornamental lines
  ctx.fillStyle = GOLD_DARK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const dirLabels: Array<{
    label: string; x: number; y: number;
    lineX1: number; lineY1: number; lineX2: number; lineY2: number;
  }> = [
    {
      label: 'N', x: w / 2, y: OUTER_INSET - 2,
      lineX1: w / 2 - 16, lineY1: OUTER_INSET - 2, lineX2: w / 2 + 16, lineY2: OUTER_INSET - 2,
    },
    {
      label: 'S', x: w / 2, y: h - OUTER_INSET + 2,
      lineX1: w / 2 - 16, lineY1: h - OUTER_INSET + 2, lineX2: w / 2 + 16, lineY2: h - OUTER_INSET + 2,
    },
    {
      label: 'W', x: OUTER_INSET - 2, y: h / 2,
      lineX1: OUTER_INSET - 2, lineY1: h / 2 - 16, lineX2: OUTER_INSET - 2, lineY2: h / 2 + 16,
    },
    {
      label: 'E', x: w - OUTER_INSET + 2, y: h / 2,
      lineX1: w - OUTER_INSET + 2, lineY1: h / 2 - 16, lineX2: w - OUTER_INSET + 2, lineY2: h / 2 + 16,
    },
  ];

  for (const dl of dirLabels) {
    // Small ornamental lines flanking the label
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(dl.lineX1, dl.lineY1);
    ctx.lineTo(dl.lineX2, dl.lineY2);
    ctx.stroke();

    // Background for label
    ctx.font = 'bold 12px serif';
    ctx.fillStyle = PARCHMENT;
    ctx.fillText(dl.label, dl.x, dl.y);
    ctx.fillStyle = GOLD_DARK;
    ctx.font = 'bold 11px serif';
    ctx.fillText(dl.label, dl.x, dl.y);
  }

  // Easter egg: "HERE BE DRAGONS" along bottom border
  ctx.save();
  ctx.fillStyle = `rgba(44, 24, 16, 0.08)`;
  ctx.font = 'italic 7px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('HERE BE DRAGONS', w / 2, h - INNER_INSET + 10);
  ctx.restore();

  ctx.restore();
}

// ── 4. Path ──────────────────────────────────────────────────────────────────

/** Richer ink colour palette for the path. */
function getRichDriftColor(drift: number): string {
  if (drift < 0.3) return TEAL_DEEP;     // #0a6b5f — focused
  if (drift < 0.5) return '#c47a1b';     // warm amber
  if (drift < 0.7) return '#8b3a1a';     // burnt sienna
  return CRIMSON;                         // #5c1010 — critical
}

/** Draw ink-style path with varying width, distance markers, and segment X marks. */
export function drawPath(
  ctx: CanvasRenderingContext2D,
  path: GeneratedPath,
): void {
  ctx.save();

  const totalSegs = path.segments.length;
  const oldThreshold = Math.floor(totalSegs * 0.25);

  for (let i = 0; i < totalSegs; i++) {
    const seg = path.segments[i];
    const isOld = i < oldThreshold;

    ctx.save();

    // Oldest 25% of trail: faded and lighter
    if (isOld) {
      ctx.globalAlpha = seg.opacity * 0.5;
    } else {
      ctx.globalAlpha = seg.opacity;
    }

    // Subtle shadow under path
    ctx.save();
    ctx.strokeStyle = 'rgba(44, 24, 16, 0.15)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(seg.start.x + 1, seg.start.y + 1);
    ctx.bezierCurveTo(
      seg.cp1.x + 1, seg.cp1.y + 1,
      seg.cp2.x + 1, seg.cp2.y + 1,
      seg.end.x + 1, seg.end.y + 1,
    );
    ctx.stroke();
    ctx.restore();

    // Main path stroke — varying width based on drift
    const lineW = 1.5 + seg.drift * 1.5;
    const color = isOld
      ? getDriftPathColor(seg.drift)   // Use original lighter colors for old segments
      : getRichDriftColor(seg.drift);  // Use richer colors for newer
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(seg.start.x, seg.start.y);
    ctx.bezierCurveTo(
      seg.cp1.x, seg.cp1.y,
      seg.cp2.x, seg.cp2.y,
      seg.end.x, seg.end.y,
    );
    ctx.stroke();

    // Distance marker dots along the path (every ~20px)
    const markerColor = isOld ? 'rgba(44, 24, 16, 0.15)' : 'rgba(44, 24, 16, 0.35)';
    ctx.fillStyle = markerColor;
    const steps = 5;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      // Cubic bezier point at parameter t
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const t2 = t * t;
      const t3 = t2 * t;
      const px = mt3 * seg.start.x + 3 * mt2 * t * seg.cp1.x + 3 * mt * t2 * seg.cp2.x + t3 * seg.end.x;
      const py = mt3 * seg.start.y + 3 * mt2 * t * seg.cp1.y + 3 * mt * t2 * seg.cp2.y + t3 * seg.end.y;
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tiny X mark at segment boundary (end point)
    if (i < totalSegs - 1) {
      const xSize = 2.5;
      ctx.strokeStyle = isOld ? 'rgba(44, 24, 16, 0.15)' : 'rgba(44, 24, 16, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(seg.end.x - xSize, seg.end.y - xSize);
      ctx.lineTo(seg.end.x + xSize, seg.end.y + xSize);
      ctx.moveTo(seg.end.x + xSize, seg.end.y - xSize);
      ctx.lineTo(seg.end.x - xSize, seg.end.y + xSize);
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();
}

// ── 5. Ship ──────────────────────────────────────────────────────────────────

/**
 * Draw illustrated sailing vessel with hull planking, mast, two sails,
 * pennant flag, crow's nest, and wake lines. Drift-based rocking animation.
 */
export function drawShip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  drift: number,
  size: number = 24,
): void {
  ctx.save();
  ctx.translate(x, y);

  // Base rotation to face travel direction
  ctx.rotate(angle);

  // Rocking animation — faster and wider at higher drift
  const rockSpeed = 1200 - drift * 800;
  const rockAmplitude = 0.05 + drift * 0.15;
  const rock = Math.sin(Date.now() / rockSpeed) * rockAmplitude;
  ctx.rotate(rock);

  const s = size / 24; // normalised scale factor

  // ── Wake lines behind the ship ──
  ctx.save();
  ctx.strokeStyle = `rgba(139, 105, 20, 0.15)`;
  ctx.lineWidth = 0.6 * s;
  // Wake line 1 (upper)
  ctx.beginPath();
  ctx.moveTo(-13 * s, 2 * s);
  ctx.lineTo(-22 * s, -4 * s);
  ctx.stroke();
  // Wake line 2 (lower)
  ctx.beginPath();
  ctx.moveTo(-13 * s, 8 * s);
  ctx.lineTo(-22 * s, 14 * s);
  ctx.stroke();
  // Wake line 3 (middle)
  ctx.beginPath();
  ctx.moveTo(-14 * s, 5 * s);
  ctx.lineTo(-25 * s, 5 * s);
  ctx.stroke();
  ctx.restore();

  // ── Hull — curved wooden body with keel and planking ──
  const hullColor = GOLD;
  const hullDark = PARCHMENT_SHADOW;

  // Hull body
  ctx.fillStyle = hullColor;
  ctx.beginPath();
  ctx.moveTo(-14 * s, 4 * s);
  ctx.quadraticCurveTo(-12 * s, 12 * s, 0, 12 * s);
  ctx.quadraticCurveTo(12 * s, 12 * s, 16 * s, 4 * s);
  ctx.lineTo(14 * s, 3 * s);
  // Pointed bow (front)
  ctx.lineTo(17 * s, 2 * s);
  ctx.lineTo(14 * s, 4 * s);
  ctx.lineTo(-14 * s, 4 * s);
  ctx.closePath();
  ctx.fill();

  // Hull outline
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(-14 * s, 4 * s);
  ctx.quadraticCurveTo(-12 * s, 12 * s, 0, 12 * s);
  ctx.quadraticCurveTo(12 * s, 12 * s, 17 * s, 2 * s);
  ctx.stroke();

  // Keel line
  ctx.strokeStyle = hullDark;
  ctx.lineWidth = 0.7 * s;
  ctx.beginPath();
  ctx.moveTo(-13 * s, 4 * s);
  ctx.lineTo(16 * s, 3 * s);
  ctx.stroke();

  // Planking lines (2-3 horizontal lines on hull)
  ctx.strokeStyle = `rgba(44, 24, 16, 0.2)`;
  ctx.lineWidth = 0.4 * s;
  for (let pi = 0; pi < 3; pi++) {
    const py = 6 * s + pi * 2 * s;
    const shrink = pi * 2 * s;
    ctx.beginPath();
    ctx.moveTo(-12 * s + shrink, py);
    ctx.lineTo(14 * s - shrink, py);
    ctx.stroke();
  }

  // ── Mast — with yard arm (horizontal crossbar) ──
  ctx.strokeStyle = INK_LIGHT;
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  ctx.moveTo(2 * s, 4 * s);
  ctx.lineTo(2 * s, -16 * s);
  ctx.stroke();

  // Yard arm (horizontal crossbar)
  ctx.strokeStyle = INK_LIGHT;
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(-6 * s, -10 * s);
  ctx.lineTo(10 * s, -10 * s);
  ctx.stroke();

  // ── Main sail — larger square sail ──
  ctx.fillStyle = SAIL_WHITE;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.6 * s;
  ctx.beginPath();
  ctx.moveTo(-5 * s, -10 * s);
  ctx.quadraticCurveTo(-4 * s, -2 * s, -3 * s, 2 * s);
  ctx.lineTo(8 * s, 2 * s);
  ctx.quadraticCurveTo(9 * s, -2 * s, 9 * s, -10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // If drift is high, add a tear/notch in the main sail
  if (drift > 0.6) {
    ctx.fillStyle = PARCHMENT; // background showing through tear
    ctx.beginPath();
    ctx.moveTo(5 * s, -6 * s);
    ctx.lineTo(7 * s, -4 * s);
    ctx.lineTo(6 * s, -3 * s);
    ctx.lineTo(4 * s, -5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.4 * s;
    ctx.stroke();
  }

  // ── Jib sail — smaller triangular sail at front ──
  ctx.fillStyle = SAIL_WHITE;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5 * s;
  ctx.beginPath();
  ctx.moveTo(2 * s, -14 * s);
  ctx.quadraticCurveTo(12 * s, -8 * s, 16 * s, 2 * s);
  ctx.lineTo(2 * s, 2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Jib tear when drift is very high
  if (drift > 0.8) {
    ctx.fillStyle = PARCHMENT;
    ctx.beginPath();
    ctx.moveTo(8 * s, -4 * s);
    ctx.lineTo(10 * s, -2 * s);
    ctx.lineTo(9 * s, -1 * s);
    ctx.lineTo(7 * s, -3 * s);
    ctx.closePath();
    ctx.fill();
  }

  // ── Crow's nest — small circle at top of mast ──
  ctx.strokeStyle = INK_LIGHT;
  ctx.lineWidth = 0.8 * s;
  ctx.beginPath();
  ctx.arc(2 * s, -16 * s, 2 * s, 0, Math.PI * 2);
  ctx.stroke();
  // Small platform line
  ctx.beginPath();
  ctx.moveTo(0, -15 * s);
  ctx.lineTo(4 * s, -15 * s);
  ctx.stroke();

  // ── Pennant flag — colour based on drift level ──
  let flagColor: string;
  if (drift < 0.3) flagColor = TEAL_DEEP;
  else if (drift < 0.5) flagColor = '#c47a1b';
  else if (drift < 0.7) flagColor = DARK_RED;
  else flagColor = CRIMSON;

  ctx.fillStyle = flagColor;
  ctx.beginPath();
  ctx.moveTo(2 * s, -18 * s);
  ctx.lineTo(8 * s, -17 * s);
  ctx.lineTo(2 * s, -15.5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.4 * s;
  ctx.stroke();

  // Flag pole above crow's nest
  ctx.strokeStyle = INK_LIGHT;
  ctx.lineWidth = 0.8 * s;
  ctx.beginPath();
  ctx.moveTo(2 * s, -16 * s);
  ctx.lineTo(2 * s, -18.5 * s);
  ctx.stroke();

  ctx.restore();
}

// ── 6. Compass Rose ──────────────────────────────────────────────────────────

/**
 * Ornate 8-pointed star compass rose with decorative rings, cardinal/
 * intercardinal labels, 16 minor ticks, drift needle, and centre ornament.
 */
export function drawCompassRose(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  drift: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  // ── Outer decorative ring with tick marks ──
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Second ring slightly inside
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  // 16 minor tick marks around the outer ring
  for (let t = 0; t < 16; t++) {
    const tickAngle = (t / 16) * Math.PI * 2 - Math.PI / 2;
    const isCardinal = t % 4 === 0;
    const isIntercardinal = t % 4 === 2;
    const innerR = isCardinal ? radius * 0.82 : isIntercardinal ? radius * 0.85 : radius * 0.88;
    const outerR = radius * 0.92;
    const tickW = isCardinal ? 1.5 : isIntercardinal ? 1 : 0.5;
    ctx.strokeStyle = isCardinal ? GOLD_DARK : GOLD;
    ctx.lineWidth = tickW;
    ctx.beginPath();
    ctx.moveTo(Math.cos(tickAngle) * innerR, Math.sin(tickAngle) * innerR);
    ctx.lineTo(Math.cos(tickAngle) * outerR, Math.sin(tickAngle) * outerR);
    ctx.stroke();
  }

  // ── Inner decorative ring at 40% radius ──
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
  ctx.stroke();

  // Small tick marks on inner ring
  for (let t = 0; t < 8; t++) {
    const tickAngle = (t / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(tickAngle) * radius * 0.36, Math.sin(tickAngle) * radius * 0.36);
    ctx.lineTo(Math.cos(tickAngle) * radius * 0.44, Math.sin(tickAngle) * radius * 0.44);
    ctx.stroke();
  }

  // ── 8-pointed star ──
  // 4 large points (N/E/S/W) reaching 80% of radius
  // 4 smaller points (NE/SE/SW/NW) reaching 60% of radius
  const drawStarPoint = (
    pointAngle: number, length: number, halfWidth: number,
    fillDark: string, fillLight: string,
  ) => {
    const cosA = Math.cos(pointAngle);
    const sinA = Math.sin(pointAngle);
    const perpCos = Math.cos(pointAngle + Math.PI / 2);
    const perpSin = Math.sin(pointAngle + Math.PI / 2);

    // Dark half (left side of point)
    ctx.fillStyle = fillDark;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cosA * length, sinA * length);
    ctx.lineTo(-perpCos * halfWidth, -perpSin * halfWidth);
    ctx.closePath();
    ctx.fill();

    // Light half (right side of point)
    ctx.fillStyle = fillLight;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cosA * length, sinA * length);
    ctx.lineTo(perpCos * halfWidth, perpSin * halfWidth);
    ctx.closePath();
    ctx.fill();

    // Outline
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-perpCos * halfWidth, -perpSin * halfWidth);
    ctx.lineTo(cosA * length, sinA * length);
    ctx.lineTo(perpCos * halfWidth, perpSin * halfWidth);
    ctx.stroke();
  };

  // Draw intercardinal (smaller) points first so cardinal points overlay them
  const interCardinalAngles = [
    -Math.PI / 4,       // NE
    Math.PI / 4,        // SE
    (3 * Math.PI) / 4,  // SW
    (-3 * Math.PI) / 4, // NW
  ];
  for (const ia of interCardinalAngles) {
    drawStarPoint(ia, radius * 0.6, radius * 0.1, GOLD_DARK, GOLD_LIGHT);
  }

  // Cardinal points
  const cardinalDefs: Array<{ angle: number; dark: string; light: string }> = [
    { angle: -Math.PI / 2, dark: DARK_RED, light: '#c44040' },   // N — dark red/maroon
    { angle: 0, dark: GOLD_DARK, light: GOLD_LIGHT },             // E
    { angle: Math.PI / 2, dark: GOLD_DARK, light: GOLD_LIGHT },   // S
    { angle: Math.PI, dark: GOLD_DARK, light: GOLD_LIGHT },       // W
  ];
  for (const cd of cardinalDefs) {
    drawStarPoint(cd.angle, radius * 0.8, radius * 0.13, cd.dark, cd.light);
  }

  // ── Cardinal labels ──
  ctx.fillStyle = INK;
  ctx.font = `bold ${Math.max(9, radius * 0.3)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cardinalLabels: Array<{ label: string; angle: number }> = [
    { label: 'N', angle: -Math.PI / 2 },
    { label: 'E', angle: 0 },
    { label: 'S', angle: Math.PI / 2 },
    { label: 'W', angle: Math.PI },
  ];

  for (const cl of cardinalLabels) {
    // Position labels inside compass between inner ring (0.4) and star points (0.8)
    const lx = Math.cos(cl.angle) * radius * 0.62;
    const ly = Math.sin(cl.angle) * radius * 0.62;
    const fontSize = Math.max(12, radius * 0.38);

    // Enhanced backdrop with stroke outline for readability
    ctx.fillStyle = PARCHMENT;
    ctx.strokeStyle = PARCHMENT;
    ctx.lineWidth = 4;
    ctx.font = `bold ${fontSize}px serif`;
    ctx.strokeText(cl.label, lx, ly);
    ctx.fillText(cl.label, lx, ly);

    // Ink label on top
    ctx.fillStyle = INK;
    ctx.fillText(cl.label, lx, ly);
  }

  // ── Drift needle overlay ──
  let needleAngle = drift * Math.PI - Math.PI / 2;
  if (drift >= 0.7) {
    const twitch = Math.sin(Date.now() / 60) * 0.15;
    needleAngle += twitch;
  }

  ctx.save();
  ctx.rotate(needleAngle);

  // Red diamond half (pointing toward drift direction)
  ctx.fillStyle = DARK_RED;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(radius * 0.85, 0);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // White diamond half (opposite side)
  ctx.fillStyle = SAIL_WHITE;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(-radius * 0.4, 0);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.restore();

  // ── Centre ornament — concentric rings ──
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.stroke();

  // ── Drift % text below compass — elegant serif with backdrop ──
  const driftText = `${Math.round(drift * 100)}%`;
  const driftFontSize = Math.max(10, radius * 0.26);
  const driftY = radius + 12;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `italic ${driftFontSize}px serif`;

  // Parchment backdrop stroke
  ctx.strokeStyle = PARCHMENT;
  ctx.lineWidth = 3;
  ctx.strokeText(driftText, 0, driftY);

  // Parchment fill
  ctx.fillStyle = PARCHMENT;
  ctx.fillText(driftText, 0, driftY);

  // Ink on top
  ctx.fillStyle = INK;
  ctx.fillText(driftText, 0, driftY);

  ctx.restore();
}

// ── 7. Treasure X ────────────────────────────────────────────────────────────

/** Draw dramatic treasure marker X with glow, bezier-curved arms, and rivet dots. */
export function drawTreasureX(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number = 20,
): void {
  ctx.save();
  ctx.translate(x, y);

  const half = size / 2;
  const circleR = half + 6;

  // ── Faint golden glow/halo behind the X ──
  const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, circleR + 8);
  glowGrad.addColorStop(0, 'rgba(212, 165, 116, 0.2)');
  glowGrad.addColorStop(0.5, 'rgba(212, 165, 116, 0.08)');
  glowGrad.addColorStop(1, 'rgba(212, 165, 116, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(0, 0, circleR + 8, 0, Math.PI * 2);
  ctx.fill();

  // ── Dashed circle with uneven dashes ──
  ctx.strokeStyle = DARK_RED;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3, 2, 3]);
  ctx.beginPath();
  ctx.arc(0, 0, circleR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Rivet dots around the circle ──
  const rivetCount = 12;
  ctx.fillStyle = DARK_RED;
  for (let ri = 0; ri < rivetCount; ri++) {
    const rivetAngle = (ri / rivetCount) * Math.PI * 2;
    const rx = Math.cos(rivetAngle) * circleR;
    const ry = Math.sin(rivetAngle) * circleR;
    ctx.beginPath();
    ctx.arc(rx, ry, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Dark red shadow offset for the X ──
  ctx.strokeStyle = 'rgba(60, 10, 10, 0.3)';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';

  // Shadow arm 1
  ctx.beginPath();
  ctx.moveTo(-half + 1.5, -half + 1.5);
  ctx.bezierCurveTo(-half * 0.3 + 1.5, -half * 0.1 + 1.5, half * 0.3 + 1.5, half * 0.1 + 1.5, half + 1.5, half + 1.5);
  ctx.stroke();

  // Shadow arm 2
  ctx.beginPath();
  ctx.moveTo(half + 1.5, -half + 1.5);
  ctx.bezierCurveTo(half * 0.3 + 1.5, -half * 0.1 + 1.5, -half * 0.3 + 1.5, half * 0.1 + 1.5, -half + 1.5, half + 1.5);
  ctx.stroke();

  // ── The red X — thick, bezier-curved arms ──
  ctx.strokeStyle = DARK_RED;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  // Arm 1: top-left to bottom-right with slight curve
  ctx.beginPath();
  ctx.moveTo(-half, -half);
  ctx.bezierCurveTo(-half * 0.3, -half * 0.1, half * 0.3, half * 0.1, half, half);
  ctx.stroke();

  // Arm 2: top-right to bottom-left with slight curve
  ctx.beginPath();
  ctx.moveTo(half, -half);
  ctx.bezierCurveTo(half * 0.3, -half * 0.1, -half * 0.3, half * 0.1, -half, half);
  ctx.stroke();

  ctx.restore();
}
