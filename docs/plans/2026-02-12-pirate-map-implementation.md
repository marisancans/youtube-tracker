# Pirate Sea Chart — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dashboard with a full-page interactive pirate map canvas that visualizes 24h rolling drift history as a ship's voyage, with weather effects, islands as interactive stat/action elements, and bundled audio. Add a mini-map to the YouTube widget.

**Architecture:** HTML Canvas 2D renders the map on two layers — a static map layer (sea, grid, path, islands) and an animated weather layer. A shared path-generator converts drift snapshots into Bezier curves. Audio plays via HTMLAudioElement. The same core rendering code powers both the full dashboard map and the widget mini-map at different scales.

**Tech Stack:** React 18, HTML Canvas 2D API, TypeScript (strict), Chrome Extension Manifest V3, Vite bundler. No new dependencies needed.

**Design doc:** `docs/plans/2026-02-12-pirate-map-design.md`

**Note:** This extension has no test runner configured. Verification is done via `tsc --noEmit` (type check) + `pnpm build` (build) + manual Chrome testing. Each task includes specific manual verification steps.

---

## Task 1: Rolling Drift History — Data Layer

**Context:** Currently `drift.ts` stores hourly snapshots in `driftState.history` and filters to 24h. We need a separate, more granular `driftHistory` array with 30-minute snapshots (48 points per 24h rolling window) that persists independently.

**Files:**
- Modify: `packages/extension/src/background/storage.ts` (lines 41-45 — DriftState interface area)
- Modify: `packages/extension/src/background/drift.ts` (lines 152-162 — history update, lines 264-294 — startDriftCalculation)
- Modify: `packages/extension/src/background/index.ts` (lines 303-314 — GET_DRIFT handler area)

**Step 1: Add DriftSnapshot interface to storage.ts**

In `packages/extension/src/background/storage.ts`, add near the DriftState interface:

```typescript
export interface DriftSnapshot {
  timestamp: number;
  drift: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  videosThisHour: number;
  productiveThisHour: number;
}
```

**Step 2: Add snapshot collection to drift.ts**

In `packages/extension/src/background/drift.ts`, add a module-level variable and collection function:

```typescript
let driftSnapshots: DriftSnapshot[] = [];

// Load snapshots from storage on init
export async function initDriftHistory(): Promise<void> {
  const result = await chrome.storage.local.get('driftHistory');
  driftSnapshots = result.driftHistory || [];
  // Prune anything older than 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  driftSnapshots = driftSnapshots.filter((s) => s.timestamp > cutoff);
}

export function getDriftSnapshots(): DriftSnapshot[] {
  return driftSnapshots;
}

// Called every 30 minutes from startDriftCalculation
async function recordDriftSnapshot(drift: number, level: DriftLevel): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  // Get current session stats for this snapshot
  const stats = await chrome.storage.local.get('dailyStats');
  const today = new Date().toISOString().split('T')[0];
  const todayStats = stats.dailyStats?.[today];
  const currentHour = new Date().getHours().toString();

  const snapshot: DriftSnapshot = {
    timestamp: Date.now(),
    drift,
    level,
    videosThisHour: todayStats?.videoCount || 0,
    productiveThisHour: todayStats?.productiveVideos || 0,
  };

  driftSnapshots.push(snapshot);
  // Keep only last 24h (max 48 entries at 30min intervals)
  driftSnapshots = driftSnapshots.filter((s) => s.timestamp > cutoff);
  if (driftSnapshots.length > 48) {
    driftSnapshots = driftSnapshots.slice(-48);
  }

  await chrome.storage.local.set({ driftHistory: driftSnapshots });
}
```

**Step 3: Integrate snapshot recording into startDriftCalculation**

In `startDriftCalculation` (drift.ts ~line 264), add a 30-minute counter alongside the existing 30-second drift calculation interval. Inside the existing interval callback, after drift is calculated, check if 30 minutes have elapsed since last snapshot:

```typescript
// Add at module level
let lastSnapshotTime = 0;

// Inside the setInterval callback in startDriftCalculation, after drift is calculated:
const now = Date.now();
if (now - lastSnapshotTime >= 30 * 60 * 1000) {
  lastSnapshotTime = now;
  await recordDriftSnapshot(drift, getDriftLevel(drift));
}
```

**Step 4: Call initDriftHistory on startup**

In `packages/extension/src/background/index.ts`, in the initialization block (~line 439 area), add after `await initDrift()`:

```typescript
await initDriftHistory();
```

Import `initDriftHistory` and `getDriftSnapshots` from drift.ts.

**Step 5: Add GET_DRIFT_HISTORY message handler**

In `packages/extension/src/background/index.ts`, add a new case in the message switch (~line 314 area):

```typescript
case 'GET_DRIFT_HISTORY':
  response = getDriftSnapshots();
  break;
```

**Step 6: Verify**

Run: `cd packages/extension && npx tsc --noEmit && pnpm build`
Expected: No errors. Build succeeds.

**Step 7: Commit**

```bash
git add packages/extension/src/background/
git commit -m "feat: rolling 24h drift history snapshots every 30min"
```

---

## Task 2: Audio System + Manifest

**Context:** The extension has no audio files and no `web_accessible_resources` in manifest.json. We need an audio manager module, placeholder audio files, and manifest updates.

**Files:**
- Create: `packages/extension/src/lib/audio.ts`
- Create: `packages/extension/src/assets/audio/ambient-ocean.mp3` (placeholder)
- Create: `packages/extension/src/assets/audio/ship-bell.mp3` (placeholder)
- Create: `packages/extension/src/assets/audio/ui-click.mp3` (placeholder)
- Modify: `packages/extension/manifest.json` (add web_accessible_resources)

**Step 1: Create placeholder audio files**

Generate minimal valid MP3 files (silent, <1KB each) so the build works. We'll replace with real audio later.

```bash
# Use ffmpeg to create 1-second silent MP3s
cd packages/extension/src/assets
mkdir -p audio
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 audio/ambient-ocean.mp3
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.5 -q:a 9 audio/ship-bell.mp3
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.2 -q:a 9 audio/ui-click.mp3
```

If ffmpeg is not available, create empty files and note they need real audio later.

**Step 2: Add web_accessible_resources to manifest.json**

In `packages/extension/manifest.json`, add after the `host_permissions` array (~line 20):

```json
"web_accessible_resources": [
  {
    "resources": [
      "src/assets/audio/ambient-ocean.mp3",
      "src/assets/audio/ship-bell.mp3",
      "src/assets/audio/ui-click.mp3"
    ],
    "matches": ["*://*.youtube.com/*", "*://youtu.be/*"]
  }
],
```

**Step 3: Create audio manager**

Create `packages/extension/src/lib/audio.ts`:

```typescript
/**
 * Audio manager for pirate map sounds.
 * Handles ambient loops, one-shot effects, mute toggle, and fade in/out.
 */

type SoundId = 'ambient' | 'bell' | 'click';

interface AudioState {
  muted: boolean;
  baseVolume: number;
  weatherMultiplier: number;
}

const AUDIO_FILES: Record<SoundId, string> = {
  ambient: 'src/assets/audio/ambient-ocean.mp3',
  bell: 'src/assets/audio/ship-bell.mp3',
  click: 'src/assets/audio/ui-click.mp3',
};

let audioState: AudioState = {
  muted: false,
  baseVolume: 0.3,
  weatherMultiplier: 1.0,
};

const audioElements: Partial<Record<SoundId, HTMLAudioElement>> = {};

function getAudioUrl(id: SoundId): string {
  // In options page, use relative path. In content script, use chrome.runtime.getURL
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(AUDIO_FILES[id]);
  }
  return AUDIO_FILES[id];
}

function getOrCreateAudio(id: SoundId): HTMLAudioElement {
  if (!audioElements[id]) {
    const audio = new Audio(getAudioUrl(id));
    audio.volume = 0;
    if (id === 'ambient') {
      audio.loop = true;
    }
    audioElements[id] = audio;
  }
  return audioElements[id]!;
}

function getEffectiveVolume(): number {
  if (audioState.muted) return 0;
  return audioState.baseVolume * audioState.weatherMultiplier;
}

/** Fade audio volume from current to target over durationMs */
function fadeVolume(audio: HTMLAudioElement, target: number, durationMs: number): void {
  const start = audio.volume;
  const diff = target - start;
  const steps = Math.max(1, Math.floor(durationMs / 50));
  let step = 0;

  const interval = setInterval(() => {
    step++;
    const progress = step / steps;
    audio.volume = Math.max(0, Math.min(1, start + diff * progress));
    if (step >= steps) {
      clearInterval(interval);
      audio.volume = Math.max(0, Math.min(1, target));
      if (target === 0) audio.pause();
    }
  }, 50);
}

/** Start ambient ocean loop with 1s fade-in */
export function startAmbient(): void {
  const audio = getOrCreateAudio('ambient');
  const vol = getEffectiveVolume();
  audio.volume = 0;
  audio.play().then(() => {
    fadeVolume(audio, vol, 1000);
  }).catch(() => {
    // Autoplay blocked — user interaction required first
  });
}

/** Stop ambient with 1s fade-out */
export function stopAmbient(): void {
  const audio = audioElements.ambient;
  if (audio && !audio.paused) {
    fadeVolume(audio, 0, 1000);
  }
}

/** Play a one-shot sound (bell or click) */
export function playSound(id: 'bell' | 'click'): void {
  if (audioState.muted) return;
  const audio = getOrCreateAudio(id);
  audio.currentTime = 0;
  audio.volume = getEffectiveVolume();
  audio.play().catch(() => {});
}

/** Update weather-based volume multiplier (0.8 calm - 1.3 storm) */
export function setWeatherIntensity(driftLevel: 'low' | 'medium' | 'high' | 'critical'): void {
  const multipliers = { low: 0.8, medium: 1.0, high: 1.15, critical: 1.3 };
  audioState.weatherMultiplier = multipliers[driftLevel];
  const audio = audioElements.ambient;
  if (audio && !audio.paused && !audioState.muted) {
    audio.volume = getEffectiveVolume();
  }
}

/** Toggle mute. Returns new muted state. */
export function toggleMute(): boolean {
  audioState.muted = !audioState.muted;
  // Persist
  chrome.storage?.local?.set({ audioMuted: audioState.muted });
  // Apply immediately
  const ambient = audioElements.ambient;
  if (ambient) {
    if (audioState.muted) {
      fadeVolume(ambient, 0, 300);
    } else if (!ambient.paused) {
      fadeVolume(ambient, getEffectiveVolume(), 300);
    }
  }
  return audioState.muted;
}

/** Get current mute state */
export function isMuted(): boolean {
  return audioState.muted;
}

/** Load persisted mute preference */
export async function initAudio(): Promise<void> {
  if (!chrome.storage?.local) return;
  const result = await chrome.storage.local.get('audioMuted');
  audioState.muted = result.audioMuted || false;
}

/** Clean up all audio elements */
export function destroyAudio(): void {
  for (const audio of Object.values(audioElements)) {
    if (audio) {
      audio.pause();
      audio.src = '';
    }
  }
  for (const key of Object.keys(audioElements)) {
    delete audioElements[key as SoundId];
  }
}
```

**Step 4: Verify**

Run: `cd packages/extension && npx tsc --noEmit && pnpm build`
Expected: No errors.

**Step 5: Commit**

```bash
git add packages/extension/src/lib/audio.ts packages/extension/src/assets/audio/ packages/extension/manifest.json
git commit -m "feat: audio system with ambient loop, bell, click + placeholder files"
```

---

## Task 3: Seeded Random + Path Generator

**Context:** Converts an array of DriftSnapshots into canvas-drawable Bezier path segments. Uses seeded random so the same data always produces the same path. This is a pure-logic module with no React or DOM dependencies.

**Files:**
- Create: `packages/extension/src/components/map/path-generator.ts`

**Step 1: Create path-generator.ts**

```typescript
/**
 * Generates a ship's voyage path from drift history snapshots.
 *
 * Each snapshot becomes a segment. Low drift = straight, high drift = loops.
 * Uses seeded PRNG so the same data always draws the same path.
 */

import type { DriftSnapshot } from '../../background/storage';

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathSegment {
  start: PathPoint;
  cp1: PathPoint;
  cp2: PathPoint;
  end: PathPoint;
  drift: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  opacity: number; // 0-1, oldest segments fade
}

export interface GeneratedPath {
  segments: PathSegment[];
  shipPosition: PathPoint;
  shipAngle: number; // radians, direction the ship is facing
}

/** Simple seeded PRNG (mulberry32). Deterministic for same seed. */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Get deviation parameters for a drift level */
function getDriftDeviation(drift: number): { maxDev: number; loopChance: number; curveIntensity: number } {
  if (drift < 0.3) return { maxDev: 5, loopChance: 0, curveIntensity: 0.2 };
  if (drift < 0.5) return { maxDev: 20, loopChance: 0, curveIntensity: 0.5 };
  if (drift < 0.7) return { maxDev: 50, loopChance: 0.15, curveIntensity: 0.8 };
  return { maxDev: 80, loopChance: 0.35, curveIntensity: 1.0 };
}

/**
 * Generate the ship's path from drift snapshots.
 *
 * @param snapshots - Array of DriftSnapshots (up to 48, rolling 24h)
 * @param canvasWidth - Available canvas width in px
 * @param canvasHeight - Available canvas height in px
 * @param padding - Padding from edges in px (for islands etc.)
 */
export function generatePath(
  snapshots: DriftSnapshot[],
  canvasWidth: number,
  canvasHeight: number,
  padding: number = 60,
): GeneratedPath {
  if (snapshots.length === 0) {
    const center = { x: canvasWidth / 2, y: canvasHeight / 2 };
    return { segments: [], shipPosition: center, shipAngle: 0 };
  }

  const segments: PathSegment[] = [];
  const usableWidth = canvasWidth - padding * 2;
  const usableHeight = canvasHeight - padding * 2;
  const centerY = canvasHeight / 2;

  // Each snapshot gets equal horizontal space
  const stepX = usableWidth / Math.max(snapshots.length, 1);

  let currentY = centerY;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const rng = seededRandom(snap.timestamp);
    const { maxDev, loopChance, curveIntensity } = getDriftDeviation(snap.drift);

    const startX = padding + i * stepX;
    const endX = padding + (i + 1) * stepX;
    const startY = currentY;

    // Determine vertical deviation
    const devDirection = rng() > 0.5 ? 1 : -1;
    const devAmount = (rng() * maxDev) * devDirection;
    let endY = startY + devAmount;

    // Clamp to canvas bounds
    endY = Math.max(padding + 20, Math.min(canvasHeight - padding - 20, endY));

    // Control points for Bezier curve
    const midX = (startX + endX) / 2;
    let cp1y: number;
    let cp2y: number;
    let cp1x = midX - stepX * 0.2;
    let cp2x = midX + stepX * 0.2;

    if (rng() < loopChance) {
      // LOOP: control points go way off to create a loop
      const loopDev = maxDev * 1.5 * (rng() > 0.5 ? 1 : -1);
      cp1y = startY + loopDev;
      cp2y = endY - loopDev * 0.5;
      // Push control points horizontally to widen loop
      cp1x = startX + stepX * 0.1;
      cp2x = endX - stepX * 0.1;
    } else {
      // Normal curve with intensity scaling
      const curveDeviation = maxDev * curveIntensity * (rng() - 0.5) * 2;
      cp1y = startY + curveDeviation;
      cp2y = endY - curveDeviation * 0.3;
    }

    // Clamp control points
    cp1y = Math.max(padding, Math.min(canvasHeight - padding, cp1y));
    cp2y = Math.max(padding, Math.min(canvasHeight - padding, cp2y));

    // Opacity: oldest 25% fades
    const ageRatio = i / snapshots.length;
    const opacity = ageRatio < 0.25 ? ageRatio / 0.25 : 1.0;

    segments.push({
      start: { x: startX, y: startY },
      cp1: { x: cp1x, y: cp1y },
      cp2: { x: cp2x, y: cp2y },
      end: { x: endX, y: endY },
      drift: snap.drift,
      level: snap.level,
      timestamp: snap.timestamp,
      opacity,
    });

    currentY = endY;
  }

  // Ship position = end of last segment
  const lastSeg = segments[segments.length - 1];
  const shipPosition = lastSeg.end;

  // Ship angle = direction of last segment's end tangent
  const shipAngle = Math.atan2(
    lastSeg.end.y - lastSeg.cp2.y,
    lastSeg.end.x - lastSeg.cp2.x,
  );

  return { segments, shipPosition, shipAngle };
}

/** Get color for a drift value (teal -> amber -> red) */
export function getDriftPathColor(drift: number): string {
  if (drift < 0.3) return '#0d9488';
  if (drift < 0.5) return '#f59e0b';
  if (drift < 0.7) return '#f97316';
  return '#991b1b';
}
```

