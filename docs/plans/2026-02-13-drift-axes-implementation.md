# Drift Axes Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace calendar-day drift with 4-axis weighted-decay system, always-on 5-level video ratings, weather-driven widget bar, and deep insights in expanded panel + Dashboard.

**Architecture:** Four independent drift axes (Time Pressure, Content Quality, Behavior Pattern, Circadian) each use exponential decay with configurable half-lives. They combine into a composite drift score via weighted sum. The composite drives sea-state weather effects (ship animation, waves, rain, lightning) on the widget bar and CSS friction on YouTube. A mandatory 5-level rating overlay feeds the Content Quality axis. A radar chart visualizes all axes in both widget panel and Dashboard.

**Tech Stack:** React 18, TypeScript, Vite + CRX plugin, TailwindCSS, SVG for radar/animations, Chrome Extension APIs (storage, messaging). No unit test framework — verification via `cd packages/extension && pnpm build` (tsc + vite).

**Design doc:** `docs/plans/2026-02-13-drift-axes-redesign.md`

---

## Task 1: Shared Types

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Add new drift types after existing TemporalData interface (line ~546)**

```typescript
// ===== Drift Axes System =====

export interface DriftSample {
  timestamp: number;
  weight: number;
}

export interface DriftAxisState {
  value: number;          // 0-1 computed
  samples: DriftSample[];
  halfLife: number;       // ms
}

export interface DriftAxes {
  timePressure: DriftAxisState;
  contentQuality: DriftAxisState;
  behaviorPattern: DriftAxisState;
  circadian: number;      // 0-1, clock-based
}

export type SeaState = 'calm' | 'choppy' | 'rough' | 'storm';

export interface DriftStateV2 {
  axes: DriftAxes;
  composite: number;      // weighted sum 0-1
  level: SeaState;
  lastCalculated: number;
}

export interface DriftWeights {
  timePressure: number;   // default 0.40
  contentQuality: number; // default 0.25
  behaviorPattern: number;// default 0.20
  circadian: number;      // default 0.15
}

export type VideoRating = 1 | 2 | 3 | 4 | 5;

export interface DriftEffectsV2 {
  thumbnailBlur: number;
  thumbnailGrayscale: number;
  commentsReduction: number;
  sidebarReduction: number;
  autoplayDelay: number;
  showTextOnly: boolean;
  seaState: SeaState;
}
```

**Step 2: Add behavioral event message types to MessageType union**

Add these to the MessageType union (before `'STATS_UPDATE'`):

```typescript
  // Behavioral events for drift
  | 'DRIFT_BEHAVIOR_EVENT'
  // Drift V2
  | 'GET_DRIFT_V2'
  | 'DRIFT_V2_UPDATED'
```

**Step 3: Replace ProductivityRating type**

Change existing `export type ProductivityRating = -1 | 0 | 1;` to:

```typescript
export type ProductivityRating = -1 | 0 | 1; // legacy
export type VideoRatingValue = 1 | 2 | 3 | 4 | 5; // new 5-level
```

**Step 4: Build shared package**

Run: `cd packages/shared && pnpm build`
Expected: Clean tsc output, no errors.

**Step 5: Commit**

```
feat: add drift axes types to shared package
```

---

## Task 2: Storage Schema Updates

**Files:**
- Modify: `packages/extension/src/background/storage.ts`

**Step 1: Add new interfaces and defaults**

After existing `DriftSnapshot` interface (~line 53), add:

