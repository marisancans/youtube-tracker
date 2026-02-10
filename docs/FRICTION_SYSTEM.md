# Drift System 🌊

> Progressive friction for mindful YouTube consumption

## Philosophy

**Not cold turkey.** The goal is gradual behavioral change through increasing friction that makes mindless consumption harder while preserving intentional use (music, learning, etc.).

The system uses **Drift (0.0 → 1.0)** — a measure of how far you've drifted from your intentions. The more you drift into unproductive watching, the more friction you experience.

**Key principle:** The platform remains usable, but becomes progressively less engaging as you drift from your goals.

---

## Drift Calculation

### Formula

```typescript
// Base drift from time spent (60% of total weight)
baseDrift = (todayMinutes / goalMinutes) * 0.6

// Behavioral modifiers
modifiers = {
  unproductiveRatio:    (unproductive / totalRated) * 0.30,  // +30% max
  recommendationRatio:  (recClicks / totalVideos) * 0.20,    // +20% max
  bingeBonus:           sessionMinutes > 60 ? 0.20 : 
                        sessionMinutes > 30 ? 0.10 : 0,      // +20% max
  lateNightBonus:       (hour >= 23 || hour < 6) ? 0.15 : 0, // +15%
  productiveDiscount:   -(productive / totalRated) * 0.20,   // -20% max
  breakDiscount:        tookBreak ? -0.10 : 0,               // -10%
}

// Mode multipliers
modeMultiplier = {
  music: 0.8,         // 20% less drift (music exempt)
  time_reduction: 1.0, // Default
  strict: 1.5,        // 50% more drift
  cold_turkey: N/A,   // Binary block, no drift
}

// Final calculation
drift = clamp(baseDrift + sum(modifiers)) * modeMultiplier
drift = clamp(drift, 0, 1)
```

### What Increases Drift ⬆️

| Factor | Max Impact | Trigger |
|--------|-----------|---------|
| Time spent | +60% | Every minute toward goal |
| Unproductive ratings | +30% | Rating videos as "wasted" |
| Recommendation clicks | +20% | Clicking suggested videos |
| Binge session | +20% | Watching >60 min continuously |
| Late night | +15% | Using between 11pm-6am |

### What Decreases Drift ⬇️

| Factor | Max Impact | Trigger |
|--------|-----------|---------|
| Productive ratings | -20% | Rating videos as "productive" |
| Taking breaks | -10% | 5+ minute break from YouTube |
| Music mode | -20% | Music content exempt |
| Under goal streak | -10% | Starting bonus after good days |

---

## Drift Levels

| Level | Range | Color | Description |
|-------|-------|-------|-------------|
| **Low** | 0.0 - 0.3 | 🟢 Green | Focused, minimal friction |
| **Medium** | 0.3 - 0.5 | 🟡 Yellow | Starting to drift |
| **High** | 0.5 - 0.7 | 🟠 Orange | Drifting from goals |
| **Critical** | 0.7 - 1.0 | 🔴 Red | Maximum friction active |

---

## Visual Effects by Drift Level

### Thumbnails

| Drift | Blur | Grayscale | Other |
|-------|------|-----------|-------|
| 0.0-0.3 | 0px | 0% | Normal |
| 0.3-0.5 | 0px | 20% | Slight desaturation |
| 0.5-0.7 | 2px (hover) | 30% | Blur on hover |
| 0.7-0.9 | 4px | 60% | Always blurred, title on hover |
| 0.9-1.0 | N/A | 100% | **Text only** — no images |

### Sidebar Recommendations

| Drift | Effect |
|-------|--------|
| 0.0-0.3 | Normal (20 items) |
| 0.3-0.5 | Reduced (5 items) |
| 0.5-0.7 | Titles only, blurred thumbnails |
| 0.7-0.9 | Collapsed, button to expand |
| 0.9-1.0 | **Hidden entirely** |

### Comments Section

| Drift | Effect |
|-------|--------|
| 0.0-0.3 | Normal |
| 0.3-0.5 | 90% font size |
| 0.5-0.7 | 80% font, collapsed by default |
| 0.7-0.9 | Blurred, click to reveal |
| 0.9-1.0 | **Hidden** with message |