**Step 2: Verify**

Run: `cd packages/extension && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/extension/src/components/map/path-generator.ts
git commit -m "feat: Bezier path generator from drift snapshots with seeded PRNG"
```

---

## Task 4: Map Renderer — Sea, Grid, Border, Compass

**Context:** Draws the static map layer: parchment sea, nautical grid, ornate border, and compass rose. This renders once and only redraws when the canvas resizes or drift data changes.

**Files:**
- Create: `packages/extension/src/components/map/map-renderer.ts`

**Step 1: Create map-renderer.ts**

```typescript
/**
 * Renders the static pirate map layer:
 * - Parchment-tinted ocean background
 * - Nautical chart grid lines
 * - Ornate border with compass directions
 * - Compass rose drift indicator
 * - Ship's voyage path (dotted trail)
 * - Ship icon at current position
 */

import { type GeneratedPath, type PathSegment, getDriftPathColor } from './path-generator';

/** Draw parchment ocean background with subtle blue wash */
export function drawSea(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Base parchment
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#e8d5b7');
  bg.addColorStop(0.5, '#ddd0b8');
  bg.addColorStop(1, '#d4c5a0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Blue ocean wash overlay
  ctx.fillStyle = 'rgba(10, 80, 120, 0.06)';
  ctx.fillRect(0, 0, w, h);

  // Paper grain noise (subtle dots)
  ctx.fillStyle = 'rgba(44, 24, 16, 0.015)';
  const rng = () => Math.sin(Date.now() / 100000); // stable seed
  for (let i = 0; i < 800; i++) {
    const x = ((i * 137.5) % w);
    const y = ((i * 97.3) % h);
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Draw faint nautical grid lines */
export function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(44, 24, 16, 0.06)';
  ctx.lineWidth = 0.5;
  const gridSize = 40;

  ctx.beginPath();
  for (let x = gridSize; x < w; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = gridSize; y < h; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

/** Draw ornate border with compass directions */
export function drawBorder(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const inset = 12;

  // Outer border
  ctx.strokeStyle = '#b8956a';
  ctx.lineWidth = 3;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

  // Inner border (double line effect)
  ctx.strokeStyle = 'rgba(184, 149, 106, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(inset + 5, inset + 5, w - (inset + 5) * 2, h - (inset + 5) * 2);

  // Corner ornaments (small L shapes)
  const corners = [
    [inset + 5, inset + 5],
    [w - inset - 5, inset + 5],
    [inset + 5, h - inset - 5],
    [w - inset - 5, h - inset - 5],
  ];
  ctx.strokeStyle = '#b8956a';
  ctx.lineWidth = 2;
  const ornSize = 15;
  for (const [cx, cy] of corners) {
    const dx = cx < w / 2 ? 1 : -1;
    const dy = cy < h / 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + ornSize * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + ornSize * dx, cy);
    ctx.stroke();
  }

  // Compass labels
  ctx.fillStyle = 'rgba(184, 149, 106, 0.6)';
  ctx.font = '10px "Playfair Display", serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', w / 2, inset + 18);
  ctx.fillText('S', w / 2, h - inset - 8);
  ctx.textAlign = 'left';
  ctx.fillText('W', inset + 10, h / 2 + 4);
  ctx.textAlign = 'right';
  ctx.fillText('E', w - inset - 10, h / 2 + 4);
}

/** Draw the ship's voyage trail (dotted Bezier path with drift-colored segments) */
export function drawPath(ctx: CanvasRenderingContext2D, path: GeneratedPath): void {
  for (const seg of path.segments) {
    ctx.save();
    ctx.globalAlpha = seg.opacity;
    ctx.strokeStyle = getDriftPathColor(seg.drift);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(seg.start.x, seg.start.y);
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.end.x, seg.end.y);
    ctx.stroke();

    ctx.restore();
  }
}

/** Draw ship icon at current position */
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
  ctx.rotate(angle);

  // Rocking animation based on drift
  const rockAngle = drift * 0.25 * Math.sin(Date.now() / (drift > 0.7 ? 200 : 500));
  ctx.rotate(rockAngle);

  const s = size / 24; // scale factor

  // Hull
  ctx.fillStyle = '#5c3a1e';
  ctx.beginPath();
  ctx.moveTo(-10 * s, 4 * s);
  ctx.lineTo(12 * s, 4 * s);
  ctx.lineTo(8 * s, 10 * s);
  ctx.lineTo(-8 * s, 10 * s);
  ctx.closePath();
  ctx.fill();

  // Mast
  ctx.strokeStyle = '#3c2a1a';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(0, 4 * s);
  ctx.lineTo(0, -10 * s);
  ctx.stroke();

  // Sail
  ctx.fillStyle = '#f5e6c8';
  ctx.beginPath();
  ctx.moveTo(0, -10 * s);
  ctx.lineTo(8 * s, -4 * s);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#b8956a';
  ctx.lineWidth = 0.5 * s;
  ctx.stroke();

  ctx.restore();
}

/** Draw compass rose with drift needle */
export function drawCompassRose(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  drift: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  // Outer ring
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#b8956a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(184, 149, 106, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cardinal direction ticks
  const dirs = ['N', 'E', 'S', 'W'];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.85);
    ctx.lineTo(0, -radius);
    ctx.strokeStyle = '#b8956a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.rotate(-a); // undo rotation for text
    ctx.fillStyle = 'rgba(184, 149, 106, 0.7)';
    ctx.font = `${radius * 0.2}px "Playfair Display", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelDist = radius + 12;
    ctx.fillText(dirs[i], Math.cos(a) * labelDist, Math.sin(a) * labelDist);
    ctx.restore();
  }

  // 8 minor ticks
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    if (i % 2 === 0) continue; // skip cardinals
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.9);
    ctx.lineTo(0, -radius);
    ctx.strokeStyle = 'rgba(184, 149, 106, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Needle — points from North (focused) toward South (drifting)
  // drift 0 = points North (up), drift 1 = points South (down)
  const needleAngle = drift * Math.PI - Math.PI / 2;

  // Erratic twitch at critical drift
  const twitch = drift > 0.7 ? Math.sin(Date.now() / 100) * 0.1 : 0;

  ctx.save();
  ctx.rotate(needleAngle + twitch);

  // Red half (pointing direction)
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.7);
  ctx.lineTo(-4, 0);
  ctx.lineTo(4, 0);
  ctx.closePath();
  ctx.fill();

  // White half (opposite)
  ctx.fillStyle = '#f5e6c8';
  ctx.beginPath();
  ctx.moveTo(0, radius * 0.5);
  ctx.lineTo(-4, 0);
  ctx.lineTo(4, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#b8956a';
  ctx.fill();

  // Drift percentage text
  ctx.fillStyle = '#2c1810';
  ctx.font = `bold ${radius * 0.28}px "Source Sans 3", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(drift * 100)}%`, 0, radius * 0.45);

  ctx.restore();
}