```typescript
import type { DriftStateV2, DriftWeights, DriftAxes, DriftAxisState } from '@yt-detox/shared';

export const DEFAULT_DRIFT_WEIGHTS: DriftWeights = {
  timePressure: 0.40,
  contentQuality: 0.25,
  behaviorPattern: 0.20,
  circadian: 0.15,
};

export const DRIFT_HALF_LIVES = {
  timePressure: 4 * 60 * 60 * 1000,   // 4h
  contentQuality: 6 * 60 * 60 * 1000, // 6h
  behaviorPattern: 3 * 60 * 60 * 1000,// 3h
};

export const DRIFT_SATURATION = {
  timePressure: 180,     // ~3h of active seconds within window = 1.0
  contentQuality: 3.0,   // sum of weights to saturate
  behaviorPattern: 2.0,  // sum of weights to saturate
};

function emptyAxis(halfLife: number): DriftAxisState {
  return { value: 0, samples: [], halfLife };
}

export function emptyDriftStateV2(): DriftStateV2 {
  return {
    axes: {
      timePressure: emptyAxis(DRIFT_HALF_LIVES.timePressure),
      contentQuality: emptyAxis(DRIFT_HALF_LIVES.contentQuality),
      behaviorPattern: emptyAxis(DRIFT_HALF_LIVES.behaviorPattern),
      circadian: 0,
    },
    composite: 0,
    level: 'calm',
    lastCalculated: Date.now(),
  };
}
```

**Step 2: Add `bedtimeHour` and `driftWeights` to DEFAULT_SETTINGS**

The storage already has `bedtime: '23:00'` — add alongside it:

```typescript
bedtimeHour: 23,  // numeric for circadian calc
driftWeights: DEFAULT_DRIFT_WEIGHTS,
```

**Step 3: Build**

Run: `cd packages/extension && pnpm build`
Expected: Pass.

**Step 4: Commit**

```
feat: add drift v2 storage schema and defaults
```

---

## Task 3: Drift Engine Rewrite

**Files:**
- Modify: `packages/extension/src/background/drift.ts`

This is the core engine. Keep all existing exports but rewrite internals. The old `calculateDrift()` signature changes to return the new state shape.

**Step 1: Add decay math helpers at top of file**

```typescript
import type { DriftStateV2, DriftAxisState, DriftSample, SeaState, DriftEffectsV2, DriftWeights } from '@yt-detox/shared';
import { getStorage, emptyDriftStateV2, DEFAULT_DRIFT_WEIGHTS, DRIFT_SATURATION, DRIFT_HALF_LIVES } from './storage';

function decayWeight(sample: DriftSample, now: number, halfLife: number): number {
  const elapsed = now - sample.timestamp;
  return sample.weight * Math.pow(2, -(elapsed / halfLife));
}

function computeAxisValue(axis: DriftAxisState, now: number, saturation: number): number {
  let sum = 0;
  for (const s of axis.samples) {
    sum += decayWeight(s, now, axis.halfLife);
  }
  return Math.min(Math.max(sum / saturation, 0), 1);
}

function gcSamples(axis: DriftAxisState, now: number): DriftSample[] {
  const maxAge = axis.halfLife * 3;
  return axis.samples.filter(s => (now - s.timestamp) < maxAge);
}

function computeCircadian(bedtimeHour: number): number {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  let hoursUntil = bedtimeHour - currentHour;
  if (hoursUntil < -12) hoursUntil += 24;
  if (hoursUntil > 12) hoursUntil -= 24;

  if (hoursUntil > 4) return 0;
  if (hoursUntil > 2) return 0.2;
  if (hoursUntil > 0) return 0.5;
  return 1.0;
}

function getSeaState(composite: number): SeaState {
  if (composite < 0.25) return 'calm';
  if (composite < 0.50) return 'choppy';
  if (composite < 0.75) return 'rough';
  return 'storm';
}
```

**Step 2: Replace module state and core calculate function**

Replace the old `driftState` and `calculateDrift` with:

```typescript
let driftV2: DriftStateV2 = emptyDriftStateV2();

export function addDriftSample(
  axis: 'timePressure' | 'contentQuality' | 'behaviorPattern',
  weight: number,
): void {
  driftV2.axes[axis].samples.push({ timestamp: Date.now(), weight });
}

export async function calculateDriftV2(): Promise<DriftStateV2> {
  const storage = await getStorage();
  const weights: DriftWeights = storage.settings.driftWeights || DEFAULT_DRIFT_WEIGHTS;
  const bedtimeHour: number = storage.settings.bedtimeHour ?? 23;
  const now = Date.now();

  // Garbage collect old samples
  driftV2.axes.timePressure.samples = gcSamples(driftV2.axes.timePressure, now);
  driftV2.axes.contentQuality.samples = gcSamples(driftV2.axes.contentQuality, now);
  driftV2.axes.behaviorPattern.samples = gcSamples(driftV2.axes.behaviorPattern, now);

  // Compute each axis
  driftV2.axes.timePressure.value = computeAxisValue(
    driftV2.axes.timePressure, now, DRIFT_SATURATION.timePressure,
  );
  driftV2.axes.contentQuality.value = computeAxisValue(
    driftV2.axes.contentQuality, now, DRIFT_SATURATION.contentQuality,
  );
  driftV2.axes.behaviorPattern.value = computeAxisValue(
    driftV2.axes.behaviorPattern, now, DRIFT_SATURATION.behaviorPattern,
  );
  driftV2.axes.circadian = computeCircadian(bedtimeHour);

  // Composite
  driftV2.composite =
    driftV2.axes.timePressure.value * weights.timePressure +
    driftV2.axes.contentQuality.value * weights.contentQuality +
    driftV2.axes.behaviorPattern.value * weights.behaviorPattern +
    driftV2.axes.circadian * weights.circadian;

  driftV2.composite = Math.min(Math.max(driftV2.composite, 0), 1);
  driftV2.level = getSeaState(driftV2.composite);
  driftV2.lastCalculated = now;

  return driftV2;
}

export function getDriftV2State(): DriftStateV2 {
  return driftV2;
}
```

**Step 3: Keep old `calculateDrift()` as a compatibility wrapper**

The existing code (background/index.ts, Widget.tsx) calls `calculateDrift()`. Keep it working by wrapping the new engine:

```typescript
export async function calculateDrift(): Promise<{ drift: number; factors: Record<string, number> }> {
  const state = await calculateDriftV2();
  return {
    drift: state.composite,
    factors: {
      timeRatio: state.axes.timePressure.value,
      unproductiveRatio: state.axes.contentQuality.value,
      recommendationRatio: state.axes.behaviorPattern.value,
      lateNightBonus: state.axes.circadian,
      productiveDiscount: 0,
      bingeBonus: 0,
      breakDiscount: 0,
    },
  };
}
```

**Step 4: Update `getDriftEffectsAsync` / `getDriftEffects` to use sea state**

```typescript
export function getDriftEffects(drift: number): DriftEffectsV2 {
  const level = getSeaState(drift);
  const base = { seaState: level, showTextOnly: false };

  switch (level) {
    case 'calm':
      return { ...base, thumbnailBlur: 0, thumbnailGrayscale: 0, commentsReduction: 0, sidebarReduction: 0, autoplayDelay: 5 };
    case 'choppy':
      return { ...base, thumbnailBlur: 0, thumbnailGrayscale: 20, commentsReduction: 10, sidebarReduction: 50, autoplayDelay: 15 };
    case 'rough':
      return { ...base, thumbnailBlur: 2, thumbnailGrayscale: 30, commentsReduction: 20, sidebarReduction: 75, autoplayDelay: 30 };
    case 'storm':
      return { ...base, thumbnailBlur: 6, thumbnailGrayscale: 80, commentsReduction: 75, sidebarReduction: 100, autoplayDelay: 999, showTextOnly: drift >= 0.9 };
  }
}

export async function getDriftEffectsAsync(drift: number): Promise<DriftEffectsV2> {
  return getDriftEffects(drift);
}
```

**Step 5: Update `startDriftCalculation` to feed time pressure samples from STATS_UPDATE**

In the periodic calculation loop, also handle incoming time pressure from the live session data in storage:

