# Rolling 24h + Drift-Only Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace calendar-day stats with rolling 24h windows, remove daily goal UI, add drift-based tier streaks, and recalculate drift after backend restore.

**Architecture:** Hourly bucket merge from today + yesterday DailyStats. Daily goal becomes internal drift calibration. Challenge system uses average drift from 30-min snapshots. Drift rebuild from restored video sessions after reinstall.

**Tech Stack:** TypeScript, React, Chrome Extension APIs (chrome.storage.local, chrome.runtime)

---

### Task 1: Add `avgDrift` field to DailyStats

**Files:**
- Modify: `packages/shared/src/index.ts:105-149` (DailyStats interface)
- Modify: `packages/extension/src/background/stats.ts:10-52` (getEmptyDailyStats)

**Step 1: Add avgDrift to shared DailyStats interface**

In `packages/shared/src/index.ts`, add after `bingeSessions: number;` (line 148):

```typescript
  // Drift
  avgDrift: number; // Average composite drift for this day (computed from snapshots)
```

**Step 2: Add avgDrift default in getEmptyDailyStats**

In `packages/extension/src/background/stats.ts`, add `avgDrift: 0` to the return object in `getEmptyDailyStats()`, after `bingeSessions: 0,` (line 51):

```typescript
    avgDrift: 0,
```

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts packages/extension/src/background/stats.ts
git commit -m "feat: add avgDrift field to DailyStats"
```

---

### Task 2: Add `getRolling24hStats()` function

**Files:**
- Modify: `packages/extension/src/background/stats.ts`

**Step 1: Add the rolling 24h stats function**

Add this function at the end of `packages/extension/src/background/stats.ts` (before the closing of the file):

```typescript
// ===== Rolling 24h Stats =====

export interface Rolling24hStats {
  activeSeconds: number;
  totalSeconds: number;
  backgroundSeconds: number;
  videoCount: number;
  shortsCount: number;
  sessionCount: number;
  productiveVideos: number;
  unproductiveVideos: number;
  neutralVideos: number;
  searchCount: number;
  recommendationClicks: number;
  autoplayCount: number;
  autoplayCancelled: number;
  thumbnailsHovered: number;
  thumbnailsClicked: number;
  tabSwitches: number;
  pageReloads: number;
  backButtonPresses: number;
  bingeSessions: number;
  preSleepMinutes: number;
  totalScrollPixels: number;
  hourlySeconds: Record<string, number>;
  topChannels: ChannelStat[];
}

