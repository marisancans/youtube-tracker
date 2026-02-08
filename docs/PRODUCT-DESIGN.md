# YouTube Detox Extension - Product Design

## Core Philosophy

**"Wean, don't ban"** — Gradual reduction through awareness and friction, not blocking.

## Target User

People who:
- Recognize they waste too much time on YouTube
- Have tried and failed with cold-turkey approaches
- Want to maintain some YouTube use (educational, specific creators)
- Are willing to invest 6-8 weeks in behavior change

## Product Phases

### Phase 1: Observation (Week 1-2)
**Goal:** Understand patterns without intervention

Features:
- Track all YouTube activity passively
  - Video titles, channels, categories
  - Watch duration, time of day
  - How video was reached (search, recommendation, direct)
- Store data locally (privacy-first)
- Occasional non-intrusive "productivity check" popup
  - "Was this video productive? 👍 👎"
  - Random timing (variable interval)
- End of week summary
  - Total time watched
  - Top channels/categories
  - Peak usage hours

### Phase 2: Awareness (Week 3-4)
**Goal:** Make unconscious behavior conscious

Features:
- Real-time watch timer visible on page
- Session duration warning at configurable intervals
- "Intention prompt" before video plays
  - "What are you looking for?" (text input)
  - Compares intention vs. actual behavior
- Highlight "productivity rating" on videos based on past ratings
- Daily/weekly comparisons ("You watched 2 hours less than last week")

### Phase 3: Friction (Week 5-6)
**Goal:** Create small barriers to mindless consumption

Features (gradually introduced):
- Delay autoplay by 5-10 seconds
- Remove/blur sidebar recommendations
- Hide "Up Next" section
- Require confirmation for videos from new channels
- "Are you sure?" prompt after watching 3+ videos in a row
- Grayscale option for thumbnails
- Hide view counts (reduces social proof trigger)

### Phase 4: Replacement (Week 7-8)
**Goal:** Substitute with healthier alternatives

Features:
- Integration with todo list / Anki / productive sites
- "Before you watch, you have 3 todos pending" prompt
- Suggest taking a break after extended sessions
- Optional: redirect to alternative (podcast, audiobook)
- Reward system for reduced usage
- Weekly progress celebration

## UI Interventions Toolkit

### Subtle Interventions (low friction)
- Grayscale thumbnails
- Hide subscriber counts
- Hide view counts
- Remove trending section
- Collapse comments by default

### Medium Interventions
- Blur recommendations until hover
- Add 3-second delay before recommendations appear
- Change video titles to be less clickbaity (AI rewrite)
- Show "time watched today" badge
- Productivity rating overlay on thumbnails

### Strong Interventions
- Block recommendations entirely
- Require search to find videos
- Daily time quota with soft/hard limits
- Mandatory break after X minutes
- Hide homepage entirely (search only)

## Data Model

```typescript
interface WatchSession {
  videoId: string;
  title: string;
  channel: string;
  channelId: string;
  category?: string;
  startTime: Date;
  endTime?: Date;
  duration: number;  // seconds
  source: 'search' | 'recommendation' | 'subscription' | 'direct' | 'autoplay';
  productivityRating?: -1 | 0 | 1;  // user-rated
  wasIntentional?: boolean;
  intention?: string;  // what user said they were looking for
}

interface DailyStats {
  date: string;
  totalWatchTime: number;
  sessionCount: number;
  uniqueChannels: number;
  productiveTime: number;  // based on ratings
  wastedTime: number;
  topChannels: { channel: string; time: number }[];
  peakHours: number[];
}

interface UserSettings {
  currentPhase: 1 | 2 | 3 | 4;
  phaseStartDate: Date;
  interventionsEnabled: string[];
  dailyGoal?: number;  // minutes
  productiveChannels: string[];  // whitelist
  blockedChannels: string[];
  reminderInterval: number;
}
```

## Key Screens

### 1. Dashboard (Popup)
- Today's watch time vs goal
- This week's trend
- Quick toggle interventions
- Link to full stats page

### 2. Full Statistics Page
- Charts: daily/weekly/monthly trends
- Channel breakdown
- Time of day heatmap
- Productivity score over time
- Progress through phases

### 3. Productivity Prompt (Overlay)
- Appears randomly during videos
- "Is this video helping you?"
- Single click response
- Non-blocking (can ignore)

### 4. Intention Prompt (Overlay)
- Appears before video plays (Phase 2+)
- "What are you looking for?"
- Free text input
- Skip option available

### 5. Settings Page
- Intervention toggles
- Whitelist management
- Phase override
- Data export/import
- Privacy controls

## Success Metrics

For the user:
- Reduced total watch time
- Increased % of intentional viewing
- Higher average productivity rating
- More consistent daily patterns
- Successful completion of 8-week program

## Privacy Principles

1. **All data stays local** - No server, no tracking
2. **User owns their data** - Export anytime
3. **No external calls** - Works offline
4. **Open source** - Code is auditable
5. **No accounts** - Anonymous by default

## Differentiation from Existing Tools

| Feature | Blockers | Our Approach |
|---------|----------|--------------|
| Philosophy | Block access | Change relationship |
| Timeline | Immediate | 6-8 week journey |
| User feeling | Restricted | Empowered |
| Relapse rate | High | Lower (habit change) |
| Learning | None | ML on user patterns |
| Personalization | One-size-fits-all | Adapts to you |

## MVP Scope (v0.1)

1. Basic tracking (titles, channels, duration)
2. Simple productivity prompt
3. Watch time display
4. Daily/weekly stats popup
5. Single intervention: hide recommendations
