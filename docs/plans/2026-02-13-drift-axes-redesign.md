# Drift Axes Redesign — Multi-Axis Weighted Decay System

**Date**: 2026-02-13
**Status**: Approved

## Problem

1. Widget bar shows stale/wrong data (1m vs 19m actual)
2. Focus score is meaningless (100% when no videos rated, rating system hidden behind dev flag)
3. Drift uses calendar-day reset, not weighted decay — midnight wipes everything
4. No resistance/friction escalation tied to real behavior
5. Ship animation is decorative, not driven by drift
6. Daily goal concept doesn't work with rolling time windows
7. Video rating system never shown to users (dev flag gated)

## Solution: Four-Axis Drift with Weighted Decay

### Core Concept

Replace single calendar-day drift calculation with four independent axes, each using exponential time decay. Recent activity matters more. No midnight reset. The composite drift score drives visual weather effects on the widget (ship rocking, waves, rain, lightning).

### Data Model

```typescript
interface DriftSample {
  timestamp: number;
  weight: number;      // contribution value
}

interface DriftAxis {
  value: number;        // 0-1, computed
  samples: DriftSample[];
  halfLife: number;     // ms
}

interface DriftState {
  axes: {
    timePressure: DriftAxis;     // half-life: 4h
    contentQuality: DriftAxis;   // half-life: 6h
    behaviorPattern: DriftAxis;  // half-life: 3h
    circadian: number;           // 0-1, clock-based, no samples
  };
  composite: number;             // weighted sum
  level: 'calm' | 'choppy' | 'rough' | 'storm';
}
```

### Axis Definitions

#### Time Pressure (weight: 0.40, half-life: 4h)

How much you've been watching. Samples added every 30s from STATS_UPDATE.

- Sample weight: `activeSeconds / 30` (0-1 per tick)
- Saturation: ~3h continuous watching within decay window = 1.0
- Decays naturally — 2h of watching in the morning fades by evening

#### Content Quality (weight: 0.25, half-life: 6h)

What you've been watching. Driven by mandatory video ratings.

| Rating | Label | Weight added |
|--------|-------|-------------|
| 1 (best) | Anchored | -0.25 (reduces axis) |
| 2 | On Course | -0.10 |
| 3 | Drifting | +0.05 |
| 4 | Adrift | +0.20 |
| 5 (worst) | Lost at Sea | +0.35 |

Longer half-life (6h) because content choices reflect sustained intent.

#### Behavior Pattern (weight: 0.20, half-life: 3h)

How you navigate YouTube. Shorter half-life because behavior is impulsive.

| Event | Weight |
|-------|--------|
| Recommendation click | +0.20 |
| Short watched | +0.15 |
| Video abandoned (<30%) | +0.10 |
| Search initiated | -0.10 |
| Video completed (>90%) | -0.05 |

#### Circadian (weight: 0.15, no decay)

When you're watching, relative to user-set bedtime. Pure clock calculation:

```
hoursUntilBedtime = bedtime - currentHour (wrapping 24h)
> 4h before bedtime:  0.0
2-4h before bedtime:  0.2
0-2h before bedtime:  0.5
past bedtime:         1.0
```

Default bedtime: 23:00. Configurable in Settings.

### Decay Formula

Every 30-second compute cycle:

```
decayed_weight = original_weight * 2^(-(now - timestamp) / halfLife)
axis_value = clamp(sum(decayed_weights) / saturation_threshold, 0, 1)
```

Samples older than `3 * halfLife` are garbage-collected (< 12.5% contribution).

### Composite Drift

```
composite = timePressure * 0.40
          + contentQuality * 0.25
          + behaviorPattern * 0.20
          + circadian * 0.15
```

Weights configurable in Settings (advanced, collapsed). Must sum to 1.0.

### Sea State Levels

| Composite | Level | Ship Rock | Waves | Effects |
|-----------|-------|-----------|-------|---------|
| 0 - 0.25 | Calm | 2deg, 4s | None | None |
| 0.25 - 0.50 | Choppy | 5deg, 2.5s + bob | 1 wave layer | Foam particles |
| 0.50 - 0.75 | Rough | 10deg, 1.5s + bob | 2 wave layers + wind | Rain (sparse CSS) |
| 0.75 - 1.0 | Storm | 15deg, 1s + heavy bob | 3 wave layers | Lightning flashes + heavy rain |

### Friction Effects (existing drift-effects.ts thresholds)

Map sea state to CSS friction:

| Level | Thumbnail Blur | Grayscale | Sidebar | Comments | Autoplay |
|-------|---------------|-----------|---------|----------|----------|
| Calm | 0 | 0 | 0% | 0% | normal |
| Choppy | 0 | 20% | 50% | 10% | 15s delay |
| Rough | 2px | 30% | 75% | 20% | 30s delay |
| Storm | 4-8px | 60-100% | 100% | 50-100% | disabled |

---

## Widget Bar Design

Fixed bar at top of YouTube. Ship left, stats center, mini radar right.

