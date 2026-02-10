# Progressive Friction System

## Philosophy

**Not cold turkey.** The goal is gradual behavioral change through increasing friction that makes mindless consumption harder while preserving intentional use (music, learning, etc.).

The system uses **Drift (0.0 → 1.0)** — a measure of how far you've drifted from your intentions. The more you drift into unproductive watching, the more friction you experience.

---

## Drift 🌊

### What drives Drift up ⬆️
- Time spent today (relative to goal)
- Unproductive video ratings
- Recommendation clicks (vs. search/direct)
- Session length without breaks
- Late-night usage
- Binge patterns (many videos in sequence)

### What drives Drift down ⬇️
- Productive video ratings
- Intentional navigation (search, subscriptions)
- Taking breaks when reminded
- Staying under daily goal
- Whitelisted channel viewing

### Formula (draft)
```
baseDrift = todayMinutes / dailyGoal  // 0.0 at start, 1.0 at goal, >1.0 over

modifiers = {
  unproductiveRatio: (unproductive / totalRated) * 0.3,
  recommendationRatio: (recClicks / totalVideos) * 0.2,
  bingeBonus: (sessionMinutes > 60) ? 0.2 : 0,
  lateNightBonus: (hour >= 23 || hour < 6) ? 0.15 : 0,
  productiveDiscount: (productive / totalRated) * -0.2,
}

drift = clamp(baseDrift + sum(modifiers), 0, 1)
```

---

## Visual Interventions by Drift Level

### Thumbnails

| Drift | Effect |
|-------|--------|
| 0.0 - 0.3 | Normal thumbnails |
| 0.3 - 0.5 | Slight desaturation (80% saturation) |
| 0.5 - 0.7 | Blur on hover (2px), grayscale 30% |
| 0.7 - 0.9 | Blur always (4px), grayscale 60%, title only on hover |
| 0.9 - 1.0 | Text-only (title + channel), no thumbnail image |

### Video Player

| Drift | Effect |
|-------|--------|
| 0.0 - 0.4 | Normal |
| 0.4 - 0.6 | Subtle vignette overlay |
| 0.6 - 0.8 | Reduced size (90%), centered |
| 0.8 - 1.0 | Reduced size (80%), grayscale border, "Still watching?" prompt |

### Comments Section

| Drift | Effect |
|-------|--------|
| 0.0 - 0.3 | Normal |
| 0.3 - 0.5 | Reduced font (90%) |
| 0.5 - 0.7 | Reduced font (80%), collapsed by default |
| 0.7 - 0.9 | Blur (3px), click to reveal |
| 0.9 - 1.0 | Hidden, "Comments hidden to reduce distraction" |

### Sidebar Recommendations

| Drift | Effect |
|-------|--------|
| 0.0 - 0.3 | Normal |
| 0.3 - 0.5 | Reduced count (show 5 instead of 20) |
| 0.5 - 0.7 | Blur thumbnails, titles only |
| 0.7 - 0.9 | Collapsed, "Show recommendations" button |
| 0.9 - 1.0 | Hidden entirely |

### Homepage Feed

| Drift | Effect |
|-------|--------|
| 0.0 - 0.4 | Normal |
| 0.4 - 0.6 | Show search bar prominently, feed below fold |
| 0.6 - 0.8 | Feed blurred, "What are you looking for?" prompt |
| 0.8 - 1.0 | Feed hidden, search-only mode |

### Autoplay

| Drift | Effect |
|-------|--------|
| 0.0 - 0.3 | Normal autoplay |
| 0.3 - 0.5 | Autoplay countdown extended (10s → 15s) |
| 0.5 - 0.7 | Autoplay countdown 30s + prominent cancel button |
| 0.7 - 1.0 | Autoplay disabled |

---

## Goal Modes

User selects their goal during onboarding or in settings:

### 🎵 Music Mode
- Music channels/videos exempt from friction
- Detection: channel category, "[Official Audio]", "lyrics", etc.
- Drift only increases for non-music content
- Playlists marked as music get free pass

### ⏱️ Time Reduction Mode (Default)
- Goal: reduce overall time spent
- All content contributes to Drift
- Focus on daily/weekly time limits
- Rewards for staying under goal

### 🔒 Strict Mode
- Drift increases 2x faster
- No exemptions
- Maximum friction at 0.7 instead of 1.0
- For users who want aggressive intervention

### 🧊 Cold Turkey Mode
- Not progressive — just blocks after limit
- Simple: "You've used your X minutes today"
- Full block with override option (adds friction tomorrow)

---

## Challenge Tiers & XP Multipliers

Users can increase difficulty for bonus XP:

| Tier | Daily Goal | XP Multiplier | Unlock Condition |
|------|-----------|---------------|------------------|
| 🌱 Casual | 60 min | 1.0x | Default |
| 🎯 Focused | 45 min | 1.5x | 5 days under goal |
| ⚡ Disciplined | 30 min | 2.0x | 7 days at Focused |
| 🔥 Monk | 15 min | 3.0x | 7 days at Disciplined |
| 💎 Ascetic | 5 min | 5.0x | 7 days at Monk |