/** Draw "X marks the spot" treasure marker */
export function drawTreasureX(ctx: CanvasRenderingContext2D, x: number, y: number, size: number = 20): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#991b1b';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(-size / 2, -size / 2);
  ctx.lineTo(size / 2, size / 2);
  ctx.moveTo(size / 2, -size / 2);
  ctx.lineTo(-size / 2, size / 2);
  ctx.stroke();

  // Dashed circle around it
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = 'rgba(153, 27, 27, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
```

**Step 2: Verify**

Run: `cd packages/extension && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/extension/src/components/map/map-renderer.ts
git commit -m "feat: map renderer — sea, grid, border, path, ship, compass rose"
```

---

## Task 5: Island Sprites

**Context:** Draws the 7 interactive islands on the dashboard map canvas. Each island is a hand-drawn style sprite with a label flag and live stat/action indicator. Includes hit-test function for click detection.

**Files:**
- Create: `packages/extension/src/components/map/island-sprites.ts`

**Step 1: Create island-sprites.ts**

```typescript
/**
 * Island sprites for the pirate map dashboard.
 * Each island is drawn at a percentage-based position on the canvas.
 * Includes hit-testing for mouse interactions.
 */

export type IslandId =
  | 'lookout'      // Videos watched
  | 'lighthouse'   // Streak + sync
  | 'focus'        // Focus score
  | 'treasure'     // Achievements / XP
  | 'harbor'       // Goal settings
  | 'fort'         // Difficulty tier
  | 'fog';         // Friction effects

export type IslandType = 'stat' | 'action';

export interface IslandConfig {
  id: IslandId;
  type: IslandType;
  label: string;
  /** Position as percentage of canvas (0-1) */
  posX: number;
  posY: number;
  /** Base radius of the island in px */
  radius: number;
}

export interface IslandRenderData extends IslandConfig {
  value: string;       // Display value ("12", "85%", etc.)
  subtext?: string;    // Secondary text
  highlighted: boolean; // Hover state
}

/** Fixed island layout — positions chosen to distribute across the map */
export const ISLAND_CONFIGS: IslandConfig[] = [
  { id: 'lookout',    type: 'stat',   label: 'Videos',        posX: 0.12, posY: 0.25, radius: 32 },
  { id: 'lighthouse', type: 'stat',   label: 'Streak',        posX: 0.88, posY: 0.18, radius: 30 },
  { id: 'focus',      type: 'stat',   label: 'Focus',         posX: 0.5,  posY: 0.12, radius: 28 },
  { id: 'treasure',   type: 'stat',   label: 'Achievements',  posX: 0.75, posY: 0.82, radius: 34 },
  { id: 'harbor',     type: 'action', label: 'Goal',          posX: 0.2,  posY: 0.78, radius: 36 },
  { id: 'fort',       type: 'action', label: 'Difficulty',     posX: 0.4,  posY: 0.88, radius: 30 },
  { id: 'fog',        type: 'action', label: 'Friction',       posX: 0.85, posY: 0.55, radius: 28 },
];

/** Draw a single island */
export function drawIsland(
  ctx: CanvasRenderingContext2D,
  config: IslandConfig,
  canvasWidth: number,
  canvasHeight: number,
  value: string,
  highlighted: boolean,
  syncOk?: boolean,
): void {
  const x = config.posX * canvasWidth;
  const y = config.posY * canvasHeight;
  const r = config.radius;

  ctx.save();

  // Glow on hover
  if (highlighted) {
    ctx.shadowColor = '#d4a574';
    ctx.shadowBlur = 16;
  }

  // Island body — irregular blob shape
  ctx.fillStyle = config.type === 'action'
    ? 'rgba(184, 149, 106, 0.7)'
    : 'rgba(212, 196, 168, 0.7)';
  ctx.beginPath();
  // Draw rough circle with wobble
  for (let a = 0; a < Math.PI * 2; a += 0.3) {
    const wobble = 1 + Math.sin(a * 3 + config.posX * 100) * 0.12;
    const px = x + Math.cos(a) * r * wobble;
    const py = y + Math.sin(a) * r * wobble * 0.75; // squash vertically
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = highlighted ? '#d4a574' : 'rgba(44, 24, 16, 0.3)';
  ctx.lineWidth = highlighted ? 2 : 1;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Dock/pier for action islands
  if (config.type === 'action') {
    ctx.strokeStyle = '#5c3a1e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.6);
    ctx.lineTo(x, y + r * 1.1);
    ctx.stroke();
    // Planks
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + r * 1.1);
    ctx.lineTo(x + 6, y + r * 1.1);
    ctx.stroke();
  }

  // Flag pole + label
  const poleX = x - r * 0.4;
  const poleTop = y - r * 0.9;
  ctx.strokeStyle = '#3c2a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(poleX, y - r * 0.3);
  ctx.lineTo(poleX, poleTop);
  ctx.stroke();

  // Flag
  ctx.fillStyle = config.type === 'action' ? '#991b1b' : '#1a2744';
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop);
  ctx.lineTo(poleX + 18, poleTop + 5);
  ctx.lineTo(poleX, poleTop + 10);
  ctx.closePath();
  ctx.fill();

  // Label text
  ctx.fillStyle = '#2c1810';
  ctx.font = '9px "Source Sans 3", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(config.label, x, y - r * 0.4);

  // Value in center
  ctx.fillStyle = '#2c1810';
  ctx.font = 'bold 14px "Playfair Display", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y + 2);

  // Lighthouse special: sync indicator
  if (config.id === 'lighthouse' && syncOk !== undefined) {
    ctx.beginPath();
    ctx.arc(x + r * 0.5, y - r * 0.5, 4, 0, Math.PI * 2);
    ctx.fillStyle = syncOk ? '#22c55e' : '#d4a574';
    ctx.fill();
    if (syncOk) {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  ctx.restore();
}

/** Hit-test: returns island ID if (mouseX, mouseY) is within an island, or null */
export function hitTestIsland(
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number,
): IslandId | null {
  for (const island of ISLAND_CONFIGS) {
    const ix = island.posX * canvasWidth;
    const iy = island.posY * canvasHeight;
    const dist = Math.sqrt((mouseX - ix) ** 2 + (mouseY - iy) ** 2);
    if (dist <= island.radius * 1.2) {
      return island.id;
    }
  }
  return null;
}

/** Get all island positions in pixel coordinates */
export function getIslandPositions(canvasWidth: number, canvasHeight: number): Array<{ x: number; y: number; radius: number }> {
  return ISLAND_CONFIGS.map((c) => ({
    x: c.posX * canvasWidth,
    y: c.posY * canvasHeight,
    radius: c.radius,
  }));
}
```

**Step 2: Verify**

Run: `cd packages/extension && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/extension/src/components/map/island-sprites.ts
git commit -m "feat: island sprites with hit-testing for pirate map dashboard"
```

---

## Task 6: Weather Renderer

**Context:** Animated weather effects on a separate canvas layer. Intensity driven by current drift level. Includes waves, wind lines, clouds, rain, and lightning.

**Files:**
- Create: `packages/extension/src/components/map/weather-renderer.ts`

**Step 1: Create weather-renderer.ts**

```typescript
/**
 * Weather effects renderer for the pirate map.
 * Renders on a separate canvas layer using requestAnimationFrame.
 *
 * Drift-driven: calm seas → choppy → rough → storm with lightning.
 */

type DriftLevel = 'low' | 'medium' | 'high' | 'critical';

interface WeatherState {
  level: DriftLevel;
  drift: number;
  // Interpolated values (smooth transitions)
  waveHeight: number;
  waveSpeed: number;
  windIntensity: number;
  cloudCount: number;
  cloudOpacity: number;
  rainIntensity: number;
  seaTint: { r: number; g: number; b: number; a: number };
  lightningTimer: number;
  lightningFlash: number;
  screenShake: number;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
  opacity: number;
}

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
}