```typescript
export function startDriftCalculation(intervalMs: number = 30000): void {
  if (driftInterval) clearInterval(driftInterval);

  driftInterval = setInterval(async () => {
    // Feed time pressure from live session
    const stored = await chrome.storage.local.get(['liveSession', 'liveSessionUpdatedAt']);
    if (stored.liveSession && stored.liveSessionUpdatedAt) {
      const age = Date.now() - stored.liveSessionUpdatedAt;
      if (age < 60000) { // fresh data
        const activeSeconds = stored.liveSession.activeDurationSeconds || 0;
        // Add a sample proportional to the interval (30s of active time = weight 1.0)
        const weight = Math.min(activeSeconds > 0 ? intervalMs / 1000 / 60 : 0, 1);
        if (weight > 0) {
          addDriftSample('timePressure', weight);
        }
      }
    }

    const state = await calculateDriftV2();
    const effects = getDriftEffects(state.composite);

    // Broadcast to all YouTube tabs
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'DRIFT_V2_UPDATED',
            data: { state, effects },
          }).catch(() => {});
        }
      }
    });

    // Record snapshot every 30 min
    const now = Date.now();
    if (now - lastSnapshotTime >= 30 * 60 * 1000) {
      lastSnapshotTime = now;
      driftSnapshots.push({
        timestamp: now,
        drift: state.composite,
        level: state.level,
        videosThisHour: 0,
        productiveThisHour: 0,
      });
      if (driftSnapshots.length > 48) driftSnapshots = driftSnapshots.slice(-48);
      await chrome.storage.local.set({ driftHistory: driftSnapshots });
    }
  }, intervalMs);
}
```

**Step 6: Update `getDriftLevel` to return SeaState**

```typescript
export function getDriftLevel(drift: number): SeaState {
  return getSeaState(drift);
}
```

**Step 7: Persist and restore drift state**

Update `initDrift()` to load/save the v2 state from storage:

```typescript
export async function initDrift(): Promise<void> {
  const stored = await chrome.storage.local.get(['driftV2State']);
  if (stored.driftV2State) {
    driftV2 = stored.driftV2State;
    // Restore half-lives (not stored)
    driftV2.axes.timePressure.halfLife = DRIFT_HALF_LIVES.timePressure;
    driftV2.axes.contentQuality.halfLife = DRIFT_HALF_LIVES.contentQuality;
    driftV2.axes.behaviorPattern.halfLife = DRIFT_HALF_LIVES.behaviorPattern;
  }
}
```

At the end of `calculateDriftV2`, persist:

```typescript
await chrome.storage.local.set({ driftV2State: driftV2 });
```

**Step 8: Build**

Run: `cd packages/shared && pnpm build && cd ../extension && pnpm build`
Expected: Pass (may need to fix type imports — resolve any issues).

**Step 9: Commit**

```
feat: rewrite drift engine with 4-axis weighted decay
```

---

## Task 4: Background Message Handler Updates

**Files:**
- Modify: `packages/extension/src/background/index.ts`

**Step 1: Import new functions**

Update drift imports:

```typescript
import {
  calculateDrift,
  calculateDriftV2,
  getDriftLevel,
  getDriftEffectsAsync,
  getDriftEffects,
  getDriftState,
  getDriftV2State,
  getDriftSnapshots,
  initDrift,
  initDriftHistory,
  startDriftCalculation,
  addDriftSample,
} from './drift';
```

**Step 2: Add GET_DRIFT_V2 case in switch**

After the existing `GET_DRIFT_EFFECTS` case:

```typescript
case 'GET_DRIFT_V2':
  response = getDriftV2State();
  break;
```

**Step 3: Add DRIFT_BEHAVIOR_EVENT handler**

After STATS_UPDATE case:

```typescript
case 'DRIFT_BEHAVIOR_EVENT': {
  const evt = data as { axis: 'timePressure' | 'contentQuality' | 'behaviorPattern'; weight: number };
  addDriftSample(evt.axis, evt.weight);
  break;
}
```

**Step 4: Build**

Run: `cd packages/extension && pnpm build`
Expected: Pass.

**Step 5: Commit**

```
feat: add drift v2 message handlers in background
```

---

## Task 5: Always-On Rating System

**Files:**
- Modify: `packages/extension/src/content/friction-overlay.ts` (minor — already has 5 levels)
- Modify: `packages/extension/src/components/widget/Widget.tsx` (remove dev feature gate)
- Modify: `packages/extension/src/content/index.tsx` (send behavioral events)

**Step 1: Remove the dev feature gate from Widget.tsx**

In Widget.tsx, find where `showFrictionOverlay` is called (around line 806-829). The condition checks `__YT_DETOX_DEV_FEATURES__.frictionOverlay`. Remove the dev feature check so the overlay always shows. Keep the other trigger conditions (60s watched or 80% completion).