### Challenge Prompts
After consistent success, prompt user:
```
🏆 You've crushed your goal 5 days in a row!

Ready to level up?
• New goal: 45 min (was 60)
• XP bonus: 1.5x multiplier
• Harder challenge, bigger rewards

[Stay at Casual]  [Accept Challenge →]
```

---

## Drift Decay

Drift shouldn't persist forever. It naturally decays:

- **Daily reset**: Drift resets to 0 at midnight (or wake time)
- **Break bonus**: Taking a 5+ min break reduces Drift by 0.1
- **Good behavior**: Staying under goal for 3 days = start next day at -0.1

---

## UI Indicators

### Widget Shows:
- Current Drift level (0-100% visual meter)
- "Drift: Low / Medium / High / Drifting Away"
- Color coding: green → yellow → orange → red
- Wave animation at high drift 🌊

### Drift Meter in Widget:
```
┌─────────────────────────────┐
│ 🌊 Drift                    │
│ ████████░░░░░░░░░░ 42%     │
│ You're staying focused      │
└─────────────────────────────┘
```

### Dashboard Drift Chart:
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
      
Weekly Average: 0.38 (↓12% from last week)
```

### Drift Visibility Options:
- Show exact percentage
- Show only visual effects ("Thumbnails simplified")
- Educational mode: explain why Drift increased

---

## Exemptions

### Whitelisted Channels
- User can whitelist specific channels
- These never receive friction effects
- Useful for: music, educational channels they trust

### Content Type Detection
- Music videos (auto-detect)
- Live streams (different behavior)
- Shorts (can have separate friction rules)

---

## Settings UI

```
┌─────────────────────────────────────────┐
│ 🎚️ Friction Settings                   │
├─────────────────────────────────────────┤
│                                         │
│ Goal Mode:                              │
│ ○ 🎵 Music Mode - Only count non-music │
│ ● ⏱️ Time Reduction - Reduce overall   │
│ ○ 🔒 Strict - Aggressive friction      │
│ ○ 🧊 Cold Turkey - Hard block          │
│                                         │
│ Daily Goal: [____60____] minutes        │
│                                         │
│ Friction Intensity:                     │
│ Light ○───────●───────○ Aggressive      │
│                                         │
│ ☑️ Blur thumbnails                      │
│ ☑️ Simplify recommendations             │
│ ☑️ Reduce comments                      │
│ ☐ Shrink video player                   │
│ ☑️ Disable autoplay                     │
│                                         │
│ Whitelisted Channels:                   │
│ [+ Add channel]                         │
│ • Lofi Girl                             │
│ • 3Blue1Brown                           │
│                                         │
└─────────────────────────────────────────┘
```

---

## Onboarding Survey

Quick survey to set initial mode:

```
What's your goal?

1. "I use YouTube for music and want to reduce other content"
   → Music Mode

2. "I want to spend less time overall on YouTube"
   → Time Reduction Mode

3. "I need strong limits, I have poor self-control"
   → Strict Mode

4. "Just block me after my limit"
   → Cold Turkey Mode
```

---

## Implementation Phases

### Phase 1: Core Drift System
- [ ] Calculate Drift in background service worker
- [ ] Store Drift history (for charts)
- [ ] Sync Drift to content script
- [ ] Drift meter in widget

### Phase 2: Drift Chart & Dashboard
- [ ] Hourly Drift tracking
- [ ] Daily Drift chart (line graph)
- [ ] Weekly comparison
- [ ] Drift history in dashboard

### Phase 3: Thumbnail Friction
- [ ] CSS injection for blur/grayscale
- [ ] Hover behavior modification
- [ ] Text-only mode at Drift 0.9+

### Phase 4: Recommendation Friction  
- [ ] Sidebar manipulation
- [ ] Homepage feed transformation
- [ ] Autoplay control based on Drift

### Phase 5: Video Player & Comments Friction
- [ ] Size/position adjustments
- [ ] Overlay prompts
- [ ] Comments section effects

### Phase 6: Goal Modes
- [ ] Settings UI for mode selection
- [ ] Music detection logic
- [ ] Per-mode Drift adjustments

### Phase 7: Challenge System
- [ ] Challenge tiers UI
- [ ] XP multipliers
- [ ] Challenge prompts after success streaks
- [ ] Tier progression logic

### Phase 8: Onboarding
- [ ] First-run survey
- [ ] Mode recommendation
- [ ] Initial setup wizard

---

## Open Questions

1. **Coefficient visibility**: Should users see the exact number or just feel the effects?
2. **Override mechanism**: Allow "I really need to watch this" bypass? (with consequences?)
3. **Shorts**: Same friction rules or separate system?
4. **Mobile**: This is extension-only; any mobile considerations?
5. **Social proof**: Show "Users in Strict mode save 2h/week on average"?

---

## Success Metrics

- Average daily YouTube time (should decrease)
- Recommendation click rate (should decrease)
- Search/subscription ratio (should increase)
- User-reported satisfaction
- Retention (users who keep extension installed)