### Homepage Feed

| Drift | Effect |
|-------|--------|
| 0.0-0.4 | Normal |
| 0.4-0.6 | Search bar prominent, feed below |
| 0.6-0.8 | Feed blurred, "What are you looking for?" |
| 0.8-1.0 | **Feed hidden**, search only |

### Autoplay

| Drift | Countdown | Behavior |
|-------|-----------|----------|
| 0.0-0.3 | 5s | Normal |
| 0.3-0.5 | 15s | Extended |
| 0.5-0.7 | 30s | Long delay, prominent cancel |
| 0.7-1.0 | ∞ | **Disabled** |

### Video Player

| Drift | Effect |
|-------|--------|
| 0.0-0.4 | Normal |
| 0.4-0.6 | Subtle vignette overlay |
| 0.6-0.8 | 90% size, centered |
| 0.8-1.0 | 80% size, grayscale border, "Still watching?" |

---

## Goal Modes

### 🎵 Music Mode
- Music channels/videos **exempt from drift**
- Only non-music content increases drift
- Detection via: channel category, "[Official Audio]", "lyrics", "music", playlist type

**Best for:** People who use YouTube primarily for music

### ⏱️ Time Reduction Mode *(Default)*
- All content contributes to drift equally
- Focus on staying within daily time goal
- Balanced approach for general reduction

**Best for:** Most users wanting to cut down overall

### 🔒 Strict Mode
- Drift increases **1.5x faster**
- No exemptions for any content
- Maximum friction kicks in at 0.7 instead of 1.0

**Best for:** Users who need aggressive intervention

### 🧊 Cold Turkey Mode
- No progressive friction
- Simple hard block after daily limit
- "You've used your X minutes today"
- Optional override (adds extra friction tomorrow)

**Best for:** Users who prefer binary limits

---

## Challenge Tiers & XP System

Progressive difficulty with rewards:

| Tier | Icon | Goal | XP Multiplier | Unlock |
|------|------|------|---------------|--------|
| **Casual** | 🌱 | 60 min | 1.0x | Default |
| **Focused** | 🎯 | 45 min | 1.5x | 5 days under goal |
| **Disciplined** | ⚡ | 30 min | 2.0x | 7 days at Focused |
| **Monk** | 🔥 | 15 min | 3.0x | 7 days at Disciplined |
| **Ascetic** | 💎 | 5 min | 5.0x | 7 days at Monk |

### XP Awards

| Action | Base XP | With Multiplier |
|--------|---------|-----------------|
| Rate video productive | +15 | +15 × tier |
| Rate video neutral | +5 | +5 × tier |
| Rate video unproductive | +2 | +2 × tier |
| Stay under daily goal | +50 | +50 × tier |
| Complete a week under goal | +200 | +200 × tier |
| Accept tier upgrade | +100 | One-time |

### Challenge Prompts

After consistent success, prompt the user:

```
┌─────────────────────────────────────────┐
│ 🏆 You've crushed your goal 5 days!    │
├─────────────────────────────────────────┤
│                                         │
│ Ready to level up?                      │
│                                         │
│ Current: 🌱 Casual (60 min, 1.0x XP)   │
│ New:     🎯 Focused (45 min, 1.5x XP)  │
│                                         │
│ Harder challenge = bigger rewards       │
│                                         │
│ [Stay at Casual]  [Accept Challenge →]  │
└─────────────────────────────────────────┘
```

---

## Drift Decay & Reset

### Daily Reset
- Drift resets to **0** at midnight (or configured wake time)
- Fresh start every day

### Break Bonus
- Taking a 5+ minute break from YouTube
- Reduces current drift by **0.1** (10%)
- Max 2 breaks count per day

### Good Behavior Streak
- 3+ consecutive days under goal
- Next day starts at **-0.1** drift (head start)

---

## UI Components

### Widget Drift Meter