Search for: `devFeatures.frictionOverlay` or `__YT_DETOX_DEV_FEATURES__` in Widget.tsx and remove the gate. The overlay should always trigger.

**Step 2: Map 5-level ratings to drift axis samples**

In the rating handler in Widget.tsx (where `rateVideo` is called after overlay), add a message to feed the Content Quality axis:

```typescript
const RATING_WEIGHTS: Record<number, number> = {
  1: -0.25, // Anchored
  2: -0.10, // On Course
  3: 0.05,  // Drifting
  4: 0.20,  // Adrift
  5: 0.35,  // Lost at Sea
};

// After getting the drift rating:
chrome.runtime.sendMessage({
  type: 'DRIFT_BEHAVIOR_EVENT',
  data: { axis: 'contentQuality', weight: RATING_WEIGHTS[driftRating] || 0 },
});
```

**Step 3: Send behavioral events from content script**

In `content/index.tsx`, in the recommendation tracking handler (`setupRecommendationTracking`), after `trackRecommendationClick`, add:

```typescript
chrome.runtime.sendMessage({
  type: 'DRIFT_BEHAVIOR_EVENT',
  data: { axis: 'behaviorPattern', weight: 0.20 },
});
```

In `handleUrlChange`, when a short is detected, add:

```typescript
if (newPageType === 'shorts') {
  chrome.runtime.sendMessage({
    type: 'DRIFT_BEHAVIOR_EVENT',
    data: { axis: 'behaviorPattern', weight: 0.15 },
  });
}
```

When a search is detected (already in handleUrlChange):

```typescript
if (query) {
  trackSearch(query);
  chrome.runtime.sendMessage({
    type: 'DRIFT_BEHAVIOR_EVENT',
    data: { axis: 'behaviorPattern', weight: -0.10 },
  });
}
```

**Step 4: Build**

Run: `cd packages/extension && pnpm build`
Expected: Pass.

**Step 5: Commit**

```
feat: always-on video ratings, behavioral events feed drift axes
```

---

## Task 6: Widget Bar Redesign — Sea Effects

**Files:**
- Create: `packages/extension/src/components/widget/SeaEffects.tsx`

**Step 1: Create the SeaEffects component**

This component renders waves, rain, and lightning as CSS animations inside the widget bar's shadow DOM. It takes the sea state and composite drift as props.

```typescript
import type { SeaState } from '@yt-detox/shared';

interface SeaEffectsProps {
  seaState: SeaState;
  composite: number;
}

export default function SeaEffects({ seaState, composite }: SeaEffectsProps) {
  // Returns layered divs:
  // - Wave SVG layers (1-3 depending on state) at bottom of bar
  // - Rain dots (CSS animation) for rough/storm
  // - Lightning flash overlay for storm
  // All using inline styles (shadow DOM, no Tailwind)
}
```

**Wave layers**: SVG `<path>` elements with sine-wave shapes, animated with CSS `translateX` at different speeds. Amplitude and count scale with sea state.

**Rain**: Absolutely positioned thin divs (1px wide, 10-20px tall, white, 10-30% opacity) with `translateY` animation falling from top. Count: 0 (calm/choppy), 15 (rough), 40 (storm).

**Lightning**: A `div` covering the full bar with `background: white`, `opacity` animated from 0 to 0.25 to 0 over 150ms. Triggered via `useEffect` + `setTimeout` with random 3-8s intervals. Only active when seaState === 'storm'.

Target: ~100 lines. All inline styles.

**Step 2: Build**

Run: `cd packages/extension && pnpm build`
Expected: Pass.

**Step 3: Commit**

```
feat: add SeaEffects component for widget weather
```

---

## Task 7: Widget Bar Redesign — DriftRadar Component

**Files:**
- Create: `packages/extension/src/components/widget/DriftRadar.tsx`

**Step 1: Create shared radar chart SVG component**

Used in both widget (small, 20-24px) and expanded panel (120px) and Dashboard (200px).