export async function getRolling24hStats(): Promise<Rolling24hStats> {
  const storage = await getStorage();
  const now = new Date();
  const currentHour = now.getHours();

  const todayKey = getTodayKey();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split('T')[0];

  const todayStats = storage.dailyStats[todayKey];
  const yesterdayStats = storage.dailyStats[yesterdayKey];

  // Sum numeric fields from relevant hourly portions of today and yesterday
  // Yesterday: hours from (currentHour+1) through 23
  // Today: hours from 0 through currentHour
  const result: Rolling24hStats = {
    activeSeconds: 0,
    totalSeconds: 0,
    backgroundSeconds: 0,
    videoCount: 0,
    shortsCount: 0,
    sessionCount: 0,
    productiveVideos: 0,
    unproductiveVideos: 0,
    neutralVideos: 0,
    searchCount: 0,
    recommendationClicks: 0,
    autoplayCount: 0,
    autoplayCancelled: 0,
    thumbnailsHovered: 0,
    thumbnailsClicked: 0,
    tabSwitches: 0,
    pageReloads: 0,
    backButtonPresses: 0,
    bingeSessions: 0,
    preSleepMinutes: 0,
    totalScrollPixels: 0,
    hourlySeconds: {},
    topChannels: [],
  };

  // For hourly-bucketed data, we can precisely sum the right hours.
  // For non-hourly aggregate fields (videoCount, sessionCount etc.),
  // we take all of today + a proportional estimate from yesterday based on
  // which hours had activity. Since we don't have per-hour breakdowns for
  // video counts, we use: today's full stats + yesterday's stats scaled by
  // the fraction of yesterday's active hours that fall in our window.

  // Today: add everything (hours 0..currentHour are within 24h window)
  if (todayStats) {
    result.activeSeconds += todayStats.activeSeconds || 0;
    result.totalSeconds += todayStats.totalSeconds || 0;
    result.backgroundSeconds += todayStats.backgroundSeconds || 0;
    result.videoCount += todayStats.videoCount || 0;
    result.shortsCount += todayStats.shortsCount || 0;
    result.sessionCount += todayStats.sessionCount || 0;
    result.productiveVideos += todayStats.productiveVideos || 0;
    result.unproductiveVideos += todayStats.unproductiveVideos || 0;
    result.neutralVideos += todayStats.neutralVideos || 0;
    result.searchCount += todayStats.searchCount || 0;
    result.recommendationClicks += todayStats.recommendationClicks || 0;
    result.autoplayCount += todayStats.autoplayCount || 0;
    result.autoplayCancelled += todayStats.autoplayCancelled || 0;
    result.thumbnailsHovered += todayStats.thumbnailsHovered || 0;
    result.thumbnailsClicked += todayStats.thumbnailsClicked || 0;
    result.tabSwitches += todayStats.tabSwitches || 0;
    result.pageReloads += todayStats.pageReloads || 0;
    result.backButtonPresses += todayStats.backButtonPresses || 0;
    result.bingeSessions += todayStats.bingeSessions || 0;
    result.preSleepMinutes += todayStats.preSleepMinutes || 0;
    result.totalScrollPixels += todayStats.totalScrollPixels || 0;
    // Copy today's hourly
    for (let h = 0; h <= currentHour; h++) {
      result.hourlySeconds[h.toString()] = todayStats.hourlySeconds?.[h.toString()] || 0;
    }
  }

  // Yesterday: add the portion from (currentHour+1)..23
  if (yesterdayStats) {
    // Calculate what fraction of yesterday's total time falls in our window
    let yesterdayWindowSeconds = 0;
    let yesterdayTotalHourlySeconds = 0;
    for (let h = 0; h < 24; h++) {
      const secs = yesterdayStats.hourlySeconds?.[h.toString()] || 0;
      yesterdayTotalHourlySeconds += secs;
      if (h > currentHour) {
        yesterdayWindowSeconds += secs;
        // Add to our hourly display (offset by 24 hours)
        result.hourlySeconds[h.toString()] = (result.hourlySeconds[h.toString()] || 0) + secs;
      }
    }

    // Scale yesterday's aggregate metrics by the fraction in our window
    const fraction = yesterdayTotalHourlySeconds > 0
      ? yesterdayWindowSeconds / yesterdayTotalHourlySeconds
      : 0;

    result.activeSeconds += Math.round((yesterdayStats.activeSeconds || 0) * fraction);
    result.totalSeconds += Math.round((yesterdayStats.totalSeconds || 0) * fraction);
    result.backgroundSeconds += Math.round((yesterdayStats.backgroundSeconds || 0) * fraction);
    result.videoCount += Math.round((yesterdayStats.videoCount || 0) * fraction);
    result.shortsCount += Math.round((yesterdayStats.shortsCount || 0) * fraction);
    result.sessionCount += Math.round((yesterdayStats.sessionCount || 0) * fraction);
    result.productiveVideos += Math.round((yesterdayStats.productiveVideos || 0) * fraction);
    result.unproductiveVideos += Math.round((yesterdayStats.unproductiveVideos || 0) * fraction);
    result.neutralVideos += Math.round((yesterdayStats.neutralVideos || 0) * fraction);
    result.searchCount += Math.round((yesterdayStats.searchCount || 0) * fraction);
    result.recommendationClicks += Math.round((yesterdayStats.recommendationClicks || 0) * fraction);
    result.autoplayCount += Math.round((yesterdayStats.autoplayCount || 0) * fraction);
    result.autoplayCancelled += Math.round((yesterdayStats.autoplayCancelled || 0) * fraction);
    result.thumbnailsHovered += Math.round((yesterdayStats.thumbnailsHovered || 0) * fraction);
    result.thumbnailsClicked += Math.round((yesterdayStats.thumbnailsClicked || 0) * fraction);
    result.tabSwitches += Math.round((yesterdayStats.tabSwitches || 0) * fraction);
    result.pageReloads += Math.round((yesterdayStats.pageReloads || 0) * fraction);
    result.backButtonPresses += Math.round((yesterdayStats.backButtonPresses || 0) * fraction);
    result.bingeSessions += Math.round((yesterdayStats.bingeSessions || 0) * fraction);
    result.preSleepMinutes += Math.round((yesterdayStats.preSleepMinutes || 0) * fraction);
    result.totalScrollPixels += Math.round((yesterdayStats.totalScrollPixels || 0) * fraction);
  }

  // Merge top channels from both days
  const channelMap = new Map<string, ChannelStat>();
  for (const stats of [todayStats, yesterdayStats]) {
    if (!stats?.topChannels) continue;
    for (const ch of stats.topChannels) {
      if (channelMap.has(ch.channel)) {
        const existing = channelMap.get(ch.channel)!;
        existing.minutes += ch.minutes;
        existing.videoCount += ch.videoCount;
      } else {
        channelMap.set(ch.channel, { ...ch });
      }
    }
  }
  result.topChannels = Array.from(channelMap.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  return result;
}
```

**Step 2: Commit**

```bash
git add packages/extension/src/background/stats.ts
git commit -m "feat: add getRolling24hStats() function"
```

---

### Task 3: Update `GET_STATS` handler to return rolling 24h stats

**Files:**
- Modify: `packages/extension/src/background/index.ts:21` (import)
- Modify: `packages/extension/src/background/index.ts:151-158` (handleGetStats)

**Step 1: Add import for getRolling24hStats**

In `packages/extension/src/background/index.ts`, update the stats import (line 21) to add `getRolling24hStats`:

```typescript
import { getEmptyDailyStats, updateDailyStats, calculateBaselineStats, getWeeklySummary, getRolling24hStats } from './stats';
```

**Step 2: Update handleGetStats to return rolling stats**

Replace the `handleGetStats` function (lines 151-158):

```typescript
async function handleGetStats(): Promise<{ today: any | null; currentSession: any | null }> {
  const rolling = await getRolling24hStats();
  return {
    today: rolling,
    currentSession: null,
  };
}
```

**Step 3: Commit**

```bash
git add packages/extension/src/background/index.ts
git commit -m "feat: GET_STATS returns rolling 24h stats"
```

---

### Task 4: Remove daily goal UI from Dashboard

**Files:**
- Modify: `packages/extension/src/options/Dashboard.tsx`

**Step 1: Update the hero card to remove "X left" / "+X over"**

In `Dashboard.tsx`, replace the first `HeroCard` (lines 692-708):

```tsx
          <HeroCard
            value={fmt(todayActiveMin)}
            label="Rolling 24h"
            sub={`${today?.sessionCount || 0} sessions`}
            color="text-ink"
            icon={
              <CompassRose
                score={Math.max(0, 100 - Math.round((driftV2 ? driftV2.composite : drift) * 100))}
                size={24}
                className="text-gold"
              />
            }
          />
```

**Step 2: Remove goalLine from 7-day VBars**

Find the 7-Day Usage Trend VBars (around line 881-887). Remove the `goalLine={goalMin}` prop:

```tsx
            <VBars
              data={weekMin}
              labels={weekLabels}
              height={120}
              activeIdx={6}
            />
```

**Step 3: Remove "Daily goal" metric from Level & Progress section**

Find the Level & Progress section metrics (around line 1239-1243). Remove the `<Metric label="Daily goal" .../>` line. Change it to show drift threshold instead:

Replace:
```tsx
              <Metric label="Daily goal" value={fmt(goalMin)} />
```
With:
```tsx
              <Metric label="Challenge tier" value={tier} />
```

Wait — there's already a `<Metric label="Challenge tier" value={tier} />` on line 1240. Just remove the daily goal line entirely. Also remove the `goalMode` metric:

Remove both lines:
```tsx
              <Metric label="Daily goal" value={fmt(goalMin)} />
              <Metric label="Goal mode" value={(settings.goalMode as string) || 'time_reduction'} />
```

**Step 4: Remove unused goalMin and overGoal variables**

Remove or update these lines (around 516, 524):
- Line 516: `const goalMin = ...` — keep but don't export/display
- Line 524: `const overGoal = ...` — remove entirely

Actually, `goalMin` is used in other places (VBars goalLine, overGoal). Since we removed those usages, we can remove `goalMin` and `overGoal` too:

Remove:
```typescript
  const goalMin = (settings.dailyGoalMinutes as number) || 60;
```
and:
```typescript
  const overGoal = todayActiveMin > goalMin;
```

**Step 5: Commit**

```bash
git add packages/extension/src/options/Dashboard.tsx
git commit -m "feat: remove daily goal UI from Dashboard, show rolling 24h"
```

---

### Task 5: Remove daily goal references from Widget

**Files:**
- Modify: `packages/extension/src/components/widget/Widget.tsx`

**Step 1: Remove dailyGoal from WidgetState and initial state**

In `Widget.tsx`, remove `dailyGoal: number;` from the WidgetState interface (line 85) and `dailyGoal: 60,` from the initial state (line 390).

**Step 2: Remove GET_SETTINGS dailyGoal fetch**

Remove the settings callback that sets dailyGoal (lines 450-454):

```typescript
    safeSendMessageWithCallback('GET_SETTINGS', undefined, (response: any) => {
      if (response && !response.error) {
        setState((p) => ({ ...p, dailyGoal: response.dailyGoalMinutes || 60 }));
      }
    });
```

**Step 3: Remove time warning nudge**

In the `checkNudges` callback (around lines 704-719), remove the "Time warning: over daily goal" block:

```typescript
    // Time warning: over daily goal
    if (state.todayMinutes > state.dailyGoal && !state.dismissedNudges.has('time_warning_today')) {
      const overBy = state.todayMinutes - state.dailyGoal;
      setState((p) => ({
        ...p,
        activeNudge: {
          id: 'time_warning_today',
          type: 'time_warning',
          message: `You're ${formatMinutes(overBy)} over your daily goal`,
          icon: 'AlertCircle',
          color: '#f87171',
          dismissible: true,
        },
      }));
      return;
    }
```

Also remove `state.dailyGoal` from the `checkNudges` dependency array (line 763).

**Step 4: Commit**

```bash
git add packages/extension/src/components/widget/Widget.tsx
git commit -m "feat: remove daily goal references from Widget"
```

---

### Task 6: Rewrite challenge system for drift-based streaks

**Files:**
- Modify: `packages/extension/src/background/challenge.ts`

**Step 1: Replace CHALLENGE_TIERS with drift thresholds**

Replace the entire `CHALLENGE_TIERS` record and `DAYS_TO_UPGRADE` (lines 9-18):

```typescript
export const CHALLENGE_TIERS: Record<ChallengeTier, { driftThreshold: number; xpMultiplier: number }> = {
  casual: { driftThreshold: 0.60, xpMultiplier: 1.0 },
  focused: { driftThreshold: 0.45, xpMultiplier: 1.5 },
  disciplined: { driftThreshold: 0.30, xpMultiplier: 2.0 },
  monk: { driftThreshold: 0.15, xpMultiplier: 3.0 },
  ascetic: { driftThreshold: 0.05, xpMultiplier: 5.0 },
};

export const TIER_ORDER: ChallengeTier[] = ['casual', 'focused', 'disciplined', 'monk', 'ascetic'];
export const DAYS_TO_UPGRADE = 5; // Consecutive days with avg drift under threshold
```

**Step 2: Rewrite getChallengeProgress to use avgDrift**

Replace the `getChallengeProgress` function (lines 22-76):

```typescript
export async function getChallengeProgress(): Promise<ChallengeProgress> {
  const data = await chrome.storage.local.get(['challengeProgress', 'settings', 'dailyStats', 'xp', 'driftHistory']);
  const settings = data.settings || {};
  const currentTier: ChallengeTier = (settings.challengeTier as ChallengeTier) || 'casual';
  const dailyStats = data.dailyStats || {};
  const driftHistory: Array<{ timestamp: number; drift: number }> = data.driftHistory || [];

  const progress: ChallengeProgress = data.challengeProgress || {
    currentTier,
    daysUnderGoal: 0,
    lastUnderGoalDate: null,
    totalXp: data.xp || 0,
    tierHistory: [{ tier: currentTier, date: new Date().toISOString().split('T')[0] }],
    eligibleForUpgrade: false,
  };

  const driftThreshold = CHALLENGE_TIERS[currentTier]?.driftThreshold ?? 0.60;

  // Calculate consecutive days where avgDrift was under threshold
  // For today: compute from live drift snapshots
  // For past days: use avgDrift stored in dailyStats
  let consecutiveDays = 0;

  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];

    if (i === 0) {
      // Today: compute average from drift snapshots
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const todaySnapshots = driftHistory.filter((s) => s.timestamp > oneDayAgo);
      if (todaySnapshots.length > 0) {
        const avgDrift = todaySnapshots.reduce((sum, s) => sum + s.drift, 0) / todaySnapshots.length;
        if (avgDrift <= driftThreshold) {
          consecutiveDays++;
        } else {
          break;
        }
      } else {
        // No snapshots today = no activity = under threshold
        consecutiveDays++;
      }
    } else {
      const dayStats = dailyStats[dateKey];
      if (dayStats) {
        const avgDrift = dayStats.avgDrift ?? 0;
        if (avgDrift <= driftThreshold) {
          consecutiveDays++;
        } else {
          break;
        }
      } else {
        // No data for this day = no activity = under threshold
        consecutiveDays++;
      }
    }
  }

  progress.daysUnderGoal = consecutiveDays;
  progress.lastUnderGoalDate = new Date().toISOString().split('T')[0];

  // Check eligibility for upgrade
  const currentTierIndex = TIER_ORDER.indexOf(currentTier);
  const canUpgrade = currentTierIndex < TIER_ORDER.length - 1;
  progress.eligibleForUpgrade = canUpgrade && consecutiveDays >= DAYS_TO_UPGRADE;

  await chrome.storage.local.set({ challengeProgress: progress });
  return progress;
}
```

**Step 3: Update upgradeTier to use driftThreshold instead of goalMinutes**

In `upgradeTier()` (around line 99), replace:
```typescript
  settings.dailyGoalMinutes = CHALLENGE_TIERS[newTier].goalMinutes;
