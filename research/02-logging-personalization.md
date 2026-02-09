# Logging Strategy & Personalization Plan

## What To Log

### 1. **Session-Level Metrics** (Core)

| Metric | What | Why |
|--------|------|-----|
| `session_start` | Timestamp when YouTube tab becomes active | Track session frequency, time-of-day patterns |
| `session_end` | Tab closes/switches away | Calculate session duration |
| `entry_point` | How they arrived (direct, search, link, notification) | Intentional vs. reactive usage |
| `exit_trigger` | What ended session (user choice, reminder, external) | Measure self-regulation |

### 2. **Video-Level Tracking**

| Metric | What | Why |
|--------|------|-----|
| `video_id` | YouTube video ID | Deduplicate, link to metadata |
| `video_title` | Scraped from DOM | Content categorization |
| `video_duration` | Total length | Short-form vs. long-form habits |
| `watch_duration` | How long actually watched | Completion rate, engagement depth |
| `watch_percentage` | watch_duration / video_duration | Did they bail early? |
| `source` | homepage / search / recommendation / subscription / history | Algorithm-driven vs. intentional |
| `category` | Inferred from title/channel (entertainment, education, music, news) | Content diet analysis |

### 3. **Behavioral Signals**

| Signal | What | Why |
|--------|------|-----|
| `autoplay_count` | Videos started via autoplay | Measure passive consumption |
| `search_queries` | What they search for | Intentional vs. rabbit hole |
| `recommendation_clicks` | Clicked sidebar/homepage recommendations | Algorithm susceptibility |
| `scroll_depth` | How far down homepage scrolled | Endless scroll detection |
| `shorts_views` | Number of Shorts watched | High-dopamine short-form addiction |
| `pause_resume_count` | How often paused | Active vs. passive viewing |
| `tab_switches` | Focus lost/regained | Distracted viewing |
| `playback_speed` | 1x, 1.5x, 2x | Educational vs. entertainment consumption |

### 4. **Temporal Patterns**

| Pattern | What | Why |
|--------|------|-----|
| `time_of_day` | Morning/afternoon/evening/night | Identify vulnerable hours |
| `day_of_week` | Weekday vs. weekend | Context-aware limits |
| `first_check_time` | When do they first open YouTube daily | Morning dopamine check? |
| `pre_sleep_usage` | Usage within 2h of typical bedtime | Sleep hygiene |
| `binge_sessions` | Sessions > 1 hour | Identify problematic patterns |
| `inter_session_gap` | Time between sessions | Compulsive checking frequency |

### 5. **Emotional/Contextual Signals** (Optional Self-Report)

| Signal | Collection Method | Why |
|--------|-------------------|-----|
| `pre_mood` | Quick prompt on session start | Emotional triggers |
| `post_mood` | Prompt on session end | Does YouTube improve/worsen mood? |
| `intention` | "What brought you here?" prompt | Track intention vs. reality |
| `satisfaction` | "Was this time well spent?" | Regret metric |

---

## How To Extract From YouTube

### Accessible via Content Script (DOM Scraping)

```javascript
// Video info
document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent  // title
document.querySelector('.ytp-time-duration')?.textContent  // duration
document.querySelector('ytd-video-owner-renderer #channel-name')?.textContent  // channel

// Current playback
document.querySelector('video')?.currentTime  // seconds watched
document.querySelector('video')?.duration  // video length
document.querySelector('video')?.playbackRate  // 1, 1.5, 2x

// Page context
window.location.pathname  // /watch, /shorts, /feed/subscriptions
new URLSearchParams(window.location.search).get('v')  // video ID

// Recommendations (sidebar)
document.querySelectorAll('ytd-compact-video-renderer')  // sidebar videos
document.querySelectorAll('ytd-rich-item-renderer')  // homepage videos

// Shorts detection
window.location.pathname.startsWith('/shorts/')
```

### Storage Strategy

```javascript
// Use chrome.storage.local for persistence
chrome.storage.local.set({
  sessions: [...],
  videos: [...],
  dailyStats: {
    '2026-02-09': { totalMinutes: 45, videoCount: 12, shortsCount: 8 }
  }
});
```

**Privacy-first**: All data stays local. Never phone home.

---

## Personalization Strategies

### Phase 1: Observation (Week 1)

**Goal**: Build baseline without judgment

- Track everything silently
- No interventions yet
- Generate "Digital Portrait":
  - Average daily usage
  - Peak hours
  - Content mix (% shorts, % subscriptions, % recommendations)
  - Session patterns (frequency, duration)
  - Top categories

### Phase 2: Awareness (Week 2-3)

