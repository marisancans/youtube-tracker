/**
 * Island sprite drawing and hit-testing for the pirate map dashboard.
 *
 * 7 islands positioned at percentage-based locations on the canvas.
 * Stat islands show live numbers; action islands open settings panels.
 * Called by PirateMap component for rendering and mouse interaction.
 *
 * Visual style: hand-drawn cartographic island illustrations with
 * organic coastlines, terrain features, pennant flags, and parchment labels.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IslandId = 'lookout' | 'lighthouse' | 'focus' | 'treasure' | 'harbor' | 'fort' | 'fog';
export type IslandType = 'stat' | 'action';

export interface IslandConfig {
  id: IslandId;
  type: IslandType;
  label: string;
  posX: number; // 0-1 percentage
  posY: number; // 0-1 percentage
  radius: number; // px
}

// ---------------------------------------------------------------------------
// Island configurations
// ---------------------------------------------------------------------------

export const ISLAND_CONFIGS: IslandConfig[] = [
  { id: 'lookout', type: 'stat', label: 'Videos', posX: 0.12, posY: 0.25, radius: 32 },
  { id: 'lighthouse', type: 'stat', label: 'Streak', posX: 0.88, posY: 0.18, radius: 30 },
  { id: 'focus', type: 'stat', label: 'Focus', posX: 0.5, posY: 0.12, radius: 28 },
  { id: 'treasure', type: 'stat', label: 'Achievements', posX: 0.75, posY: 0.82, radius: 34 },
  { id: 'harbor', type: 'action', label: 'Goal', posX: 0.2, posY: 0.78, radius: 36 },
  { id: 'fort', type: 'action', label: 'Difficulty', posX: 0.4, posY: 0.88, radius: 30 },
  { id: 'fog', type: 'action', label: 'Friction', posX: 0.85, posY: 0.55, radius: 28 },
];

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const COLORS = {
  BEACH: '#e8d5a0',
  ISLAND_FILL: '#c4b480',
  ISLAND_DARK: '#9a8a5c',
  ISLAND_STROKE: '#8a7a4c',
  WATER_EDGE: 'rgba(13, 148, 136, 0.12)',
  LABEL_BG: 'rgba(245, 230, 200, 0.75)',
  GOLD: '#d4a574',
  INK: '#2c1810',
  NAVY: '#1a2744',
  FLAG_RED: '#8b2020',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert percentage position to pixel coords. */
function toPixel(
  config: IslandConfig,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: config.posX * canvasWidth,
    y: config.posY * canvasHeight,
  };
}

/**
 * Seeded pseudo-random number generator (simple LCG).
 * Produces deterministic values per island so shapes don't jitter on re-render.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Hash an IslandId string into a numeric seed. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Island coastline path
// ---------------------------------------------------------------------------

/**
 * Draw an organic, irregular island coastline using overlapping bezier curves.
 * Much more natural than a simple wobbled circle — uses multiple frequency
 * perturbations with a seeded RNG so each island has a unique but stable shape.
 */
function drawBlobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  seed: number = 0,
): void {
  const rng = seededRandom(seed);
  const points = 32;

  // Pre-compute perturbed radii at each point
  const radii: number[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    // Multiple frequencies for natural coastline
    const f1 = 0.10 * Math.sin(angle * 3 + rng() * 6);
    const f2 = 0.06 * Math.sin(angle * 5 + rng() * 6);
    const f3 = 0.03 * Math.sin(angle * 8 + rng() * 6);
    const bump = rng() * 0.04 - 0.02; // tiny per-point noise
    radii.push(radius * (1 + f1 + f2 + f3 + bump));
  }

  // Build smooth bezier path through the perturbed points
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const a0 = ((i - 1 + points) % points / points) * Math.PI * 2;
    const a1 = (i / points) * Math.PI * 2;
    const a2 = ((i + 1) % points / points) * Math.PI * 2;
    const a3 = ((i + 2) % points / points) * Math.PI * 2;

    const r1 = radii[i];
    const r2 = radii[(i + 1) % points];

    const p0x = cx + radii[(i - 1 + points) % points] * Math.cos(a0);
    const p0y = cy + radii[(i - 1 + points) % points] * Math.sin(a0);
    const p1x = cx + r1 * Math.cos(a1);
    const p1y = cy + r1 * Math.sin(a1);
    const p2x = cx + r2 * Math.cos(a2);
    const p2y = cy + r2 * Math.sin(a2);
    const p3x = cx + radii[(i + 2) % points] * Math.cos(a3);
    const p3y = cy + radii[(i + 2) % points] * Math.sin(a3);

    // Catmull-Rom to Bezier control points
    const tension = 0.35;
    const cp1x = p1x + (p2x - p0x) * tension;
    const cp1y = p1y + (p2y - p0y) * tension;
    const cp2x = p2x - (p3x - p1x) * tension;
    const cp2y = p2y - (p3y - p1y) * tension;

    if (i === 0) {
      ctx.moveTo(p1x, p1y);
    }
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2x, p2y);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Terrain feature drawers
// ---------------------------------------------------------------------------