```
┌─────────────────────────────────────────┐
│ 🌊 Drift                          42%  │
│ ████████████░░░░░░░░░░░░░░░░          │
│        Starting to drift... 🌊         │
└─────────────────────────────────────────┘

Colors:
- 0-30%:  Green  (🟢 Focused)
- 30-50%: Yellow (🟡 Drifting)  
- 50-70%: Orange (🟠 High drift)
- 70-100%: Red   (🔴 Critical)
```

### Dashboard Drift Chart

```
Today's Drift
     ▲
1.0 ─┤          ╭──────  ← Lunch binge
     │         ╱
0.5 ─┤    ╭───╯
     │   ╱
0.0 ─┼──╯
     └────────────────────────▶
      9am   12pm   3pm   6pm

Weekly Average: 0.38
vs Last Week:   ↓12% (improving!)
```

### Settings UI

```
┌─────────────────────────────────────────┐
│ 🎚️ Drift Settings                      │
├─────────────────────────────────────────┤
│                                         │
│ Goal Mode:                              │
│ ○ 🎵 Music - Only count non-music      │
│ ● ⏱️ Time Reduction - Reduce overall   │
│ ○ 🔒 Strict - Aggressive friction      │
│ ○ 🧊 Cold Turkey - Hard block          │
│                                         │
│ Challenge Tier: 🌱 Casual              │
│ Daily Goal: 60 minutes                  │
│ XP Multiplier: 1.0x                     │
│                                         │
│ ─────────────────────────────────────── │
│                                         │
│ Friction Effects:                       │
│ ☑️ Blur thumbnails                      │
│ ☑️ Simplify recommendations             │
│ ☑️ Reduce comments                      │
│ ☐ Shrink video player                   │
│ ☑️ Disable autoplay (at high drift)    │
│                                         │
│ ─────────────────────────────────────── │
│                                         │
│ Whitelisted Channels:                   │
│ [+ Add channel]                         │
│ • Lofi Girl                             │
│ • 3Blue1Brown                           │
│                                         │
└─────────────────────────────────────────┘
```

---

## Onboarding Flow

### Step 1: Welcome
```
Welcome to YouTube Detox! 🧘

This isn't about blocking YouTube completely.
It's about building healthier habits gradually.

[Get Started →]
```

### Step 2: Goal Survey
```
What's your goal?

○ 🎵 "I use YouTube for music, want to reduce other content"
○ ⏱️ "I want to spend less time overall"
○ 🔒 "I need strong limits, I struggle with self-control"
○ 🧊 "Just block me after my daily limit"

[Continue →]
```

### Step 3: Daily Goal
```
How much YouTube per day feels healthy to you?

◀ [────●────────] ▶
        45 min

(You can always change this later)

[Start My Journey →]
```

### Step 4: First Week
```
📊 Observation Week

For the first 7 days, we'll just observe your habits.
No friction yet — just tracking to understand your baseline.

After that, we'll start applying gentle friction
based on what we learn.

[Sounds Good →]
```

---

## Implementation Roadmap

### Phase 1: Core Drift ✅
- [x] Drift calculation in background
- [x] Drift state management
- [x] Drift meter in widget
- [x] Message handlers (GET_DRIFT, SET_CHALLENGE_TIER, etc.)

### Phase 2: Drift Chart & History
- [ ] Hourly drift snapshots
- [ ] Daily drift line chart in Dashboard
- [ ] Weekly comparison view
- [ ] Drift trend indicators

### Phase 3: CSS Friction Effects
- [ ] Inject drift-based CSS into YouTube pages
- [ ] Thumbnail blur/grayscale
- [ ] Sidebar manipulation
- [ ] Comment section effects
- [ ] Autoplay control

### Phase 4: Settings UI
- [ ] Goal mode selector (Music/Time/Strict/Cold Turkey)
- [ ] Challenge tier display
- [ ] Friction toggles (enable/disable specific effects)
- [ ] Channel whitelist management

### Phase 5: Challenge System
- [ ] Tier progression logic
- [ ] Challenge prompts after success streaks
- [ ] XP multiplier application
- [ ] Tier upgrade/downgrade