```typescript
import type { DriftAxes } from '@yt-detox/shared';

interface DriftRadarProps {
  axes: DriftAxes;
  size: number;      // px
  showLabels?: boolean;
  className?: string;
}

export default function DriftRadar({ axes, size, showLabels, className }: DriftRadarProps) {
  // SVG diamond/polygon with 4 axes:
  // Top: Content Quality
  // Right: Behavior Pattern
  // Bottom: Circadian
  // Left: Time Pressure
  //
  // Background: faint grid lines at 0.25, 0.5, 0.75
  // Filled polygon connecting the 4 axis values
  // Fill color: teal at low composite, gold at medium, red at high
  // Optional axis labels when showLabels=true
}
```

Each axis point: center + (axis.value * radius) in its direction.

Target: ~80 lines.

**Step 2: Build and commit**

```
feat: add DriftRadar SVG component
```

---

## Task 8: Widget Bar Layout Rewrite

**Files:**
- Modify: `packages/extension/src/components/widget/Widget.tsx`

This is the biggest task. The widget bar currently shows session time, daily goal progress, focus score, and a ship icon. Replace with:

**Step 1: Add drift v2 state to Widget**

Add state for the new drift data:

```typescript
const [driftV2, setDriftV2] = useState<DriftStateV2 | null>(null);
```

Fetch it in the initial load useEffect:

```typescript
chrome.runtime.sendMessage({ type: 'GET_DRIFT_V2' }, (r) => {
  if (r?.composite !== undefined) setDriftV2(r);
});
```

And in the periodic update (every 10s), refresh it.

Also listen for `DRIFT_V2_UPDATED` messages:

```typescript
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DRIFT_V2_UPDATED' && msg.data?.state) {
    setDriftV2(msg.data.state);
  }
});
```

**Step 2: Rewrite the collapsed bar section**

Replace the current bar layout. New bar structure:

```
[Ship + Sea Effects] | [Xm watched · Y videos · drift: 0.XX] | [Mini Radar]
```

Ship animation driven by `driftV2.composite`:
- CSS `--rock-angle`, `--rock-period`, `--bob-amplitude` custom properties set from JS based on sea state.

Stats section: `state.sessionDuration` formatted as minutes, `state.videosWatched`, and `driftV2.composite` formatted as percentage or 0.XX.

Mini radar: `<DriftRadar axes={driftV2.axes} size={22} />`.

Background gradient: darkens with composite. SeaEffects component renders inside the bar.

**Step 3: Remove daily goal progress bar from collapsed bar**

Delete the old progress bar (`progressPercent`, `isOverGoal`, `isNearGoal` logic in the bar). The weather effects replace it.

**Step 4: Remove focus score from bar**

Delete `calculateFocusScore` usage in bar display. Keep the function if the expanded panel still uses it, otherwise remove entirely.

**Step 5: Build**

Run: `cd packages/extension && pnpm build`
Expected: Pass.

**Step 6: Commit**

```
feat: rewrite widget bar with ship weather, drift score, mini radar
```

---

## Task 9: Widget Expanded Panel Redesign

**Files:**
- Modify: `packages/extension/src/components/widget/Widget.tsx`

**Step 1: Rewrite the expanded panel section**

Replace the current Captain's Log expanded content with 3-column layout:

**Column 1 — Radar Chart (120px)**
```tsx
<DriftRadar axes={driftV2.axes} size={120} showLabels />
<div>Drift: {Math.round(driftV2.composite * 100)}%</div>
<div>Sea State: {driftV2.level}</div>
```

**Column 2 — Axis Breakdown**
Four horizontal bars, each showing axis name, colored bar (width = value%), and numeric value:

```tsx
{(['timePressure', 'contentQuality', 'behaviorPattern'] as const).map(axis => (
  <div key={axis}>
    <span>{axisLabels[axis]}</span>
    <div style={{ width: `${driftV2.axes[axis].value * 100}%`, background: axisColors[axis] }} />
    <span>{driftV2.axes[axis].value.toFixed(2)}</span>
  </div>
))}
<div>
  <span>Circadian</span>
  <div style={{ width: `${driftV2.axes.circadian * 100}%` }} />
  <span>{driftV2.axes.circadian.toFixed(2)}</span>
</div>
```

