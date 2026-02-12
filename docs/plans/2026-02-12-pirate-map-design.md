# Pirate Sea Chart — Design Document

## Overview

Replace the current dashboard with a full-page interactive pirate map rendered on HTML Canvas 2D. The map visualizes the user's 24h rolling drift history as a ship's voyage trail. A mini-map version appears in the YouTube widget panel. Bundled audio provides ambient ocean sounds and interaction feedback.

---

## 1. Data Layer — 24h Rolling Drift History

### New Drift Snapshot Structure

```typescript
interface DriftSnapshot {
  timestamp: number;    // epoch ms
  drift: number;        // 0.0 - 1.0
  level: 'low' | 'medium' | 'high' | 'critical';
  videosThisHour: number;
  productiveThisHour: number;
}
```

### Storage & Collection

- Background script pushes a snapshot every **30 minutes** (48 points in 24h).
- Array capped at 48 entries; oldest entry shifted off when a new one arrives.
- Stored in `chrome.storage.local` as `driftHistory`.
- New message handler: `GET_DRIFT_HISTORY` returns the full array.
- Existing `GET_DRIFT` unchanged (current drift only).
- **Rolling window** — no midnight reset. Always represents the last 24 hours from current time.

---

## 2. Path Generation Algorithm

Each drift snapshot becomes a segment of the ship's trail on the canvas. The ship always advances forward (left-to-right through time) but drift controls vertical deviation.

### Path Math Per Segment

| Drift Range | Behavior | Deviation | Description |
|-------------|----------|-----------|-------------|
| 0.0 - 0.3 | Straight | +/-5px | Near-straight line, tiny wobble |
| 0.3 - 0.5 | S-curves | +/-20px | Gentle sine-wave meandering |
| 0.5 - 0.7 | Wide arcs | +/-50px | Large swooping curves, occasional hairpin |
| 0.7 - 1.0 | Loops | +/-80px + loops | Path doubles back, creates knots and spirals |

### Path Properties

- **Cubic Bezier curves** — control points get more extreme with higher drift.
- **Seeded random** (based on snapshot timestamp) — same data always draws the same path. No jitter on re-render.
- Path fits within canvas bounds with padding for islands.
- **Dotted/dashed stroke** — classic treasure map trail.
- **Color gradient along the path**: teal (focused) -> amber -> red (drifty).
- Oldest 25% of trail fades to transparent.
- Ship icon at the head (current time), rocking based on current drift level.

---

## 3. Map Canvas — Visual Elements

### The Sea

- Parchment-tinted ocean base (`#e8d5b7` with subtle blue wash).
- Faint grid lines like old nautical charts.
- Ornate border with compass directions (N/S/E/W) — "here be dragons" style.
- Subtle paper grain texture overlay.

### Islands (Dashboard Only — 7 Islands)

| Island | Type | Shows | On Click |
|--------|------|-------|----------|
| Lookout Isle | Stat | Videos watched today | Tooltip with breakdown |
| Lighthouse Rock | Stat | Day streak + sync status | Glows green when synced |
| Focus Atoll | Stat | Focus score (compass rose) | Tooltip with ratio |
| Treasure Cove | Stat | Achievements / XP / Level | Achievement medals overlay |
| Harbor Town | Action | Goal mode + daily limit | Goal settings panel |
| Fort Discipline | Action | Difficulty tier | Tier selector panel |
| Fog Banks | Action | Friction effects toggles | Friction settings panel |

- Hand-drawn style SVG sprites rendered onto canvas.
- Label flag on a pole per island.
- Stat islands show live numbers in parchment banners.
- Action islands have dock/pier visuals.
- Ship path algorithm avoids island positions.

### Compass Rose

- Large ornate compass in bottom-right corner.
- Needle angle = current drift (0deg = North/focused, 180deg = South/lost).
- Ring shows drift % number.
- Doubles as drift meter — replaces current "Drift Level" section.

### X Marks the Spot

- Streak > 3 days: treasure X appears ahead of the ship on the path.
- Visual encouragement: "keep going to claim your treasure."

---

## 4. Weather & Atmosphere System

Real-time weather effects layered on the map canvas, driven by current drift level. All effects animate continuously.

### Low Drift (Calm Seas)

- Gentle sine-wave ripples across water, slow movement.
- Faint sparkle/shimmer (sun reflection).
- Clear sky, no clouds.
- Sea color: calm teal-blue tint.

### Medium Drift (Choppy Waters)

- Taller, faster waves.
- Wind lines — thin white streaks blowing across canvas.
- 2-3 cloud sprites drifting across top.
- Sea color: darker blue-gray.
- Choppier ship wake trail.

### High Drift (Rough Seas)

- Large rolling waves with whitecap foam.
- Heavy wind lines — more streaks, faster.
- Dark cloud cover across top 30% of canvas.
- Rain streaks — diagonal white/gray lines.
- Sea color: dark slate gray.
- Islands sway slightly.
- Paper grain texture intensifies.

### Critical Drift (STORM)

