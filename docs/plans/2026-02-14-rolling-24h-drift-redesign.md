# Rolling 24h + Drift-Only Redesign

**Date:** 2026-02-14
**Status:** Approved

## Problem Statement

Three issues identified:
1. Drift state resets to 0% after extension reinstall because drift is never synced to backend
2. Dashboard shows "time left" countdown based on daily goal — but drift % is the only measure of usage health
3. All stats use calendar-day (midnight reset) instead of rolling 24h window

## Design Decisions

### 1. Rolling 24h Stats (Hourly Bucket Merge)

Replace `dailyStats[today]` lookups with a `getRolling24hStats()` function.

**Algorithm:**
- Get current hour `H`, today's date key, yesterday's date key
- From yesterday's `hourlySeconds`: sum hours `H` through `23`
- From today's `hourlySeconds`: sum hours `0` through `H`
- Same for any other hourly-bucketed metrics

**Scope:**
- Applies to: Widget stats, Dashboard hero card, GET_STATS handler
- Does NOT apply to: Weekly calendar view, hourly heatmap (still shows today's 24h breakdown)
- Granularity: ~1 hour (acceptable for a wellness tool)

### 2. Remove Daily Goal From UI

`dailyGoalMinutes` becomes an internal calibration parameter for the time pressure drift axis. It controls when time pressure starts climbing toward 1.0 but is never shown as "X left" or "X over" in the UI.

**Removed:**
- "X left" / "+X over" display in Dashboard hero card
- Goal progress bar in TodayStats
- Time warning nudge in Widget (todayMinutes > dailyGoal)
- Goal display in Settings

**Kept internally:**
- `dailyGoalMinutes` in Settings (hidden, used to calibrate time pressure axis)
- Onboarding still asks "how much YouTube is too much?" to set this value
- Bedtime hour collection in onboarding (feeds circadian axis)

**Replaced with:**
- Dashboard hero: rolling 24h time + current drift % as primary metric
- Widget: rolling 24h time, no "left/over" framing
- Drift itself is the signal, not time-over-goal

### 3. Drift-Based Tier Streaks

Replace calendar-day goal-minute streaks with rolling 24h average drift thresholds.

**Tier thresholds:**

| Tier | Max Avg Drift | Sea State |
|------|--------------|-----------|
| Casual | 0.60 | Choppy allowed |
| Focused | 0.45 | Mostly calm |
| Disciplined | 0.30 | Calm with brief drifts |
| Monk | 0.15 | Almost always calm |
| Ascetic | 0.05 | Barely on YouTube |

**Implementation:**
- Average drift from `driftHistory` (30-min snapshots) over rolling 24h
- Store `avgDrift: number` in DailyStats for historical streak calculation
- Streak = consecutive 24h periods where avgDrift < tier threshold

### 4. Drift Recalculation After Restore

After reinstall → login → backend restore, reconstruct drift from restored data.

**Axis reconstruction:**
- **Time Pressure:** From restored `videoSessions` — each session's `activeSeconds` + timestamps become samples
- **Content Quality:** From restored `videoSessions` — each session's `rating` (1-5) mapped to drift samples
- **Behavior Pattern:** From restored behavioral events (synced as pendingEvents) — replay recent events
- **Circadian:** No reconstruction needed — purely clock-based

**Key insight:** Exponential decay (half-lives 3-6h) means anything older than ~18h is near-zero. Only need to replay last ~24h. If days pass between uninstall and reinstall, drift would be near-zero from natural decay anyway.

**Implementation:**
- New function `recalculateDriftFromHistory(sessions, events)` in drift.ts
- Called after `restoreFromBackend()` succeeds
- Feeds restored data with original timestamps through the decay engine

## Files Affected

### Background
- `background/drift.ts` — Add `recalculateDriftFromHistory()`, update calculation to use rolling window
- `background/index.ts` — Update `GET_STATS` handler, call drift recalc after restore
- `background/stats.ts` — Add `getRolling24hStats()` function
- `background/challenge.ts` — Rewrite streak logic to use drift thresholds
- `background/storage.ts` — Add `avgDrift` to DailyStats defaults

### Shared Types
- `shared/src/index.ts` — Add `avgDrift` to DailyStats, update ChallengerTier to use driftThreshold

### Components
- `components/widget/Widget.tsx` — Use rolling stats, remove goal references
- `components/widget/TodayStats.tsx` — Remove goal progress, show drift %
- `options/Dashboard.tsx` — Remove "X left", use rolling 24h hero
- `options/Settings.tsx` — Hide dailyGoalMinutes from UI
- `options/Onboarding.tsx` — Keep goal question but frame as calibration
