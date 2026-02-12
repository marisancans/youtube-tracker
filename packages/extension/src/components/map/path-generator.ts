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
  opacity: number;
}

export interface GeneratedPath {
  segments: PathSegment[];
  shipPosition: PathPoint;
  shipAngle: number;
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

function getDriftDeviation(drift: number): { maxDev: number; loopChance: number; curveIntensity: number } {
  if (drift < 0.3) return { maxDev: 5, loopChance: 0, curveIntensity: 0.2 };
  if (drift < 0.5) return { maxDev: 20, loopChance: 0, curveIntensity: 0.5 };
  if (drift < 0.7) return { maxDev: 50, loopChance: 0.15, curveIntensity: 0.8 };
  return { maxDev: 80, loopChance: 0.35, curveIntensity: 1.0 };
}

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
  const centerY = canvasHeight / 2;
  const stepX = usableWidth / Math.max(snapshots.length, 1);

  let currentY = centerY;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const rng = seededRandom(snap.timestamp);
    const { maxDev, loopChance, curveIntensity } = getDriftDeviation(snap.drift);

    const startX = padding + i * stepX;
    const endX = padding + (i + 1) * stepX;
    const startY = currentY;

    const devDirection = rng() > 0.5 ? 1 : -1;
    const devAmount = (rng() * maxDev) * devDirection;
    let endY = startY + devAmount;
    endY = Math.max(padding + 20, Math.min(canvasHeight - padding - 20, endY));

    const midX = (startX + endX) / 2;
    let cp1y: number;
    let cp2y: number;
    let cp1x = midX - stepX * 0.2;
    let cp2x = midX + stepX * 0.2;

    if (rng() < loopChance) {
      const loopDev = maxDev * 1.5 * (rng() > 0.5 ? 1 : -1);
      cp1y = startY + loopDev;
      cp2y = endY - loopDev * 0.5;
      cp1x = startX + stepX * 0.1;
      cp2x = endX - stepX * 0.1;
    } else {
      const curveDeviation = maxDev * curveIntensity * (rng() - 0.5) * 2;
      cp1y = startY + curveDeviation;
      cp2y = endY - curveDeviation * 0.3;
    }

    cp1y = Math.max(padding, Math.min(canvasHeight - padding, cp1y));
    cp2y = Math.max(padding, Math.min(canvasHeight - padding, cp2y));

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

  const lastSeg = segments[segments.length - 1];
  const shipPosition = lastSeg.end;
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
