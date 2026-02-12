/**
 * Island sprite drawing and hit-testing for the pirate map dashboard.
 *
 * 7 islands positioned at percentage-based locations on the canvas.
 * Stat islands show live numbers; action islands open settings panels.
 * Called by PirateMap component for rendering and mouse interaction.
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

/** Draw an irregular blob (wobbled circle using sin). */
function drawBlobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  const points = 24;
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const wobble = 1 + 0.08 * Math.sin(angle * 5) + 0.05 * Math.sin(angle * 3 + 1.2);
    const r = radius * wobble;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
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

  ctx.save();

  // --- Golden glow shadow on hover ---
  if (highlighted) {
    ctx.shadowColor = '#d4a574';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // --- Island body (irregular blob) ---
  const fillColor = isAction ? '#b89a60' : '#d4b87a';
  drawBlobPath(ctx, x, y, radius);
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Turn off shadow before drawing additional details
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // --- Stroke border ---
  drawBlobPath(ctx, x, y, radius);
  ctx.strokeStyle = highlighted ? '#d4a574' : 'rgba(180, 160, 120, 0.35)';
  ctx.lineWidth = highlighted ? 2 : 1;
  ctx.stroke();

  // --- Dock / pier for action islands ---
  if (isAction) {
    const dockTop = y + radius * 0.6;
    const dockBottom = y + radius + 10;
    // Vertical piling
    ctx.beginPath();
    ctx.moveTo(x, dockTop);
    ctx.lineTo(x, dockBottom);
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Horizontal plank
    ctx.beginPath();
    ctx.moveTo(x - 8, dockBottom);
    ctx.lineTo(x + 8, dockBottom);
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // --- Flag pole with triangular flag ---
  const poleBaseX = x + radius * 0.5;
  const poleBaseY = y - radius * 0.3;
  const poleTopY = poleBaseY - 18;

  // Pole
  ctx.beginPath();
  ctx.moveTo(poleBaseX, poleBaseY);
  ctx.lineTo(poleBaseX, poleTopY);
  ctx.strokeStyle = '#6b5b45';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Triangular flag
  ctx.beginPath();
  ctx.moveTo(poleBaseX, poleTopY);
  ctx.lineTo(poleBaseX + 10, poleTopY + 4);
  ctx.lineTo(poleBaseX, poleTopY + 8);
  ctx.closePath();
  ctx.fillStyle = isAction ? '#dc2626' : '#1e3a5f';
  ctx.fill();

  // --- Label text centered above island ---
  ctx.font = '9px "Source Sans 3", "Source Sans Pro", sans-serif';
  ctx.fillStyle = 'rgba(210, 190, 160, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, x, y - radius - 6);

  // --- Value text centered in island ---
  ctx.font = 'bold 14px "Playfair Display", Georgia, serif';
  ctx.fillStyle = '#2c1810';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x, y);

  // --- Lighthouse special: sync indicator dot ---
  if (id === 'lighthouse') {
    const dotX = x + radius * 0.65;
    const dotY = y - radius * 0.65;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fillStyle = syncOk ? '#22c55e' : '#d4a574';
    ctx.fill();
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