const WEATHER_TARGETS: Record<DriftLevel, Partial<WeatherState>> = {
  low: {
    waveHeight: 3,
    waveSpeed: 0.3,
    windIntensity: 0,
    cloudCount: 0,
    cloudOpacity: 0,
    rainIntensity: 0,
    seaTint: { r: 10, g: 80, b: 120, a: 0.04 },
  },
  medium: {
    waveHeight: 8,
    waveSpeed: 0.6,
    windIntensity: 0.3,
    cloudCount: 3,
    cloudOpacity: 0.3,
    rainIntensity: 0,
    seaTint: { r: 30, g: 60, b: 90, a: 0.08 },
  },
  high: {
    waveHeight: 16,
    waveSpeed: 1.0,
    windIntensity: 0.7,
    cloudCount: 6,
    cloudOpacity: 0.6,
    rainIntensity: 0.5,
    seaTint: { r: 40, g: 50, b: 70, a: 0.15 },
  },
  critical: {
    waveHeight: 28,
    waveSpeed: 1.5,
    windIntensity: 1.0,
    cloudCount: 10,
    cloudOpacity: 0.8,
    rainIntensity: 1.0,
    seaTint: { r: 20, g: 15, b: 25, a: 0.3 },
  },
};

let state: WeatherState = {
  level: 'low',
  drift: 0,
  waveHeight: 3,
  waveSpeed: 0.3,
  windIntensity: 0,
  cloudCount: 0,
  cloudOpacity: 0,
  rainIntensity: 0,
  seaTint: { r: 10, g: 80, b: 120, a: 0.04 },
  lightningTimer: 0,
  lightningFlash: 0,
  screenShake: 0,
};

let clouds: Cloud[] = [];
let rainDrops: RainDrop[] = [];
let animFrameId: number | null = null;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(
  a: { r: number; g: number; b: number; a: number },
  b: { r: number; g: number; b: number; a: number },
  t: number,
): { r: number; g: number; b: number; a: number } {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
  };
}

/** Update weather toward target drift level */
export function setDriftLevel(level: DriftLevel, drift: number): void {
  state.level = level;
  state.drift = drift;
}

/** Interpolate weather state toward targets (called each frame) */
function updateState(): void {
  const target = WEATHER_TARGETS[state.level];
  const speed = 0.03; // Interpolation speed per frame (~2s transition at 30fps)

  state.waveHeight = lerp(state.waveHeight, target.waveHeight!, speed);
  state.waveSpeed = lerp(state.waveSpeed, target.waveSpeed!, speed);
  state.windIntensity = lerp(state.windIntensity, target.windIntensity!, speed);
  state.cloudCount = lerp(state.cloudCount, target.cloudCount!, speed);
  state.cloudOpacity = lerp(state.cloudOpacity, target.cloudOpacity!, speed);
  state.rainIntensity = lerp(state.rainIntensity, target.rainIntensity!, speed);
  state.seaTint = lerpColor(state.seaTint, target.seaTint!, speed);

  // Lightning timer (critical only)
  if (state.level === 'critical') {
    state.lightningTimer -= 1;
    if (state.lightningTimer <= 0) {
      state.lightningFlash = 1.0;
      state.screenShake = 2;
      state.lightningTimer = 90 + Math.random() * 150; // 3-8 seconds at 30fps
    }
  }
  state.lightningFlash *= 0.85; // Decay flash
  state.screenShake *= 0.9;
}