**Goal**: Make the invisible visible

Interventions based on observed patterns:

| Pattern Detected | Intervention |
|------------------|--------------|
| >60% from recommendations | "Most of your viewing comes from algorithm suggestions" |
| >10 Shorts/day | "You watched 12 Shorts today (avg: 15 seconds each)" |
| Late night usage | "You typically watch 40 min after 11pm" |
| Morning first-check | "You've opened YouTube within 10 min of waking for 5 days straight" |

**Key**: Non-judgmental observations. Facts, not lectures.

### Phase 3: Gradual Friction (Week 4-6)

**Goal**: Make mindless usage harder, intentional usage easier

Personalized friction based on data:

| User Pattern | Friction Applied |
|--------------|------------------|
| Autoplay binger | Pause before autoplay: "Continue watching?" |
| Recommendation follower | Blur sidebar initially, require hover |
| Shorts addict | Limit Shorts per session, progressively reduce |
| Night owl | Stronger reminders after their typical bedtime |
| Search → rabbit hole | Show "You searched for X, you're now watching Y" |

### Phase 4: Active Reduction (Week 7-8)

**Goal**: Hit reduction targets

Based on Phase 1 baseline:
- Set weekly reduction goals (10-15% per week)
- Personalized daily budgets
- "Savings account" metaphor: "You've saved 2h 15m this week"
- Celebrate streaks and milestones

---

## Personalized Plan Generation Algorithm

```javascript
function generatePlan(userData) {
  const baseline = calculateBaseline(userData.week1);
  const patterns = identifyPatterns(userData);
  
  return {
    // Awareness insights
    insights: [
      patterns.recommendationRatio > 0.5 && "Algorithm-driven viewing detected",
      patterns.shortsPerDay > 10 && "High short-form consumption",
      patterns.lateNightMinutes > 30 && "Late-night usage affecting sleep",
    ].filter(Boolean),
    
    // Personalized interventions
    interventions: prioritizeInterventions(patterns),
    
    // Weekly targets (10% reduction)
    targets: {
      week2: baseline.dailyMinutes * 0.90,
      week3: baseline.dailyMinutes * 0.80,
      week4: baseline.dailyMinutes * 0.70,
      // etc.
    },
    
    // Vulnerable moments
    riskTimes: patterns.peakHours,
    
    // Strengths to reinforce
    strengths: [
      patterns.searchRatio > 0.3 && "Good intentional search usage",
      patterns.completionRate > 0.7 && "You watch videos fully (focused)",
    ].filter(Boolean),
  };
}
```

---

## Key Research Insights Applied

### From Quantified Self Community
- **Start simple**: Don't overwhelm with data. One metric at a time.
- **Make observations relevant, convenient, trustworthy**
- **"What would surprise you?"** - Surface unexpected patterns

### From Center for Humane Tech
- **Grayscale** reduces visual appeal
- **Friction (One Sec app)** forces intentional action
- **Tech-free blocks** more effective than total bans
- **Intention-setting** before opening apps

### From r/NoSurf Community
- **Gradual reduction** > cold turkey
- **Replace, don't just remove** - suggest alternatives
- **Track streaks** for motivation
- **Morning/bedtime habits** most impactful

### From Academic Research
- **Distinguish adaptive vs. problematic use**
- **Variable rewards** (recommendations) most addictive
- **Shorts/TikTok-style** = highest dopamine spike
- **Social validation** (likes, comments) drives compulsion
- **Autonomic stress response** from overuse

---

## Metrics Dashboard (For User)

### Daily View
```
Today: 47 min (Goal: 45 min) ⚠️
├── Intentional: 32 min (68%) ✓
├── Algorithmic: 15 min (32%)
└── Shorts: 8 videos

Compared to last week: ↓15%
```

### Weekly Insights
```
🎯 Goal Progress: 4/7 days under budget
📊 Content Mix: 45% music, 30% tech, 25% random
⏰ Peak Usage: 10pm-12am (consider wind-down routine)
🔄 Autoplay trap: 3 times this week
```

### Personalized Tip
```
"You watch 40% more on weekends. Consider setting
a weekend-specific budget or planning activities."
```

---

## Privacy Considerations

- **All data local** - chrome.storage.local only
- **No video content** - only metadata (title, duration)
- **Exportable** - user can download their data as JSON
- **Deletable** - one-click wipe
- **Transparent** - show exactly what's tracked in settings

---

## Next Steps

1. Implement core logging (session, video, temporal)
2. Build baseline analysis after 7 days
3. Design awareness dashboard
4. Implement friction interventions
5. Add self-report prompts (optional)
6. Build reduction targets + progress tracking
