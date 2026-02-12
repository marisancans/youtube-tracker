/**
 * Animated weather effects renderer for the pirate map.
 *
 * Renders on a separate canvas layer using requestAnimationFrame.
 * Drift-driven intensity: calm seas -> choppy -> rough -> storm with lightning.
 */

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type DriftLevel = 'low' | 'medium' | 'high' | 'critical';

interface SeaTint {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface WeatherState {
  level: DriftLevel;
  drift: number;
  waveHeight: number;
  waveSpeed: number;
  windIntensity: number;
  cloudCount: number;
  cloudOpacity: number;
  rainIntensity: number;
  seaTint: SeaTint;
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

// ---------------------------------------------------------------------------
// Weather targets per drift level
// ---------------------------------------------------------------------------

interface WeatherTargets {
  waveHeight: number;
  waveSpeed: number;
  windIntensity: number;
  cloudCount: number;
  cloudOpacity: number;
  rainIntensity: number;
  seaTint: SeaTint;
}

const WEATHER_TARGETS: Record<DriftLevel, WeatherTargets> = {
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

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

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
let timeCounter = 0;

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: SeaTint, b: SeaTint, t: number): SeaTint {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
  };
}

// ---------------------------------------------------------------------------
// State update — smooth interpolation toward targets
// ---------------------------------------------------------------------------

function updateState(): void {
  const target = WEATHER_TARGETS[state.level];
  const speed = 0.03;

  state.waveHeight = lerp(state.waveHeight, target.waveHeight, speed);
  state.waveSpeed = lerp(state.waveSpeed, target.waveSpeed, speed);
  state.windIntensity = lerp(state.windIntensity, target.windIntensity, speed);
  state.cloudCount = lerp(state.cloudCount, target.cloudCount, speed);
  state.cloudOpacity = lerp(state.cloudOpacity, target.cloudOpacity, speed);
  state.rainIntensity = lerp(state.rainIntensity, target.rainIntensity, speed);
  state.seaTint = lerpColor(state.seaTint, target.seaTint, speed);

  // Lightning — only at critical level
  if (state.level === 'critical') {
    state.lightningTimer -= 1;
    if (state.lightningTimer <= 0) {
      // Fire every 90-240 frames (3-8s at 30fps)
      state.lightningTimer = 90 + Math.floor(Math.random() * 150);
      state.lightningFlash = 1.0;
      state.screenShake = 2;
    }
  }

  // Decay flash and shake regardless of level so they wind down gracefully
  state.lightningFlash *= 0.85;
  state.screenShake *= 0.9;

  if (state.lightningFlash < 0.01) state.lightningFlash = 0;
  if (state.screenShake < 0.01) state.screenShake = 0;
}

// ---------------------------------------------------------------------------
// Draw: waves
// ---------------------------------------------------------------------------

function drawWaves(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const { waveHeight, waveSpeed, seaTint } = state;

  // Layer count scales with drift level (2–4)
  const layerCount = Math.min(4, Math.max(2, Math.round(state.cloudCount / 3) + 2));
  const baseY = h * 0.82;

  for (let layer = 0; layer < layerCount; layer++) {
    const layerRatio = layer / layerCount;
    const amplitude = waveHeight * (0.5 + layerRatio * 0.5);
    const frequency = 0.008 + layer * 0.004;
    const phaseOffset = layer * 1.3;
    const yOffset = baseY + layer * (waveHeight * 0.6);
    const alpha = seaTint.a * (0.6 + layerRatio * 0.4);

    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let x = 0; x <= w; x += 4) {
      const y =
        yOffset +
        Math.sin(x * frequency + time * waveSpeed + phaseOffset) * amplitude +
        Math.sin(x * frequency * 2.3 + time * waveSpeed * 0.7) * amplitude * 0.3;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();

    ctx.fillStyle = `rgba(${Math.round(seaTint.r)},${Math.round(seaTint.g)},${Math.round(seaTint.b)},${alpha.toFixed(3)})`;
    ctx.fill();

    // Whitecaps when waveHeight > 12
    if (waveHeight > 12) {
      const capAlpha = Math.min(1, (waveHeight - 12) / 16) * 0.6;
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${capAlpha.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y =
          yOffset +
          Math.sin(x * frequency + time * waveSpeed + phaseOffset) * amplitude +
          Math.sin(x * frequency * 2.3 + time * waveSpeed * 0.7) * amplitude * 0.3;
        // Draw cap only near wave peaks
        const slopeNext =
          yOffset +
          Math.sin((x + 4) * frequency + time * waveSpeed + phaseOffset) * amplitude +
          Math.sin((x + 4) * frequency * 2.3 + time * waveSpeed * 0.7) * amplitude * 0.3;
        if (y < slopeNext && y < yOffset - amplitude * 0.3) {
          ctx.moveTo(x - 3, y);
          ctx.lineTo(x + 3, y - 1);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Draw: wind streaks
// ---------------------------------------------------------------------------

function drawWind(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  if (state.windIntensity <= 0.1) return;

  const count = Math.round(state.windIntensity * 15);
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${(state.windIntensity * 0.25).toFixed(3)})`;
  ctx.lineWidth = 1;

  for (let i = 0; i < count; i++) {
    // Deterministic-ish placement using index + time
    const seed = i * 137.5;
    const baseX = ((seed + time * (40 + i * 3)) % (w + 200)) - 100;
    const baseY = (seed * 3.7) % (h * 0.75);
    const length = 20 + (i % 5) * 10;

    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(baseX + length, baseY + length * 0.05);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Draw: clouds
// ---------------------------------------------------------------------------

function drawClouds(ctx: CanvasRenderingContext2D, w: number, _h: number, time: number): void {
  const targetCount = Math.round(state.cloudCount);

  // Grow pool
  while (clouds.length < targetCount) {
    clouds.push({
      x: Math.random() * (w + 200) - 100,
      y: 10 + Math.random() * 60,
      width: 60 + Math.random() * 80,
      speed: 0.15 + Math.random() * 0.25,
      opacity: state.cloudOpacity,
    });
  }

  // Shrink pool
  while (clouds.length > targetCount) {
    clouds.pop();
  }

  ctx.save();
  for (const cloud of clouds) {
    cloud.x += cloud.speed * state.windIntensity + 0.05;
    if (cloud.x > w + cloud.width) {
      cloud.x = -cloud.width;
    }
    cloud.opacity = lerp(cloud.opacity, state.cloudOpacity, 0.02);

    const cx = cloud.x;
    const cy = cloud.y + Math.sin(time * 0.3 + cloud.x * 0.01) * 2;

    ctx.fillStyle = `rgba(60,60,70,${cloud.opacity.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cloud.width * 0.5, cloud.width * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - cloud.width * 0.2, cy - 5, cloud.width * 0.35, cloud.width * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + cloud.width * 0.2, cy - 3, cloud.width * 0.3, cloud.width * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Draw: rain
// ---------------------------------------------------------------------------

function drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number): void {
  if (state.rainIntensity <= 0.1) return;

  const targetCount = Math.round(state.rainIntensity * 80);

  // Grow pool
  while (rainDrops.length < targetCount) {
    rainDrops.push({
      x: Math.random() * w,
      y: Math.random() * h,
      speed: 6 + Math.random() * 8,
      length: 8 + Math.random() * 12,
    });
  }

  // Shrink pool
  while (rainDrops.length > targetCount) {
    rainDrops.pop();
  }

  ctx.save();
  ctx.strokeStyle = `rgba(180,200,220,${(state.rainIntensity * 0.4).toFixed(3)})`;
  ctx.lineWidth = 1;

  for (const drop of rainDrops) {
    drop.y += drop.speed;
    drop.x += state.windIntensity * 2;

    // Wrap when falling off screen
    if (drop.y > h) {
      drop.y = -drop.length;
      drop.x = Math.random() * w;
    }
    if (drop.x > w) {
      drop.x = 0;
    }

    ctx.beginPath();
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x + state.windIntensity * 3, drop.y + drop.length);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Draw: lightning
// ---------------------------------------------------------------------------

function drawLightning(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (state.lightningFlash <= 0.05) return;

  // White overlay flash
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${(state.lightningFlash * 0.3).toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Jagged bolt when flash is strong
  if (state.lightningFlash > 0.7) {
    const segments = 6 + Math.floor(Math.random() * 5); // 6-10 segments
    const startX = w * 0.2 + Math.random() * w * 0.6;
    const endY = h * (0.6 + Math.random() * 0.2); // 60-80% height

    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${(state.lightningFlash * 0.9).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(180,180,255,0.8)';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    let curX = startX;
    let curY = 0;
    ctx.moveTo(curX, curY);

    const stepY = endY / segments;
    for (let i = 1; i <= segments; i++) {
      const jitterX = (Math.random() - 0.5) * 40;
      curX += jitterX;
      curY += stepY;
      ctx.lineTo(curX, curY);
    }

    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

/** Update the target drift level the weather should animate toward. */
export function setDriftLevel(level: DriftLevel, drift: number): void {
  state.level = level;
  state.drift = drift;
}

/** Main render call — updates state then draws all weather layers. */
export function renderWeather(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  timeCounter += 0.033; // ~30fps increment

  updateState();

  ctx.clearRect(0, 0, w, h);

  // Apply screen shake transform
  if (state.screenShake > 0.01) {
    const shakeX = (Math.random() - 0.5) * state.screenShake * 4;
    const shakeY = (Math.random() - 0.5) * state.screenShake * 4;
    ctx.save();
    ctx.translate(shakeX, shakeY);
  }

  drawWaves(ctx, w, h, timeCounter);
  drawWind(ctx, w, h, timeCounter);
  drawClouds(ctx, w, h, timeCounter);
  drawRain(ctx, w, h, timeCounter);
  drawLightning(ctx, w, h);

  if (state.screenShake > 0.01) {
    ctx.restore();
  }
}

/** Start a 30fps requestAnimationFrame loop for continuous weather rendering. */
export function startWeatherLoop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const targetInterval = 1000 / 30; // 30fps
  let lastFrameTime = 0;

  function frame(timestamp: number): void {
    const elapsed = timestamp - lastFrameTime;

    if (elapsed >= targetInterval) {
      lastFrameTime = timestamp - (elapsed % targetInterval);
      renderWeather(ctx, w, h);
    }

    animFrameId = requestAnimationFrame(frame);
  }

  animFrameId = requestAnimationFrame(frame);
}

/** Stop the weather animation loop. */
export function stopWeatherLoop(): void {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

/** Stop the loop and reset all weather state to defaults. */
export function resetWeather(): void {
  stopWeatherLoop();

  clouds = [];
  rainDrops = [];
  timeCounter = 0;

  state = {
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
}