**Column 3 — Session Stats**
- Active time (from getCurrentSession)
- Videos watched
- Ratings summary (productive/neutral/unproductive counts)
- "Deep Dive" button → opens Dashboard (`chrome.runtime.sendMessage({ type: 'OPEN_TAB', data: { url: chrome.runtime.getURL('options.html#dashboard') } })`)

**Step 2: Remove old expanded panel sections that are replaced**

Remove: old drift weather display, old focus score compass, old daily goal detail. Keep: 24h chart, achievements, sync status, pirate map (if still relevant).

**Step 3: Build**

Run: `cd packages/extension && pnpm build`
Expected: Pass.

**Step 4: Commit**

```
feat: redesign widget expanded panel with radar and axis breakdown
```

---

## Task 10: Dashboard Drift Analysis Section

**Files:**
- Modify: `packages/extension/src/options/Dashboard.tsx`

**Step 1: Add drift v2 state and fetching**

```typescript
import type { DriftStateV2 } from '@yt-detox/shared';
import DriftRadar from '@/components/widget/DriftRadar';

const [driftV2, setDriftV2] = useState<DriftStateV2 | null>(null);
```

In `fetchAll`, add:

```typescript
chrome.runtime.sendMessage({ type: 'GET_DRIFT_V2' }, (r) => {
  if (r?.composite !== undefined) setDriftV2(r);
});
```

**Step 2: Add Drift Analysis section at top of main grid**

Before the current hero cards row, add a full-width `col-span-6` section:

Left: `<DriftRadar axes={driftV2.axes} size={200} showLabels />` with composite centered.

Right: Four axis bars (like widget panel but larger), plus composite value and sea state label.

Below: Multi-line 24h chart showing composite + per-axis history lines. Uses existing `DriftLine` component adapted for multiple lines, or a new component with 4 colored SVG polylines + a thick composite line. Data from `driftHistory` snapshots.

Below that: Three axis detail cards (Time Pressure, Content Quality, Behavior Pattern) showing raw inputs — active minutes, rating breakdown, rec clicks, shorts, searches, etc.

**Step 3: Prominently show drift score**

Add drift score to the hero cards row (replace the old "Drift" hero card with updated data from driftV2):

```tsx
<HeroCard
  value={`${Math.round(driftV2.composite * 100)}%`}
  label="Drift"
  sub={driftV2.level}
  color={/* color based on sea state */}
/>
```

**Step 4: Build**

Run: `cd packages/extension && pnpm build`
Expected: Pass.

**Step 5: Commit**

```
feat: add drift analysis section to Dashboard
```

---

## Task 11: Settings — Bedtime & Axis Weights

**Files:**
- Modify: `packages/extension/src/options/Settings.tsx`

**Step 1: Add bedtime picker**

After the Goal Mode section, add a Bedtime section:

```tsx
<div className="bg-parchment rounded-2xl p-6 shadow-sm rope-border">
  <h2 className="font-display text-ink text-lg font-semibold mb-1">Bedtime</h2>
  <p className="text-sm text-ink-light font-body mb-4">
    When should YouTube get harder to use?
  </p>
  <select
    value={settings.bedtimeHour ?? 23}
    onChange={(e) => setSettings(p => ({ ...p, bedtimeHour: Number(e.target.value) }))}
    className="bg-parchment-dark/30 border border-gold/30 rounded-lg px-4 py-2 font-body text-ink"
  >
    {Array.from({ length: 24 }, (_, i) => (
      <option key={i} value={i}>{`${i.toString().padStart(2, '0')}:00`}</option>
    ))}
  </select>
  <p className="text-xs text-ink-light mt-2 font-body">
    Wind-down starts 2h before. Full circadian penalty at bedtime.
  </p>
</div>
```

**Step 2: Add axis weights (advanced, collapsible)**

After bedtime, add a collapsible section:

```tsx
const [showWeights, setShowWeights] = useState(false);
```

Four range sliders for drift weights. When one changes, redistribute the others proportionally to keep sum = 1.0. Show a "Reset to defaults" button.