```
With nothing — remove that line entirely. The tier upgrade no longer changes dailyGoalMinutes.

**Step 4: Update downgradeTier similarly**

In `downgradeTier()` (around line 135), remove:
```typescript
  settings.dailyGoalMinutes = CHALLENGE_TIERS[newTier].goalMinutes;
```

**Step 5: Update setChallengeTier**

In `setChallengeTier()` (around line 197), remove:
```typescript
  storage.settings.dailyGoalMinutes = CHALLENGE_TIERS[tier].goalMinutes;
```

**Step 6: Update notification message**

In `checkDailyChallenge()` (around line 176), change:
```typescript
      message: `You've been under goal for ${progress.daysUnderGoal} days! Ready to level up?`,
```
To:
```typescript
      message: `${progress.daysUnderGoal} days of calm seas! Ready to level up?`,
```

**Step 7: Commit**

```bash
git add packages/extension/src/background/challenge.ts
git commit -m "feat: rewrite challenge system for drift-based tier streaks"
```

---

### Task 7: Compute and store daily avgDrift at end of day

**Files:**
- Modify: `packages/extension/src/background/drift.ts`

**Step 1: Add daily avgDrift computation to drift snapshot recording**

In `drift.ts`, update the `recordDriftSnapshot` function (lines 115-142). After saving snapshots, also update today's avgDrift in dailyStats:

Replace the `recordDriftSnapshot` function:

```typescript
async function recordDriftSnapshot(drift: number, level: SeaState): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stats = await chrome.storage.local.get('dailyStats');
  const today = new Date().toISOString().split('T')[0];
  const todayStats = stats.dailyStats?.[today];

  const legacyLevel: 'low' | 'medium' | 'high' | 'critical' =
    level === 'calm' ? 'low'
    : level === 'choppy' ? 'medium'
    : level === 'rough' ? 'high'
    : 'critical';

  const snapshot: DriftSnapshot = {
    timestamp: Date.now(),
    drift,
    level: legacyLevel,
    videosThisHour: todayStats?.videoCount || 0,
    productiveThisHour: todayStats?.productiveVideos || 0,
  };

  driftSnapshots.push(snapshot);
  driftSnapshots = driftSnapshots.filter((s) => s.timestamp > cutoff);
  if (driftSnapshots.length > 48) {
    driftSnapshots = driftSnapshots.slice(-48);
  }
  await chrome.storage.local.set({ driftHistory: driftSnapshots });

  // Update today's avgDrift in dailyStats
  if (stats.dailyStats?.[today]) {
    const todayStart = new Date(today + 'T00:00:00').getTime();
    const todaySnapshots = driftSnapshots.filter((s) => s.timestamp >= todayStart);
    if (todaySnapshots.length > 0) {
      stats.dailyStats[today].avgDrift =
        todaySnapshots.reduce((sum, s) => sum + s.drift, 0) / todaySnapshots.length;
      await chrome.storage.local.set({ dailyStats: stats.dailyStats });
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/extension/src/background/drift.ts
git commit -m "feat: compute daily avgDrift from snapshots"
```

---

### Task 8: Add drift recalculation after backend restore

**Files:**
- Modify: `packages/extension/src/background/drift.ts`
- Modify: `packages/extension/src/background/sync.ts`

**Step 1: Add recalculateDriftFromHistory function to drift.ts**

Add this exported function at the end of drift.ts (before `stopDriftCalculation`):

```typescript
// ===== Drift Recalculation from Restored Data =====

export async function recalculateDriftFromHistory(
  videoSessions: Array<{ timestamp: number; watchedSeconds: number; productivityRating?: -1 | 0 | 1 | null }>,
): Promise<void> {
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // Only replay last 24h
  const cutoff = now - windowMs;

  // Reset drift state
  driftV2 = emptyDriftStateV2();

  // Replay time pressure samples from video sessions
  const recentSessions = videoSessions.filter((s) => s.timestamp > cutoff);
  for (const session of recentSessions) {
    // Each minute of watching = 1 sample weight, same as live tracking
    const minutes = session.watchedSeconds / 60;
    driftV2.axes.timePressure.samples.push({
      timestamp: session.timestamp,
      weight: minutes,
    });
  }

  // Replay content quality samples from rated sessions
  const RATING_WEIGHTS: Record<number, number> = {
    1: -0.25,  // productive
    0: 0.05,   // neutral
    '-1': 0.35, // unproductive
  };
  for (const session of recentSessions) {
    if (session.productivityRating != null) {
      const weight = RATING_WEIGHTS[session.productivityRating] ?? 0;
      driftV2.axes.contentQuality.samples.push({
        timestamp: session.timestamp,
        weight,
      });
    }
  }

  // Recalculate composite
  await calculateDriftV2();
  console.log('[YT Detox] Drift recalculated from restored data, composite:', driftV2.composite.toFixed(2));
}
```

**Step 2: Import and call from sync.ts restoreFromBackend**

In `packages/extension/src/background/sync.ts`, add import at top:

```typescript
import { recalculateDriftFromHistory } from './drift';
```

Then in `restoreFromBackend`, after the `saveStorage` call (around line 254), add:

```typescript
    // Recalculate drift state from restored video sessions
    await recalculateDriftFromHistory(mergedVideoSessions);
```

**Step 3: Commit**

```bash
git add packages/extension/src/background/drift.ts packages/extension/src/background/sync.ts
git commit -m "feat: recalculate drift from restored sessions after reinstall"
```

---

### Task 9: Update Widget 24h chart to use rolling window

**Files:**
- Modify: `packages/extension/src/components/widget/Widget.tsx`

**Step 1: Update the 24h chart data fetching**

In Widget.tsx, the `update24h` effect (lines 606-619) currently reads only today's hourly data. Update it to merge today + yesterday:

Replace the `update24h` effect:

```typescript
  // Update 24h chart every 60 seconds
  useEffect(() => {
    const update24h = () => {
      if (!chrome.storage?.local) return;
      chrome.storage.local.get(['dailyStats'], (result) => {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().split('T')[0];

        const todayHourly = result.dailyStats?.[today]?.hourlySeconds;
        const yesterdayHourly = result.dailyStats?.[yesterdayKey]?.hourlySeconds;
        const liveHourly = getTemporalData().hourlySeconds;

        // Merge: yesterday's hours after current hour + today's hours + live data
        const currentHour = now.getHours();
        const merged: Record<string, number> = {};
        // Yesterday: hours (currentHour+1)..23
        if (yesterdayHourly) {
          for (let h = currentHour + 1; h < 24; h++) {
            merged[h.toString()] = (merged[h.toString()] || 0) + (yesterdayHourly[h.toString()] || 0);
          }
        }
        // Today: hours 0..currentHour
        if (todayHourly) {
          for (let h = 0; h <= currentHour; h++) {
            merged[h.toString()] = (merged[h.toString()] || 0) + (todayHourly[h.toString()] || 0);
          }
        }

        setState((p) => ({ ...p, hourlyData: compute24hData(merged, liveHourly) }));
      });
    };
    update24h();
    const interval = setInterval(update24h, 60000);
    return () => clearInterval(interval);
  }, []);
```

**Step 2: Also update initial load in the main useEffect**

In the initial storage load effect (around lines 462-480), update the hourly data computation similarly:

Replace:
```typescript
        const today = new Date().toISOString().split('T')[0];
        const storedHourly = result.dailyStats?.[today]?.hourlySeconds;
        const liveHourly = getTemporalData().hourlySeconds;
```

With:
```typescript
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const yesterdayDate = new Date(now);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayKey = yesterdayDate.toISOString().split('T')[0];
        const currentHour = now.getHours();

        // Merge yesterday's trailing hours + today's hours for rolling 24h
        const rollingHourly: Record<string, number> = {};
        const yesterdayHourly = result.dailyStats?.[yesterdayKey]?.hourlySeconds;
        const todayHourly = result.dailyStats?.[today]?.hourlySeconds;
        if (yesterdayHourly) {
          for (let h = currentHour + 1; h < 24; h++) {
            rollingHourly[h.toString()] = yesterdayHourly[h.toString()] || 0;
          }
        }
        if (todayHourly) {
          for (let h = 0; h <= currentHour; h++) {
            rollingHourly[h.toString()] = todayHourly[h.toString()] || 0;
          }
        }
        const liveHourly = getTemporalData().hourlySeconds;
```

And update the setState to use `rollingHourly` instead of `storedHourly`:
```typescript
          hourlyData: compute24hData(rollingHourly, liveHourly),
```

**Step 3: Commit**

```bash
git add packages/extension/src/components/widget/Widget.tsx
git commit -m "feat: Widget 24h chart uses rolling window"
```

---

### Task 10: Update Dashboard "Today" sections to use rolling 24h label

**Files:**
- Modify: `packages/extension/src/options/Dashboard.tsx`

**Step 1: Update section headers that say "Today"**

Find and replace section labels referencing "today" to "24h":
- Line 856: `"24-Hour Activity (minutes per hour)"` — already correct
- Line 932: `"Top Channels (Today)"` → `"Top Channels (24h)"`
- Line 950: `"Content Sources (Today)"` → `"Content Sources (24h)"`

**Step 2: Update the "today" variable assignment to use rolling stats**

The Dashboard currently reads `dailyStats[tk]` for today. Since `GET_STATS` now returns rolling 24h data, we should also fetch it for the Dashboard.

Actually, the Dashboard reads directly from `chrome.storage.local.get(null)` and uses `dailyStats[todayKey()]`. We need to either:
- Also compute rolling stats client-side in the Dashboard, OR
- Make Dashboard use the `GET_STATS` message

The simplest approach: compute the rolling merge client-side in the Dashboard's `fetchAll`.

In Dashboard.tsx, update the `fetchAll` callback. After the live session merge (around lines 443-453), also merge in yesterday's trailing hours:

Replace:
```typescript
      const stats = data.dailyStats ? { ...data.dailyStats } : {};
      // Merge live session into today's stats for display
      const tk = new Date().toISOString().split('T')[0];
      const merged = mergeLiveStats(stats[tk], {
        liveSession: data.liveSession,
        liveTemporal: data.liveTemporal,
        liveSessionUpdatedAt: data.liveSessionUpdatedAt,
      });
      if (merged) stats[tk] = merged;
      setDailyStats(stats);
```

With:
```typescript
      const stats = data.dailyStats ? { ...data.dailyStats } : {};
      const tk = new Date().toISOString().split('T')[0];
      // Merge live session into today's stats for display
      const merged = mergeLiveStats(stats[tk], {
        liveSession: data.liveSession,
        liveTemporal: data.liveTemporal,
        liveSessionUpdatedAt: data.liveSessionUpdatedAt,
      });
      if (merged) stats[tk] = merged;
      setDailyStats(stats);
```

This keeps the calendar-day storage as-is. The rolling 24h view is handled by:
- The hero card now shows rolling label
- GET_STATS returns rolling data for Widget
- Dashboard sections labeled "24h" remind users it's rolling

The Dashboard's individual metric cards still show calendar-day data for simplicity, with "24h" label on the hero card to indicate the primary reference. The important thing is the Widget shows rolling stats and there's no "time left" anywhere.

**Step 3: Commit**

```bash
git add packages/extension/src/options/Dashboard.tsx
git commit -m "feat: update Dashboard labels from 'Today' to '24h'"
```

---

### Task 11: Update tier upgrade prompt text in Widget

**Files:**
- Modify: `packages/extension/src/components/widget/Widget.tsx`

**Step 1: Update the tier upgrade prompt message**

In Widget.tsx, the upgrade prompt (around line 1367-1368) says "days under goal". Update to:

Replace:
```tsx
                  <div style={{ fontSize: '11px', color: 'rgba(44,24,16,0.6)' }}>
                    {state.challengeProgress.daysUnderGoal} days under goal — ready to advance to{' '}
```

With:
```tsx
                  <div style={{ fontSize: '11px', color: 'rgba(44,24,16,0.6)' }}>
                    {state.challengeProgress.daysUnderGoal} days of calm seas — ready to advance to{' '}
```

**Step 2: Commit**

```bash
git add packages/extension/src/components/widget/Widget.tsx
git commit -m "feat: update tier upgrade text to drift-based language"
```

---

### Task 12: Build and verify

**Step 1: Run typecheck**

```bash
cd /Users/marisancans/src/youtube-tracker && pnpm typecheck
```

Expected: No type errors.

**Step 2: Run lint**

```bash
pnpm lint:fix
```

Expected: Clean or auto-fixable issues only.

**Step 3: Build extension**

```bash
pnpm build:ext
```

Expected: Successful build.

**Step 4: Fix any issues found**

If typecheck or build fails, fix the issues and re-run.

**Step 5: Final commit if lint/format changes**

```bash
git add -A && git commit -m "chore: lint and format fixes"
```