/** Lookout: small hill with a tiny watchtower/post on top. */
function drawLookout(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // Hill mound
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.35, cy + r * 0.1);
  ctx.quadraticCurveTo(cx - r * 0.1, cy - r * 0.35, cx, cy - r * 0.3);
  ctx.quadraticCurveTo(cx + r * 0.1, cy - r * 0.35, cx + r * 0.35, cy + r * 0.1);
  ctx.closePath();
  ctx.fillStyle = COLORS.ISLAND_DARK;
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Tower post
  const towerX = cx;
  const towerBase = cy - r * 0.25;
  const towerTop = towerBase - r * 0.25;
  ctx.beginPath();
  ctx.rect(towerX - 1.5, towerTop, 3, towerBase - towerTop);
  ctx.fillStyle = COLORS.INK;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Platform at top
  ctx.beginPath();
  ctx.rect(towerX - 3.5, towerTop - 1, 7, 2);
  ctx.fillStyle = COLORS.INK;
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Lighthouse: vertical striped tower with light at top. */
function drawLighthouseFeature(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const baseX = cx;
  const baseY = cy + r * 0.05;
  const towerW = 5;
  const towerH = r * 0.55;
  const topY = baseY - towerH;

  // Tower body
  ctx.fillStyle = '#f5efe0';
  ctx.fillRect(baseX - towerW / 2, topY, towerW, towerH);

  // Alternating stripes
  const stripeCount = 4;
  const stripeH = towerH / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    if (i % 2 === 0) {
      ctx.fillStyle = COLORS.FLAG_RED;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(baseX - towerW / 2, topY + i * stripeH, towerW, stripeH);
      ctx.globalAlpha = 1;
    }
  }

  // Tower outline
  ctx.strokeStyle = COLORS.INK;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(baseX - towerW / 2, topY, towerW, towerH);
  ctx.globalAlpha = 1;

  // Light circle at top
  ctx.beginPath();
  ctx.arc(baseX, topY - 2, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffe066';
  ctx.fill();
  ctx.strokeStyle = COLORS.INK;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Focus: compass-like circle with crosshairs. */
function drawCompass(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const cr = r * 0.22;

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = COLORS.INK;
  ctx.lineWidth = 0.8;

  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle
  ctx.beginPath();
  ctx.arc(cx, cy, cr * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair lines
  const ext = cr * 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - ext, cy);
  ctx.lineTo(cx + ext, cy);
  ctx.moveTo(cx, cy - ext);
  ctx.lineTo(cx, cy + ext);
  ctx.stroke();

  // North diamond
  ctx.beginPath();
  ctx.moveTo(cx, cy - cr);
  ctx.lineTo(cx - 2, cy - cr + 3);
  ctx.lineTo(cx, cy - cr + 5);
  ctx.lineTo(cx + 2, cy - cr + 3);
  ctx.closePath();
  ctx.fillStyle = COLORS.INK;
  ctx.fill();

  ctx.restore();
}

/** Treasure: tiny chest shape (rectangle with curved lid). */
function drawTreasure(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const cw = r * 0.4;
  const ch = r * 0.25;
  const leftX = cx - cw / 2;
  const topY = cy - ch / 2;

  ctx.save();
  ctx.globalAlpha = 0.55;

  // Chest body
  ctx.fillStyle = '#8b5e3c';
  ctx.fillRect(leftX, topY + ch * 0.35, cw, ch * 0.65);

  // Curved lid
  ctx.beginPath();
  ctx.moveTo(leftX, topY + ch * 0.4);
  ctx.quadraticCurveTo(cx, topY - ch * 0.2, leftX + cw, topY + ch * 0.4);
  ctx.lineTo(leftX + cw, topY + ch * 0.4);
  ctx.lineTo(leftX, topY + ch * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#a06c3c';
  ctx.fill();

  // Chest outline
  ctx.strokeStyle = COLORS.INK;
  ctx.lineWidth = 0.6;
  ctx.globalAlpha = 0.4;
  ctx.strokeRect(leftX, topY + ch * 0.35, cw, ch * 0.65);

  // Lock circle
  ctx.beginPath();
  ctx.arc(cx, topY + ch * 0.5, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.GOLD;
  ctx.globalAlpha = 0.7;
  ctx.fill();

  ctx.restore();
}

/** Harbor: tiny dock — two parallel lines extending into the water. */
function drawHarbor(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const dockLen = r * 0.55;
  const startY = cy + r * 0.25;

  ctx.save();
  ctx.strokeStyle = '#7a6545';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.65;

  // Two parallel planks
  ctx.beginPath();
  ctx.moveTo(cx - 3, startY);
  ctx.lineTo(cx - 3, startY + dockLen);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + 3, startY);
  ctx.lineTo(cx + 3, startY + dockLen);
  ctx.stroke();

  // Cross planks
  const crossCount = 3;
  for (let i = 0; i < crossCount; i++) {
    const py = startY + (dockLen / (crossCount + 1)) * (i + 1);
    ctx.beginPath();
    ctx.moveTo(cx - 5, py);
    ctx.lineTo(cx + 5, py);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

/** Fort: small crenellated wall shape with notches on top. */
function drawFort(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const fw = r * 0.5;
  const fh = r * 0.3;
  const leftX = cx - fw / 2;
  const topY = cy - fh / 2;
  const notchW = fw / 5;
  const notchH = fh * 0.3;

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#8a7a5c';

  // Wall body
  ctx.fillRect(leftX, topY + notchH, fw, fh - notchH);

  // Crenellations (merlons)
  for (let i = 0; i < 5; i++) {
    if (i % 2 === 0) {
      ctx.fillRect(leftX + i * notchW, topY, notchW, notchH + 1);
    }
  }

  // Wall outline
  ctx.strokeStyle = COLORS.INK;
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.3;

  // Outline the crenellated top
  ctx.beginPath();
  ctx.moveTo(leftX, topY + notchH);
  for (let i = 0; i < 5; i++) {
    const nx = leftX + i * notchW;
    if (i % 2 === 0) {
      ctx.lineTo(nx, topY);
      ctx.lineTo(nx + notchW, topY);
      ctx.lineTo(nx + notchW, topY + notchH);
    } else {
      ctx.lineTo(nx, topY + notchH);
      ctx.lineTo(nx + notchW, topY + notchH);
    }
  }
  ctx.lineTo(leftX + fw, topY + fh);
  ctx.lineTo(leftX, topY + fh);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/** Fog: wavy fog lines surrounding the island center. */
function drawFog(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(200, 200, 210, 0.5)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';

  const offsets = [
    { dx: -r * 0.3, dy: -r * 0.15, len: r * 0.45 },
    { dx: r * 0.1, dy: -r * 0.25, len: r * 0.35 },
    { dx: -r * 0.15, dy: r * 0.2, len: r * 0.4 },
    { dx: r * 0.2, dy: r * 0.1, len: r * 0.3 },
  ];

  for (const off of offsets) {
    const sx = cx + off.dx;
    const sy = cy + off.dy;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(
      sx + off.len * 0.3, sy - 3,
      sx + off.len * 0.5, sy,
    );
    ctx.quadraticCurveTo(
      sx + off.len * 0.7, sy + 3,
      sx + off.len, sy,
    );
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Pennant label banner
// ---------------------------------------------------------------------------

/** Draw a parchment pennant banner behind the label text. */
function drawLabelBanner(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  textWidth: number,
): void {
  const pad = 5;
  const h = 13;
  const notch = 4;
  const w = textWidth + pad * 2;
  const left = cx - w / 2;
  const top = cy - h / 2;

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left + w, top);
  ctx.lineTo(left + w + notch, top + h / 2);
  ctx.lineTo(left + w, top + h);
  ctx.lineTo(left, top + h);
  ctx.lineTo(left - notch, top + h / 2);
  ctx.closePath();

  ctx.fillStyle = COLORS.LABEL_BG;
  ctx.fill();

  ctx.strokeStyle = 'rgba(180, 160, 120, 0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Main terrain feature dispatcher
// ---------------------------------------------------------------------------

function drawTerrainFeature(
  ctx: CanvasRenderingContext2D,
  id: IslandId,
  cx: number,
  cy: number,
  r: number,
): void {
  switch (id) {
    case 'lookout': drawLookout(ctx, cx, cy, r); break;
    case 'lighthouse': drawLighthouseFeature(ctx, cx, cy, r); break;
    case 'focus': drawCompass(ctx, cx, cy, r); break;
    case 'treasure': drawTreasure(ctx, cx, cy, r); break;
    case 'harbor': drawHarbor(ctx, cx, cy, r); break;
    case 'fort': drawFort(ctx, cx, cy, r); break;
    case 'fog': drawFog(ctx, cx, cy, r); break;
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Draw a single island on the canvas.
 *
 * @param ctx        - Canvas 2D rendering context
 * @param config     - Island configuration (position, type, etc.)
 * @param canvasWidth  - Current canvas width in px
 * @param canvasHeight - Current canvas height in px
 * @param value      - Display value (number or string) rendered in the center
 * @param highlighted - Whether the island is hovered / active
 * @param syncOk     - Sync status for the lighthouse island (green dot if true)
 */
export function drawIsland(
  ctx: CanvasRenderingContext2D,
  config: IslandConfig,
  canvasWidth: number,
  canvasHeight: number,
  value: string | number,
  highlighted: boolean,
  syncOk?: boolean,
): void {
  const { x, y } = toPixel(config, canvasWidth, canvasHeight);
  const { radius, type, label, id } = config;
  const isAction = type === 'action';
  const seed = hashId(id);

  ctx.save();

  // --- Hover: pulsing golden glow ---
  if (highlighted) {
    const pulse = Math.sin(Date.now() * 0.004) * 4 + 14; // oscillates 10-18
    ctx.shadowColor = COLORS.GOLD;
    ctx.shadowBlur = pulse;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // --- Water edge tint (subtle teal ring around the island) ---
  drawBlobPath(ctx, x, y, radius + 5, seed);
  ctx.fillStyle = COLORS.WATER_EDGE;
  ctx.fill();

  // --- Sandy beach ring ---
  drawBlobPath(ctx, x, y, radius + 3, seed);
  ctx.fillStyle = COLORS.BEACH;
  ctx.fill();

  // --- Island body with center-to-edge gradient ---
  drawBlobPath(ctx, x, y, radius, seed);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, isAction ? '#a8995c' : COLORS.ISLAND_DARK);
  gradient.addColorStop(0.5, COLORS.ISLAND_FILL);
  gradient.addColorStop(1, COLORS.BEACH);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Turn off shadow before additional details
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // --- Island stroke ---
  drawBlobPath(ctx, x, y, radius, seed);
  ctx.strokeStyle = highlighted ? COLORS.GOLD : COLORS.ISLAND_STROKE;
  ctx.lineWidth = highlighted ? 2 : 0.8;
  ctx.stroke();

  // --- Terrain features unique to each island ---
  drawTerrainFeature(ctx, id, x, y, radius);

  // --- Flag pole with pennant flag ---
  const poleBaseX = x + radius * 0.5;
  const poleBaseY = y - radius * 0.3;
  const poleTopY = poleBaseY - 20;

  // Pole (thicker, 2px)
  ctx.beginPath();
  ctx.moveTo(poleBaseX, poleBaseY);
  ctx.lineTo(poleBaseX, poleTopY);
  ctx.strokeStyle = '#6b5b45';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Gold ball at top
  ctx.beginPath();
  ctx.arc(poleBaseX, poleTopY, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.GOLD;
  ctx.fill();

  // Pennant flag — rectangle with triangular notch cut from right edge
  const flagW = 12;
  const flagH = 8;
  const notchDepth = 3;
  const flagLeft = poleBaseX;
  const flagTop = poleTopY + 1;

  ctx.beginPath();
  ctx.moveTo(flagLeft, flagTop);
  ctx.lineTo(flagLeft + flagW, flagTop);
  ctx.lineTo(flagLeft + flagW - notchDepth, flagTop + flagH / 2);
  ctx.lineTo(flagLeft + flagW, flagTop + flagH);
  ctx.lineTo(flagLeft, flagTop + flagH);
  ctx.closePath();
  ctx.fillStyle = isAction ? COLORS.FLAG_RED : COLORS.NAVY;
  ctx.fill();

  // --- Label text with parchment banner ---
  ctx.font = '10px "Source Sans 3", "Source Sans Pro", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelY = y - radius - 12;
  const measured = ctx.measureText(label);
  drawLabelBanner(ctx, x, labelY, measured.width);

  // Text shadow for readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillText(label, x + 0.5, labelY + 0.5);
  // Actual label
  ctx.fillStyle = COLORS.GOLD;
  ctx.fillText(label, x, labelY);

  // --- Value text centered in island ---
  ctx.font = 'bold 15px "Playfair Display", Georgia, serif';
  ctx.fillStyle = COLORS.INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x, y);

  // --- Lighthouse special: sync indicator dot with glow ---
  if (id === 'lighthouse') {
    const dotX = x + radius * 0.65;
    const dotY = y - radius * 0.65;
    const dotColor = syncOk ? '#22c55e' : COLORS.GOLD;

    // Glow effect when synced
    if (syncOk) {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 6;
    }

    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    // Outline
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/**
 * Test whether a mouse point falls within any island's hit area (1.2x radius).
 * Returns the IslandId if hit, or null otherwise.
 */
export function hitTestIsland(
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number,
): IslandId | null {
  for (const config of ISLAND_CONFIGS) {
    const { x, y } = toPixel(config, canvasWidth, canvasHeight);
    const hitRadius = config.radius * 1.2;
    const dx = mouseX - x;
    const dy = mouseY - y;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return config.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Position helpers
// ---------------------------------------------------------------------------

/**
 * Returns pixel positions and radii for all islands at the given canvas size.
 */
export function getIslandPositions(
  canvasWidth: number,
  canvasHeight: number,
): Array<{ x: number; y: number; radius: number }> {
  return ISLAND_CONFIGS.map((config) => {
    const { x, y } = toPixel(config, canvasWidth, canvasHeight);
    return { x, y, radius: config.radius };
  });
}