**Step 3: Remove daily goal from drift-related UI**

The daily goal slider/display in Settings is tied to the challenge tier system for XP. Keep it for that purpose but remove any language about it being a "drift limit" or "watch limit". It's now purely for XP calculation.

**Step 4: Build**

Run: `cd packages/extension && pnpm build`
Expected: Pass.

**Step 5: Commit**

```
feat: add bedtime picker and drift weight sliders to Settings
```

---

## Task 12: Update Drift Effects for Sea State

**Files:**
- Modify: `packages/extension/src/content/drift-effects.ts`

**Step 1: Update to accept sea state from DRIFT_V2_UPDATED messages**

The existing `initDriftEffects()` listens for `DRIFT_UPDATED`. Add a listener for `DRIFT_V2_UPDATED` alongside it:

```typescript
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DRIFT_V2_UPDATED' && msg.data?.effects) {
    applyDriftEffects(msg.data.effects);
    updateAtmosphere(msg.data.effects);
  }
});
```

**Step 2: Update atmosphere sea states to match new levels**

Map the `SeaState` enum ('calm', 'choppy', 'rough', 'storm') to the existing atmosphere system. The current code already has similar states — align the naming.

**Step 3: Build and commit**

```
feat: update drift effects to use sea state from v2 engine
```

---

## Task 13: Final Integration & Cleanup

**Files:**
- Various — cleanup pass

**Step 1: Remove `devFeatures.frictionOverlay` gate everywhere**

Search for `frictionOverlay` in all files. Remove the conditional checks. The rating overlay is always on.

**Step 2: Ensure STATS_UPDATE feeds time pressure**

Verify the chain: content script sends STATS_UPDATE every 30s → background writes to storage → drift engine reads from storage in its 30s loop → adds time pressure sample. This should already work from Task 3 Step 5.

**Step 3: Full build**

Run: `cd packages/shared && pnpm build && cd ../extension && pnpm build`
Expected: Clean build, no errors.

**Step 4: Manual smoke test checklist**

Load unpacked in Chrome and verify:
- [ ] Widget bar shows ship + watchtime + videos + drift score + mini radar
- [ ] Ship rocks more as drift increases
- [ ] Waves appear at choppy, rain at rough, lightning at storm
- [ ] Video rating overlay appears after 60s of watching (no dev flag needed)
- [ ] Rating overlay is mandatory (no skip/dismiss)
- [ ] Rating affects Content Quality axis immediately
- [ ] Expanded widget panel shows radar, axis bars, session stats
- [ ] Dashboard top section shows large radar, multi-line chart, axis details
- [ ] Drift score visible in widget bar, expanded panel, and Dashboard
- [ ] Settings has bedtime picker
- [ ] Settings has axis weight sliders (advanced section)
- [ ] Drift decays over time without watching
- [ ] Circadian axis increases as bedtime approaches

**Step 5: Commit**

```
feat: drift axes v2 — complete integration
```

---

## Summary

| Task | Description | Est. Lines | Key Files |
|------|-------------|-----------|-----------|
| 1 | Shared types | +40 | shared/src/index.ts |
| 2 | Storage schema | +50 | background/storage.ts |
| 3 | Drift engine rewrite | ~250 (rewrite) | background/drift.ts |
| 4 | Background handlers | +20 | background/index.ts |
| 5 | Always-on ratings + events | +30 | Widget.tsx, index.tsx |
| 6 | SeaEffects component | +100 (new) | widget/SeaEffects.tsx |
| 7 | DriftRadar component | +80 (new) | widget/DriftRadar.tsx |
| 8 | Widget bar rewrite | ~200 (rewrite) | Widget.tsx |
| 9 | Widget panel redesign | ~150 (rewrite) | Widget.tsx |
| 10 | Dashboard drift section | +120 | Dashboard.tsx |
| 11 | Settings bedtime/weights | +80 | Settings.tsx |
| 12 | Drift effects update | +20 | drift-effects.ts |
| 13 | Integration + cleanup | +10 | various |

**Total: ~13 tasks, ~1150 lines changed/added.**
**Execution order: sequential (1→13), each task builds on the previous.**