- Everything from High, plus:
- **Lightning bolts** — bright white jagged lines from clouds to sea, random positions, every 3-8 seconds.
- Brief white flash overlay on each bolt.
- Thunder visual: subtle 2px canvas vibration.
- Violent, overlapping waves with foam everywhere.
- Near-black sea with red undertone.
- Heavy diagonal rain.
- 60%+ cloud cover — dark, roiling.
- Ship rocks heavily.
- Compass needle twitches erratically.

### Transitions

All weather effects interpolate smoothly over ~2 seconds when drift level changes. No hard cuts.

### Performance

- Weather renders on a **separate canvas layer** stacked on top of the map.
- `requestAnimationFrame` with frame budgeting — skip frames if behind.
- Target: 30fps for weather layer; map itself is static until data changes.

---

## 5. Audio System

### Sound Files

| Sound | File | Size (est) | Trigger |
|-------|------|-----------|---------|
| Ambient ocean | `ambient-ocean.mp3` | ~150KB | Loops while map is open |
| Ship's bell | `ship-bell.mp3` | ~30KB | User rates drift in friction overlay |
| UI click | `ui-click.mp3` | ~10KB | Clicking islands, opening panels |

### Behavior

- **Ambient**: Fades in over 1s when widget expands or dashboard loads. Fades out over 1s on collapse/navigate away. Volume subtly shifts with weather (louder during storms).
- **Bell**: Single chime on drift rating. No overlap.
- **UI click**: Short wooden latch/map pin sound on interactions.
- **Mute toggle**: Speaker icon in map corner. State persisted in `chrome.storage.local`.
- **Default volume**: ~30%. No volume slider — just mute/unmute.

### Technical

- `HTMLAudioElement` in content script shadow DOM (widget) and directly in options page (dashboard).
- Files declared in `manifest.json` `web_accessible_resources`.
- Placeholder silence files included initially; real CC0/royalty-free audio sourced separately.

---

## 6. Widget Mini-Map

Replaces the drift meter ("Current & Tides") and 24h bar chart ("Ship's Log") in the expanded widget panel.

### Specs

- Canvas: ~300px wide x 160px tall.
- Shows: dotted trail path + ship icon + compass rose (small, corner).
- Weather effects: simplified (color/wave shifts only — no lightning, fewer particles).
- No islands — too small.
- Same path algorithm as dashboard, scaled down.
- Tap mini-map: opens full dashboard in new tab (`chrome.runtime.openOptionsPage()`).
- Small "Open full map" link below canvas.

### Widget Panel Structure (Updated)

Keeps:
- Header (Captain's Log + sync dot)
- Hero section (time + focus score + streak)
- **Mini-map (NEW)** — replaces drift meter + 24h chart
- Stats grid (Videos, Tabs, Productive, Unproductive)
- Level bar (XP)
- Daily goal progress
- Now watching
- Achievements

Removes:
- Drift meter ocean scene
- 24h bar chart

---

## 7. Dashboard — Full-Page Map

The current Dashboard.tsx (stats cards, charts, panels) is **completely replaced** by the pirate map.

### Layout

- Canvas fills entire viewport (100vw x 100vh).
- No scrolling — everything lives on the map.
- Ornate rope + compass border frame.
- Title banner top-center: "Captain's Log" in Playfair Display on parchment scroll ribbon.

### Island Interaction

- **Hover**: Golden glow outline, cursor changes to anchor.
- **Click stat island**: Parchment note tooltip pinned to the map with stat details.
- **Click action island**: Settings panel slides in from the right (400px wide, parchment background, rope border). Map visible behind, slightly dimmed.
- **Escape / click map**: Closes any open panel.

### HUD Elements (Always Visible)

- **Top-left**: Current time + session duration.
- **Top-right**: Mute button + Settings gear (links to Settings page).
- **Bottom-right**: Compass rose drift meter (large, ~120px).
- **Bottom-left**: Level/XP bar + rank insignia.

### Settings Integration

- Dashboard map embeds common actions as islands (goal mode, difficulty, friction).
- Full Settings page remains separate, accessible via gear icon.

### Responsive

- Canvas redraws on `resize`.
- Island positions are percentage-based, reflow proportionally.

---

## File Impact Summary

| Area | Files | Change |
|------|-------|--------|
| Data | `background/drift.ts` | Add rolling 24h snapshot collection + `GET_DRIFT_HISTORY` handler |
| Data | `chrome.storage.local` | New `driftHistory` key |
| Canvas | `components/map/PirateMap.tsx` | NEW — main canvas map component |
| Canvas | `components/map/path-generator.ts` | NEW — Bezier path from drift history |
| Canvas | `components/map/weather-renderer.ts` | NEW — weather effects canvas layer |
| Canvas | `components/map/island-sprites.ts` | NEW — island SVG-to-canvas rendering |
| Canvas | `components/map/map-renderer.ts` | NEW — sea, grid, border, compass drawing |
| Audio | `lib/audio.ts` | NEW — audio manager (play/stop/mute) |
| Audio | `assets/audio/*.mp3` | NEW — 3 audio files (~190KB total) |
| Widget | `components/widget/Widget.tsx` | Replace drift meter + 24h chart with mini-map canvas |
| Dashboard | `options/Dashboard.tsx` | Complete rewrite — full-page pirate map |
| Manifest | `manifest.json` | Add `web_accessible_resources` for audio files |