```
[ship] | 19m watched · 4 videos · drift: 0.42 | [mini-radar]
```

### Ship Animation

Ship CSS animation driven directly by composite drift value:
- Rock angle, period, bob amplitude all scale with sea state
- Background gradient darkens with drift
- Wave SVG layers added/intensified with drift
- At storm level: lightning flashes (random white flash every 3-8s, 150ms duration)

### Stats

- Total active minutes (from live session + decayed time data)
- Video count
- Drift score (always visible, prominent)

### Mini Radar

20px diamond SVG, 4 colored axes extending proportional to their value:
- Time Pressure: gold
- Content Quality: teal (low) to red (high)
- Behavior Pattern: seafoam (low) to amber (high)
- Circadian: blue (day) to purple (night)

---

## Expanded Widget Panel

Click bar to expand. ~300px overlay panel, 3 columns:

1. **Radar chart** (120px SVG polygon, 4 axes, filled area, composite centered)
2. **Axis breakdown** (4 horizontal bars with values, labels, colors)
3. **Session stats** (active time, videos, ratings summary, "Deep Dive" link to Dashboard)

---

## Video Rating System — Always On, Mandatory, 5 Levels

### Trigger

Whichever comes first:
- 60 seconds of video watched
- 80% video completion
- Navigate away from video watched > 30 seconds

### Overlay

Slides in from right side of video player. Not a modal — doesn't block playback but persists until rated. If user navigates away without rating, overlay follows to next page.

### Levels

| Level | Icon | Label | Meaning |
|-------|------|-------|---------|
| 1 | anchor | Anchored | Purposeful, intentional |
| 2 | compass | On Course | Useful, on-topic |
| 3 | wave | Drifting | Neutral, meh |
| 4 | spiral | Adrift | Distracted, rabbit-hole |
| 5 | skull | Lost at Sea | Wasteful, regret |

No skip option. No auto-dismiss. Must rate to proceed.

---

## Dashboard — Drift Analysis Section

New top section replacing current hero cards:

### Layout

- **Large radar chart** (200px) with composite value centered
- **Axis bars** with numeric values and component details
- **24h multi-line chart**: composite (thick) + 4 axis lines (thin, colored)
  - 48 data points (snapshot every 30min)
- **Axis detail cards**: raw inputs per axis (active minutes, rating breakdown, rec clicks, etc.)

### Drift score visibility

- Shown prominently in radar chart center
- Shown in axis breakdown panel header
- Shown in Dashboard header area

Existing Dashboard sections (24h bars, 7-day trend, channels, etc.) remain below.

---

## Settings Changes

### New: Bedtime

```
Bedtime: [22:00] (30-min increments)
Wind-down starts 2h before. Full circadian penalty at bedtime.
```

Stored as `settings.bedtimeHour` (number 0-23, default 23).

### New: Drift Weights (advanced, collapsed)

Four sliders, constrained to sum to 1.0. Adjusting one redistributes others proportionally.

Default: Time 0.40, Content 0.25, Behavior 0.20, Circadian 0.15.

Stored as `settings.driftWeights`.

### Removed: Daily Goal concept

`dailyGoalMinutes` no longer used for drift. Time Pressure axis replaces it. Challenge tier system stays for XP multipliers.

---

## Files Changed

| File | Change |
|------|--------|
| `background/drift.ts` | **Rewrite**: 4-axis decay system replaces current calculation |
| `background/stats.ts` | Minor: remove goal-based calculations |
| `background/storage.ts` | Add DriftState schema, bedtimeHour, driftWeights |
| `background/index.ts` | Update DRIFT message handlers for new state shape |
| `shared/src/index.ts` | New types: DriftAxis, DriftSample, DriftState, rating scale |
| `content/index.tsx` | Rating trigger logic, pass behavioral events |
| `content/App.tsx` | New widget bar with weather effects |
| `components/widget/Widget.tsx` | **Rewrite**: new bar layout, ship animation, expanded panel, radar |
| `components/widget/RatingOverlay.tsx` | **New**: 5-level mandatory rating card |
| `components/widget/DriftRadar.tsx` | **New**: SVG radar chart component (shared widget + dashboard) |
| `components/widget/SeaEffects.tsx` | **New**: wave/rain/lightning CSS animations |
| `content/drift-effects.ts` | Update thresholds to use sea state levels |
| `options/Dashboard.tsx` | New Drift Analysis section at top |
| `options/Settings.tsx` | Add bedtime picker, axis weight sliders, remove daily goal |
| `lib/live-stats-merger.ts` | Update to work with decay-based stats |

## Migration

- Existing `driftHistory` snapshots: keep for backwards display, new snapshots use new format
- Existing `dailyStats`: still accumulated for Dashboard charts, just not used for drift
- Existing `settings.dailyGoalMinutes`: kept in storage for XP tier system, hidden from drift UI
- First run after update: drift starts at 0.0 (no samples), builds naturally from user activity