/** Draw waves along the bottom portion of canvas */
function drawWaves(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  if (state.waveHeight < 1) return;

  const layers = state.level === 'critical' ? 4 : state.level === 'high' ? 3 : 2;

  for (let layer = 0; layer < layers; layer++) {
    const yBase = h - 20 - layer * state.waveHeight * 1.5;
    const alpha = 0.08 + layer * 0.03;
    const speed = state.waveSpeed * (1 + layer * 0.3);

    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let x = 0; x <= w; x += 4) {
      const y = yBase + Math.sin((x * 0.02) + time * speed + layer * 2) * state.waveHeight;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();

    // Wave color shifts with weather
    const { r, g, b } = state.seaTint;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fill();

    // Whitecaps on rough+ seas
    if (state.waveHeight > 12) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = yBase + Math.sin((x * 0.02) + time * speed + layer * 2) * state.waveHeight;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

/** Draw wind streaks */
function drawWind(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  if (state.windIntensity < 0.1) return;

  const count = Math.floor(state.windIntensity * 15);
  ctx.strokeStyle = `rgba(255, 255, 255, ${state.windIntensity * 0.15})`;
  ctx.lineWidth = 0.5;

  for (let i = 0; i < count; i++) {
    const seed = i * 137.5;
    const baseX = ((seed * 7.3 + time * 200 * state.windIntensity) % (w + 200)) - 100;
    const baseY = (seed * 3.7) % h;
    const length = 30 + state.windIntensity * 40;

    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(baseX + length, baseY - length * 0.1);
    ctx.stroke();
  }
}

/** Draw clouds */
function drawClouds(ctx: CanvasRenderingContext2D, w: number, _h: number, time: number): void {
  if (state.cloudOpacity < 0.05) return;

  // Maintain cloud pool
  while (clouds.length < Math.ceil(state.cloudCount)) {
    clouds.push({
      x: Math.random() * w * 1.5,
      y: 20 + Math.random() * 80,
      width: 60 + Math.random() * 100,
      speed: 0.2 + Math.random() * 0.5,
      opacity: 0.3 + Math.random() * 0.5,
    });
  }

  for (const cloud of clouds) {
    cloud.x -= cloud.speed * state.waveSpeed;
    if (cloud.x + cloud.width < -50) cloud.x = w + 50;

    ctx.fillStyle = `rgba(60, 60, 80, ${cloud.opacity * state.cloudOpacity})`;
    // Cloud as overlapping ellipses
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      ctx.ellipse(
        cloud.x + j * cloud.width * 0.3,
        cloud.y + Math.sin(j * 2) * 5,
        cloud.width * 0.3,
        15 + state.cloudOpacity * 10,
        0, 0, Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

/** Draw rain */
function drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number): void {
  if (state.rainIntensity < 0.1) return;

  const count = Math.floor(state.rainIntensity * 80);

  // Maintain rain pool
  while (rainDrops.length < count) {
    rainDrops.push({
      x: Math.random() * w,
      y: Math.random() * h,
      speed: 5 + Math.random() * 10,
      length: 8 + Math.random() * 12,
    });
  }
  while (rainDrops.length > count) rainDrops.pop();

  ctx.strokeStyle = `rgba(180, 200, 220, ${state.rainIntensity * 0.3})`;
  ctx.lineWidth = 0.5;

  for (const drop of rainDrops) {
    drop.y += drop.speed;
    drop.x -= drop.speed * 0.3; // Wind angle

    if (drop.y > h) {
      drop.y = -drop.length;
      drop.x = Math.random() * w;
    }

    ctx.beginPath();
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - drop.length * 0.3, drop.y + drop.length);
    ctx.stroke();
  }
}

/** Draw lightning bolt */
function drawLightning(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (state.lightningFlash < 0.05) return;

  // Screen flash
  ctx.fillStyle = `rgba(255, 255, 255, ${state.lightningFlash * 0.15})`;
  ctx.fillRect(0, 0, w, h);

  if (state.lightningFlash > 0.7) {
    // Draw bolt
    const startX = w * 0.2 + Math.random() * w * 0.6;
    const startY = 30;
    let boltX = startX;
    let boltY = startY;

    ctx.strokeStyle = `rgba(255, 255, 255, ${state.lightningFlash})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(boltX, boltY);

    const segments = 6 + Math.floor(Math.random() * 4);
    const targetY = h * 0.6 + Math.random() * h * 0.2;
    const segLen = (targetY - startY) / segments;

    for (let i = 0; i < segments; i++) {
      boltX += (Math.random() - 0.5) * 40;
      boltY += segLen;
      ctx.lineTo(boltX, boltY);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/** Main render function — call with requestAnimationFrame */
export function renderWeather(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  updateState();

  const time = Date.now() / 1000;

  // Apply screen shake
  if (state.screenShake > 0.1) {
    ctx.save();
    ctx.translate(
      (Math.random() - 0.5) * state.screenShake * 2,
      (Math.random() - 0.5) * state.screenShake * 2,
    );
  }

  // Sea tint overlay
  const { r, g, b, a } = state.seaTint;
  ctx.fillStyle = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
  ctx.fillRect(0, 0, w, h);

  drawWaves(ctx, w, h, time);
  drawWind(ctx, w, h, time);
  drawClouds(ctx, w, h, time);
  drawRain(ctx, w, h, time);
  drawLightning(ctx, w, h);

  if (state.screenShake > 0.1) {
    ctx.restore();
  }
}

/** Start the weather animation loop */
export function startWeatherLoop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  let lastFrame = 0;
  const targetInterval = 1000 / 30; // 30fps

  function loop(timestamp: number) {
    if (timestamp - lastFrame >= targetInterval) {
      ctx.clearRect(0, 0, w, h);
      renderWeather(ctx, w, h);
      lastFrame = timestamp;
    }
    animFrameId = requestAnimationFrame(loop);
  }

  animFrameId = requestAnimationFrame(loop);
}

/** Stop the weather animation loop */
export function stopWeatherLoop(): void {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

/** Reset all state (for cleanup) */
export function resetWeather(): void {
  stopWeatherLoop();
  clouds = [];
  rainDrops = [];
  state.lightningTimer = 0;
  state.lightningFlash = 0;
  state.screenShake = 0;
}
```

**Step 2: Verify**

Run: `cd packages/extension && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/extension/src/components/map/weather-renderer.ts
git commit -m "feat: weather renderer — waves, wind, clouds, rain, lightning"
```

---

## Task 7: PirateMap React Component

**Context:** Main React component that composes all the renderers. Used by both the widget (mini mode) and dashboard (full mode). Manages two stacked canvases — map layer (static) and weather layer (animated).

**Files:**
- Create: `packages/extension/src/components/map/PirateMap.tsx`

**Step 1: Create PirateMap.tsx**

```typescript
/**
 * Pirate Map — main canvas component.
 *
 * Props:
 * - mode: 'mini' (widget, 300x160, no islands) | 'full' (dashboard, fills viewport)
 * - driftHistory: DriftSnapshot array
 * - currentDrift: current drift value + level
 * - stats: live stat values for islands (full mode only)
 * - onIslandClick: callback for island interactions (full mode only)
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { DriftSnapshot } from '../../background/storage';
import { generatePath } from './path-generator';
import { drawSea, drawGrid, drawBorder, drawPath, drawShip, drawCompassRose, drawTreasureX } from './map-renderer';
import { drawIsland, hitTestIsland, ISLAND_CONFIGS, type IslandId } from './island-sprites';
import { startWeatherLoop, stopWeatherLoop, setDriftLevel, resetWeather } from './weather-renderer';
import { startAmbient, stopAmbient, setWeatherIntensity, initAudio } from '../../lib/audio';

interface PirateMapProps {
  mode: 'mini' | 'full';
  driftHistory: DriftSnapshot[];
  currentDrift: number;
  currentLevel: 'low' | 'medium' | 'high' | 'critical';
  streak?: number;
  syncOk?: boolean;
  stats?: {
    videos: number;
    streak: number;
    focusScore: number;
    achievements: number;
    xp: number;
    level: number;
  };
  onIslandClick?: (id: IslandId) => void;
}

export default function PirateMap({
  mode,
  driftHistory,
  currentDrift,
  currentLevel,
  streak = 0,
  syncOk = false,
  stats,
  onIslandClick,
}: PirateMapProps): JSX.Element {
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const weatherCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIsland, setHoveredIsland] = useState<IslandId | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Initialize audio
  useEffect(() => {
    initAudio().then(() => startAmbient());
    return () => stopAmbient();
  }, []);

  // Handle resize
  useEffect(() => {
    const updateSize = () => {
      if (mode === 'mini') {
        setDimensions({ width: 300, height: 160 });
      } else {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [mode]);

  // Render the static map layer
  const renderMap = useCallback(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: w, height: h } = dimensions;
    if (w === 0 || h === 0) return;

    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background layers
    drawSea(ctx, w, h);
    drawGrid(ctx, w, h);

    // Generate and draw path
    const padding = mode === 'mini' ? 20 : 60;
    const path = generatePath(driftHistory, w, h, padding);
    drawPath(ctx, path);

    // Ship
    if (path.segments.length > 0) {
      const shipSize = mode === 'mini' ? 16 : 28;
      drawShip(ctx, path.shipPosition.x, path.shipPosition.y, path.shipAngle, currentDrift, shipSize);
    }

    // Islands (full mode only)
    if (mode === 'full' && stats) {
      const islandValues: Record<IslandId, string> = {
        lookout: `${stats.videos}`,
        lighthouse: `${stats.streak}d`,
        focus: `${stats.focusScore}%`,
        treasure: `${stats.achievements}`,
        harbor: 'Goal',
        fort: 'Tier',
        fog: 'Friction',
      };

      for (const config of ISLAND_CONFIGS) {
        drawIsland(
          ctx,
          config,
          w,
          h,
          islandValues[config.id],
          hoveredIsland === config.id,
          config.id === 'lighthouse' ? syncOk : undefined,
        );
      }

      // X marks the spot (streak > 3)
      if (streak > 3 && path.segments.length > 0) {
        const ahead = Math.min(path.shipPosition.x + 60, w - padding);
        drawTreasureX(ctx, ahead, path.shipPosition.y - 20);
      }
    }

    // Compass rose
    const compassSize = mode === 'mini' ? 24 : 55;
    const compassX = w - (mode === 'mini' ? 30 : 80);
    const compassY = h - (mode === 'mini' ? 30 : 80);
    drawCompassRose(ctx, compassX, compassY, compassSize, currentDrift);

    // Border
    drawBorder(ctx, w, h);
  }, [dimensions, driftHistory, currentDrift, mode, stats, hoveredIsland, syncOk, streak]);

  // Redraw map when data changes
  useEffect(() => {
    renderMap();
  }, [renderMap]);

  // Start/stop weather animation
  useEffect(() => {
    const canvas = weatherCanvasRef.current;
    if (!canvas) return;

    const { width: w, height: h } = dimensions;
    if (w === 0 || h === 0) return;

    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    setDriftLevel(currentLevel, currentDrift);
    setWeatherIntensity(currentLevel);

    // In mini mode, skip heavy effects
    if (mode === 'mini') {
      // Just render sea tint, no full loop
      // Single render call, no animation loop for mini
      return;
    }

    startWeatherLoop(ctx, w, h);

    return () => {
      stopWeatherLoop();
      resetWeather();
    };
  }, [dimensions, currentLevel, currentDrift, mode]);

  // Mouse handlers (full mode only)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'full') return;
    const rect = mapCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTestIsland(x, y, dimensions.width, dimensions.height);
    setHoveredIsland(hit);

    if (mapCanvasRef.current) {
      mapCanvasRef.current.style.cursor = hit ? 'pointer' : 'default';
    }
  }, [mode, dimensions]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'full' || !onIslandClick) return;
    const rect = mapCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTestIsland(x, y, dimensions.width, dimensions.height);
    if (hit) onIslandClick(hit);
  }, [mode, dimensions, onIslandClick]);

  const handleMiniClick = useCallback(() => {
    if (mode === 'mini') {
      // Open dashboard
      if (chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    }
  }, [mode]);

  const style: React.CSSProperties = mode === 'full'
    ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh' }
    : {
        width: '300px',
        height: '160px',
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid rgba(184, 149, 106, 0.4)',
        cursor: 'pointer',
      };

  return (
    <div style={{ ...style, position: 'relative' }} onClick={handleMiniClick}>
      {/* Static map layer */}
      <canvas
        ref={mapCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
      {/* Animated weather layer */}
      <canvas
        ref={weatherCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      {/* Mini-map "Open full map" link */}
      {mode === 'mini' && (
        <div style={{
          position: 'absolute',
          bottom: '4px',
          right: '8px',
          fontSize: '8px',
          color: 'rgba(184, 149, 106, 0.6)',
          pointerEvents: 'none',
        }}>
          Open full map
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify**

Run: `cd packages/extension && npx tsc --noEmit`
Expected: No errors. May need to adjust imports if DriftSnapshot isn't exported from storage.ts.

**Step 3: Commit**

```bash
git add packages/extension/src/components/map/PirateMap.tsx
git commit -m "feat: PirateMap React component — dual canvas with map + weather layers"
```

---

## Task 8: Widget Integration — Mini-Map

**Context:** Replace the drift meter ("Drift Level" ocean scene, lines ~1772-1977) and 24h bar chart ("24h Activity", lines ~1979-2011) in Widget.tsx with the PirateMap mini-map component. Add drift history fetching.

**Files:**
- Modify: `packages/extension/src/components/widget/Widget.tsx`

**Step 1: Add drift history to widget state**

Add to the `WidgetState` interface:

```typescript
driftHistory: DriftSnapshot[];
```

Initialize in the default state:

```typescript
driftHistory: [],
```

**Step 2: Fetch drift history on mount and periodically**

In the initial load useEffect (~line 582), add:

```typescript
safeSendMessageWithCallback('GET_DRIFT_HISTORY', undefined, (response: any) => {
  if (Array.isArray(response)) {
    setState((p) => ({ ...p, driftHistory: response }));
  }
});
```

In the periodic update useEffect (~line 661), add inside the interval callback:

```typescript
safeSendMessageWithCallback('GET_DRIFT_HISTORY', undefined, (response: any) => {
  if (Array.isArray(response)) {
    setState((p) => ({ ...p, driftHistory: response }));
  }
});
```

**Step 3: Replace drift meter + 24h chart with PirateMap**

Remove the drift meter section (lines ~1772-1977, the `{/* ─── DRIFT METER` block) and the 24h chart section (lines ~1979-2011, the `{/* ─── 24H CHART` block).

Replace them with:

```tsx
{/* ─── MINI MAP ─── */}
<div style={{ marginBottom: '14px' }}>
  <PirateMap
    mode="mini"
    driftHistory={state.driftHistory}
    currentDrift={state.drift.drift}
    currentLevel={state.drift.level}
    streak={state.streak}
  />
</div>
```

Add the import at the top of Widget.tsx:

```typescript
import PirateMap from '../map/PirateMap';
```

**Step 4: Remove the now-unused ShipsLogChart component**

Delete the `ShipsLogChart` function (~lines 384-495) since it's replaced by the mini-map. Also remove any unused imports related to it.

**Step 5: Verify**

Run: `cd packages/extension && npx tsc --noEmit && pnpm build`
Expected: No errors. Build succeeds.

**Step 6: Manual test**

1. Load unpacked extension in Chrome
2. Go to YouTube
3. Expand the widget bar
4. Verify: mini-map canvas renders where drift meter + 24h chart used to be
5. Verify: ship visible on map, dotted trail behind it
6. Verify: compass rose in corner with drift %
7. Verify: clicking mini-map opens options page

**Step 7: Commit**

```bash
git add packages/extension/src/components/widget/Widget.tsx
git commit -m "feat: replace widget drift meter + 24h chart with pirate mini-map"
```

---

## Task 9: Dashboard Rewrite — Full-Page Pirate Map

**Context:** Complete rewrite of Dashboard.tsx. The current 1191-line stats dashboard is replaced by a full-viewport pirate map with island interactions, HUD overlay, and settings side panels.

**Files:**
- Modify: `packages/extension/src/options/Dashboard.tsx` (complete rewrite)

**Step 1: Rewrite Dashboard.tsx**

Replace the entire file with a new implementation that:

1. Fetches all stats on mount (reuse existing `GET_STATS`, `GET_DRIFT`, `GET_DRIFT_HISTORY`, `GET_STREAK`, `GET_ACHIEVEMENTS`, `GET_CHALLENGE_PROGRESS` message handlers)
2. Renders `PirateMap` in `mode="full"` filling the viewport
3. Adds HUD overlay elements:
   - Top-left: session time + daily progress
   - Top-right: mute toggle button + settings gear link
   - Bottom-right: (compass rose is drawn by PirateMap)
   - Bottom-left: level/XP bar + rank badge
4. Handles island clicks:
   - Stat islands: show parchment tooltip popover with details
   - Action islands: slide-in settings panel from right (400px wide)
5. Escape key and backdrop click close any open panel

The Dashboard component structure:

```tsx
export default function Dashboard() {
  // State: stats, driftHistory, drift, streak, achievements, settings
  // State: activePanel (null | IslandId), tooltip (null | IslandId)

  // Fetch all data on mount (from chrome.storage.local + message handlers)
  // Periodic refresh every 10s for drift + stats

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      {/* Full-page pirate map */}
      <PirateMap
        mode="full"
        driftHistory={driftHistory}
        currentDrift={drift}
        currentLevel={level}
        streak={streak}
        syncOk={syncOk}
        stats={statsForIslands}
        onIslandClick={handleIslandClick}
      />

      {/* HUD: Top-left — time + progress */}
      <div style={{ position: 'absolute', top: 20, left: 20, ... }}>
        ...session time, daily goal bar...
      </div>

      {/* HUD: Top-right — mute + settings */}
      <div style={{ position: 'absolute', top: 20, right: 20, ... }}>
        <button onClick={toggleMute}>🔊/🔇</button>
        <button onClick={openSettings}>⚙</button>
      </div>

      {/* HUD: Bottom-left — level/XP */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, ... }}>
        ...rank badge, XP bar...
      </div>

      {/* Title banner */}
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', ... }}>
        Captain's Log
      </div>

      {/* Stat tooltip popover (when stat island clicked) */}
      {tooltip && <StatTooltip ... />}

      {/* Action side panel (when action island clicked) */}
      {activePanel && <SidePanel ... onClose={closePanel} />}
    </div>
  );
}
```

The side panel slides in from right with:
- Goal settings (harbor island): daily goal slider, goal mode selector
- Difficulty (fort island): tier selector
- Friction (fog island): friction effect toggles

These reuse the same settings logic from Settings.tsx (read from storage, write back).

**Step 2: Verify**

Run: `cd packages/extension && npx tsc --noEmit && pnpm build`
Expected: No errors.

**Step 3: Manual test**

1. Open extension options page (Dashboard tab)
2. Verify: full-viewport pirate map renders
3. Verify: ship and dotted trail visible
4. Verify: 7 islands visible with labels and values
5. Verify: weather effects animate based on drift level
6. Verify: ambient audio plays (if placeholder files replaced with real audio)
7. Verify: hovering islands shows golden glow
8. Verify: clicking stat island shows tooltip
9. Verify: clicking action island opens side panel
10. Verify: Escape closes panels
11. Verify: HUD elements visible (time, mute, settings gear, XP bar)
12. Verify: compass rose shows drift % in bottom-right

**Step 4: Commit**

```bash
git add packages/extension/src/options/Dashboard.tsx
git commit -m "feat: full-page pirate map dashboard with islands, HUD, and side panels"
```

---

## Task 10: Source Real Audio Files

**Context:** Replace placeholder silence MP3s with actual royalty-free pirate/ocean audio. This is a manual task — find and download CC0/royalty-free audio.

**Requirements:**
- `ambient-ocean.mp3`: 20-40 second soothing ocean/pirate ambient loop. Should seamlessly loop. Keep under 200KB.
- `ship-bell.mp3`: Single ship's bell strike. Clean, crisp. Under 50KB.
- `ui-click.mp3`: Short wood/latch click. Under 15KB.

**Sources to check:**
- freesound.org (CC0 filter)
- pixabay.com/sound-effects (royalty-free)
- mixkit.co/free-sound-effects

**Step 1: Find and download audio files**

Search for each sound, download, convert to MP3 if needed, trim to size.

**Step 2: Replace placeholder files**

Copy the real audio files to `packages/extension/src/assets/audio/`, overwriting the placeholders.

**Step 3: Test audio playback**

Load extension, open dashboard. Verify:
- Ambient ocean loop plays and sounds good
- Opening friction overlay triggers bell sound
- Clicking islands triggers click sound
- Mute toggle works

**Step 4: Commit**

```bash
git add packages/extension/src/assets/audio/
git commit -m "feat: add real pirate audio — ocean ambient, ship bell, wood click"
```

---

## Task 11: Wire Ship's Bell to Friction Overlay

**Context:** Play the ship's bell sound when the user submits a drift rating in the friction overlay.

**Files:**
- Modify: `packages/extension/src/content/friction-overlay.ts` (~line 288, button click handler)

**Step 1: Import and play bell sound on rating**

In the button click event listener (~line 288), before calling `removeOverlay()`:

```typescript
// Play ship's bell
try {
  const bellUrl = chrome.runtime.getURL('src/assets/audio/ship-bell.mp3');
  const bell = new Audio(bellUrl);
  bell.volume = 0.3;
  bell.play().catch(() => {});
} catch {}
```

**Step 2: Verify**

Run: `cd packages/extension && pnpm build`
Expected: Build succeeds.

**Step 3: Manual test**

Watch a video until friction overlay appears, rate it. Verify bell chimes on click.

**Step 4: Commit**

```bash
git add packages/extension/src/content/friction-overlay.ts
git commit -m "feat: play ship's bell sound on drift rating"
```

---

## Task 12: Final Integration + Polish

**Context:** Final pass — ensure everything works together, fix any type errors, clean up unused code.

**Step 1: Full type check + build**

```bash
cd packages/extension && npx tsc --noEmit && pnpm build
```

Fix any errors.

**Step 2: Clean up Dashboard.tsx imports**

Remove any unused imports from the old dashboard (recharts, old stat components, etc.). The recharts dependency in package.json can stay for now — removing it is optional.

**Step 3: Full manual test checklist**

1. ☐ Load extension, go to YouTube
2. ☐ Widget bar appears with session timer, stats
3. ☐ Expand widget — mini-map visible with ship + trail
4. ☐ Click mini-map — opens options page
5. ☐ Dashboard shows full-page pirate map
6. ☐ Ship visible, dotted trail behind it
7. ☐ Islands render with live stats
8. ☐ Hover island — gold glow
9. ☐ Click stat island — tooltip appears
10. ☐ Click action island — side panel slides in
11. ☐ Escape closes panel
12. ☐ Compass rose shows drift %
13. ☐ Weather effects match drift level
14. ☐ At low drift: calm sea, gentle ripples
15. ☐ At high drift (dev tools): storm, lightning, heavy rain
16. ☐ Ambient audio plays on dashboard
17. ☐ Mute button works
18. ☐ Ship's bell on friction overlay rating
19. ☐ Resize browser — map redraws correctly
20. ☐ Settings page still works (gear icon link)

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: pirate sea chart — final integration and polish"
```