### Phase 6: Music Detection
- [ ] Channel category detection
- [ ] Title/description keyword matching
- [ ] Music playlist detection
- [ ] User-confirmed music channels

### Phase 7: Onboarding
- [ ] Welcome flow
- [ ] Goal survey
- [ ] Initial settings configuration
- [ ] Observation week explanation

### Phase 8: Polish
- [ ] Animations and transitions
- [ ] Accessibility improvements
- [ ] Performance optimization
- [ ] Error handling

---

## Technical Architecture

### State Flow

```
┌──────────────────┐
│  Background SW   │
│                  │
│  ┌────────────┐  │
│  │ Drift Calc │◄─┼─── Daily stats, video sessions
│  └─────┬──────┘  │
│        │         │
│        ▼         │
│  ┌────────────┐  │
│  │ Drift State│──┼──► chrome.storage.local
│  └─────┬──────┘  │
│        │         │
└────────┼─────────┘
         │ GET_DRIFT
         ▼
┌──────────────────┐     ┌──────────────────┐
│  Content Script  │     │     Widget       │
│                  │     │                  │
│  Apply CSS based │     │  Show drift meter│
│  on drift level  │     │  and effects     │
└──────────────────┘     └──────────────────┘
```

### Storage Schema

```typescript
interface DriftStorage {
  driftState: {
    current: number;           // 0.0 - 1.0
    history: Array<{
      timestamp: number;
      value: number;
    }>;
    lastCalculated: number;
  };
  
  settings: {
    goalMode: 'music' | 'time_reduction' | 'strict' | 'cold_turkey';
    challengeTier: 'casual' | 'focused' | 'disciplined' | 'monk' | 'ascetic';
    dailyGoalMinutes: number;
    frictionEnabled: {
      thumbnails: boolean;
      sidebar: boolean;
      comments: boolean;
      player: boolean;
      autoplay: boolean;
    };
    whitelistedChannels: string[];
  };
}
```

### CSS Injection

```typescript
// Content script applies styles based on drift
function applyDriftStyles(drift: number, effects: DriftEffects) {
  const style = document.createElement('style');
  style.id = 'yt-detox-drift-styles';
  
  style.textContent = `
    /* Thumbnail effects */
    ytd-thumbnail img {
      filter: blur(${effects.thumbnailBlur}px) 
              grayscale(${effects.thumbnailGrayscale}%);
      transition: filter 0.3s ease;
    }
    
    /* Sidebar effects */
    #secondary {
      opacity: ${1 - effects.sidebarReduction / 100};
    }
    
    /* Comments effects */
    #comments {
      font-size: ${100 - effects.commentsReduction}%;
    }
    
    /* Text-only mode */
    ${effects.showTextOnly ? `
      ytd-thumbnail img { display: none !important; }
      ytd-thumbnail { background: #1a1a1a; }
    ` : ''}
  `;
  
  document.head.appendChild(style);
}
```

---

## Success Metrics

### User Behavior
- Average daily YouTube time (target: ↓20% over 30 days)
- Recommendation click rate (target: ↓30%)
- Search/subscription ratio (target: ↑50%)
- Videos rated (engagement metric)

### System Health
- Drift accuracy (does it reflect actual behavior?)
- Friction effectiveness (does higher drift = less usage?)
- Challenge tier progression rate
- User retention (keep extension installed)

### User Satisfaction
- Weekly survey: "Was this week's friction helpful?"
- NPS score
- Feature request themes

---

## Open Questions

1. **Override mechanism**: Should users be able to "snooze" friction for 30 min? What's the cost?

2. **Shorts**: Same drift rules or separate system? Shorts are highly addictive.

3. **Live streams**: Exempt from time-based drift? Different rules?

4. **Multi-device**: If user has multiple browsers, sync drift state?

5. **Social proof**: Show "Users at your tier save X hours/week on average"?

6. **Regression handling**: If user increases goal after failing, is that okay or should we discourage?

---

*Last updated: 2024-02-10*
*Version: 1.0*
