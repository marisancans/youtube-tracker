/**
 * Static map layer renderer.
 *
 * Draws the parchment sea, nautical grid, ornate border, ship's voyage path
 * (dotted trail), ship icon, compass rose drift indicator, and treasure X marker.
 * All drawing uses Canvas 2D API with a nautical/parchment colour palette.
 */

import type { PathPoint, PathSegment, GeneratedPath } from './path-generator';
import { getDriftPathColor } from './path-generator';

// Re-export imported types so consumers can use them from either module.
export type { PathPoint, PathSegment, GeneratedPath };

// ── Palette ──────────────────────────────────────────────────────────────────

const PARCHMENT = '#e8d5b7';
const GOLD_DARK = '#b8956a';
const GOLD_LIGHT = '#d4a574';
const INK = '#2c1810';
const DARK_RED = '#991b1b';
const SAIL = '#f5e6c8';

// ── 1. Sea ───────────────────────────────────────────────────────────────────

/** Draw parchment ocean background with a blue wash and paper-grain dots. */
export function drawSea(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  // Base parchment fill
  ctx.fillStyle = PARCHMENT;
  ctx.fillRect(0, 0, w, h);

  // Subtle blue-teal wash for ocean feel
  ctx.fillStyle = 'rgba(13, 148, 136, 0.06)';
  ctx.fillRect(0, 0, w, h);

  // Paper grain — small semi-transparent dots scattered deterministically
  ctx.fillStyle = 'rgba(44, 24, 16, 0.04)';
  const step = 6;
  for (let gx = 0; gx < w; gx += step) {
    for (let gy = 0; gy < h; gy += step) {
      // Simple deterministic hash to vary presence
      const hash = ((gx * 7 + gy * 13) % 17);
      if (hash < 5) {
        const radius = 0.5 + (hash % 3) * 0.3;
        ctx.beginPath();
        ctx.arc(gx, gy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ── 2. Grid ──────────────────────────────────────────────────────────────────

/** Draw faint nautical grid lines with 40 px spacing. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const SPACING = 40;

  ctx.save();
  ctx.strokeStyle = 'rgba(184, 149, 106, 0.25)';
  ctx.lineWidth = 0.5;

  // Vertical lines
  for (let x = SPACING; x < w; x += SPACING) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = SPACING; y < h; y += SPACING) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.restore();
}

// ── 3. Border ────────────────────────────────────────────────────────────────

/** Draw ornate double border with corner L-ornaments and N/S/E/W compass labels. */
export function drawBorder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.save();

  const OUTER_INSET = 8;
  const INNER_INSET = 16;
  const CORNER_LEN = 28;

  // Outer border
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2;
  ctx.strokeRect(OUTER_INSET, OUTER_INSET, w - OUTER_INSET * 2, h - OUTER_INSET * 2);

  // Inner border
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.lineWidth = 1;
  ctx.strokeRect(INNER_INSET, INNER_INSET, w - INNER_INSET * 2, h - INNER_INSET * 2);

  // Corner L-ornaments (drawn at each of the four corners)
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2.5;

  const corners: Array<{ ox: number; oy: number; dx: number; dy: number }> = [
    { ox: OUTER_INSET, oy: OUTER_INSET, dx: 1, dy: 1 },    // top-left
    { ox: w - OUTER_INSET, oy: OUTER_INSET, dx: -1, dy: 1 }, // top-right
    { ox: OUTER_INSET, oy: h - OUTER_INSET, dx: 1, dy: -1 }, // bottom-left
    { ox: w - OUTER_INSET, oy: h - OUTER_INSET, dx: -1, dy: -1 }, // bottom-right
  ];

  for (const c of corners) {
    ctx.beginPath();
    ctx.moveTo(c.ox + c.dx * CORNER_LEN, c.oy);
    ctx.lineTo(c.ox, c.oy);
    ctx.lineTo(c.ox, c.oy + c.dy * CORNER_LEN);
    ctx.stroke();
  }

  // Compass direction labels on edges
  ctx.fillStyle = GOLD_DARK;
  ctx.font = 'bold 10px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText('N', w / 2, OUTER_INSET - 1);   // top
  ctx.fillText('S', w / 2, h - OUTER_INSET + 1); // bottom
  ctx.fillText('W', OUTER_INSET - 1, h / 2);    // left
  ctx.fillText('E', w - OUTER_INSET + 1, h / 2); // right

  ctx.restore();
}

// ── 4. Path ──────────────────────────────────────────────────────────────────

/** Draw dotted Bezier path segments coloured by drift level with opacity fading. */
export function drawPath(
  ctx: CanvasRenderingContext2D,
  path: GeneratedPath,
): void {
  ctx.save();

  for (const seg of path.segments) {
    ctx.save();
    ctx.globalAlpha = seg.opacity;
    ctx.strokeStyle = getDriftPathColor(seg.drift);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(seg.start.x, seg.start.y);
    ctx.bezierCurveTo(
      seg.cp1.x, seg.cp1.y,
      seg.cp2.x, seg.cp2.y,
      seg.end.x, seg.end.y,
    );
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// ── 5. Ship ──────────────────────────────────────────────────────────────────

/**
 * Draw ship icon (hull + mast + sail) with drift-based rocking animation.
 * Higher drift = faster, wider rocking.
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

  // Rocking animation — faster at higher drift
  const rockSpeed = 1200 - drift * 800; // ms per cycle (1200 slow -> 400 fast)
  const rockAmplitude = 0.05 + drift * 0.15; // radians
  const rock = Math.sin(Date.now() / rockSpeed) * rockAmplitude;
  ctx.rotate(rock);

  const s = size / 24; // normalised scale factor

  // ── Hull ──
  ctx.fillStyle = GOLD_DARK;
  ctx.beginPath();
  ctx.moveTo(-12 * s, 4 * s);
  ctx.quadraticCurveTo(-10 * s, 10 * s, 0, 10 * s);
  ctx.quadraticCurveTo(10 * s, 10 * s, 14 * s, 4 * s);
  ctx.lineTo(12 * s, 4 * s);
  ctx.lineTo(-12 * s, 4 * s);
  ctx.closePath();
  ctx.fill();

  // Hull outline
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Mast ──
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 4 * s);
  ctx.lineTo(0, -12 * s);
  ctx.stroke();

  // ── Sail ──
  ctx.fillStyle = SAIL;
  ctx.beginPath();
  ctx.moveTo(0, -12 * s);
  ctx.quadraticCurveTo(10 * s, -6 * s, 0, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.7;
  ctx.stroke();

  ctx.restore();
}

// ── 6. Compass Rose ──────────────────────────────────────────────────────────

/**
 * Full compass rose with cardinal ticks, N/E/S/W labels, drift needle
 * (red/white), centre dot, and drift % text.
 *
 * Needle angle: drift 0 = North (up), drift 1 = South (down).
 * Formula: needleAngle = drift * PI - PI/2
 *
 * At critical drift (>= 0.7) the needle twitches randomly.
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

  // ── Outer circle ──
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // ── Inner circle ──
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
  ctx.stroke();

  // ── Cardinal ticks & labels ──
  const cardinals: Array<{ label: string; angle: number }> = [
    { label: 'N', angle: -Math.PI / 2 },
    { label: 'E', angle: 0 },
    { label: 'S', angle: Math.PI / 2 },
    { label: 'W', angle: Math.PI },
  ];

  ctx.fillStyle = INK;
  ctx.font = `bold ${Math.max(9, radius * 0.28)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const c of cardinals) {
    // Tick line
    ctx.save();
    ctx.rotate(c.angle);
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(radius * 0.7, 0);
    ctx.lineTo(radius * 0.9, 0);
    ctx.stroke();
    ctx.restore();

    // Label
    const lx = Math.cos(c.angle) * radius * 0.55;
    const ly = Math.sin(c.angle) * radius * 0.55;
    ctx.fillText(c.label, lx, ly);
  }

  // ── Minor ticks (intercardinals) ──
  const interAngles = [
    -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4,
  ];
  for (const a of interAngles) {
    ctx.save();
    ctx.rotate(a);
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(radius * 0.78, 0);
    ctx.lineTo(radius * 0.88, 0);
    ctx.stroke();
    ctx.restore();
  }

  // ── Drift needle ──
  // drift 0 -> -PI/2 (North/up), drift 1 -> PI/2 (South/down)
  let needleAngle = drift * Math.PI - Math.PI / 2;

  // At critical drift (>= 0.7), add a random twitch
  if (drift >= 0.7) {
    const twitch = Math.sin(Date.now() / 60) * 0.15;
    needleAngle += twitch;
  }

  ctx.save();
  ctx.rotate(needleAngle);

  // Red half (pointing outward = drift direction)
  ctx.fillStyle = DARK_RED;
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(radius * 0.65, 0);
  ctx.lineTo(0, 3);
  ctx.closePath();
  ctx.fill();

  // White half (opposite side)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(-radius * 0.35, 0);
  ctx.lineTo(0, 3);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // ── Centre dot ──
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  // ── Drift % text below compass ──
  ctx.fillStyle = INK;
  ctx.font = `${Math.max(8, radius * 0.22)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${Math.round(drift * 100)}%`, 0, radius + 6);

  ctx.restore();
}

// ── 7. Treasure X ────────────────────────────────────────────────────────────

/** Draw a red X with a dashed circle around it. */
export function drawTreasureX(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number = 20,
): void {
  ctx.save();
  ctx.translate(x, y);

  const half = size / 2;

  // Dashed circle
  ctx.strokeStyle = DARK_RED;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(0, 0, half + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Red X
  ctx.strokeStyle = DARK_RED;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(-half, -half);
  ctx.lineTo(half, half);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(half, -half);
  ctx.lineTo(-half, half);
  ctx.stroke();

  ctx.restore();
}
