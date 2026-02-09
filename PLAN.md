# Migration Plan: React + Vite + TypeScript with Injected YouTube UI

## Goal
Replace the popup-based UI with a **floating stats widget injected directly into YouTube pages**. Migrate from plain JS to **React + Vite + TypeScript**. The widget is always visible and expanded — a constant reminder of time spent.

## Architecture

```
youtube-tracker/
├── vite.config.ts          # Vite config with multi-entry for extension
├── tsconfig.json
├── package.json
├── manifest.json            # Updated - remove popup, keep content + background
├── public/
│   └── icons/               # Move existing icons here
├── src/
│   ├── background/
│   │   └── index.ts         # Service worker (TS rewrite of current)
│   ├── content/
│   │   ├── index.ts         # Entry: injects React widget + sets up tracking
│   │   ├── tracker.ts       # YouTube event tracking (play/pause/visibility/nav)
│   │   └── scraper.ts       # DOM scraping utilities (TS rewrite)
│   ├── widget/
│   │   ├── App.tsx           # Main widget component
│   │   ├── components/
│   │   │   ├── SessionTimer.tsx   # Active + background timer display
│   │   │   ├── TodayStats.tsx     # Today's minutes/videos/shorts
│   │   │   └── WeekChart.tsx      # 7-day bar chart
│   │   ├── hooks/
│   │   │   └── useStats.ts        # Hook that polls background for stats
│   │   └── widget.css             # Scoped styles (shadow DOM or prefix)
│   └── types/
│       └── messages.ts      # Shared message types & data interfaces
├── dist/                    # Build output (this is what Chrome loads)
```

## Key Changes

### 1. Add build tooling
- `package.json` with React, Vite, TypeScript, @crxjs/vite-plugin (or manual multi-entry)
- `vite.config.ts` configured for Chrome extension: separate builds for background (service worker), content script (injects React), no popup
- `tsconfig.json` with strict mode

### 2. Remove popup, add injected widget
- Remove `action.default_popup` from manifest.json
- Content script creates a shadow DOM container on YouTube pages
- React mounts inside shadow DOM (isolates styles from YouTube)
- Widget is a floating panel (bottom-right, always visible, expanded by default)
- Shows: active timer, background timer, today's stats (minutes, videos, shorts), 7-day chart

### 3. TypeScript rewrite
- `background/index.ts` — same logic, typed interfaces
- `content/index.ts` — entry point: creates shadow DOM, mounts React, starts tracker
- `content/tracker.ts` — extracted YouTube event tracking (visibility, video, navigation)
- `content/scraper.ts` — typed DOM scraping
- `types/messages.ts` — shared `MessageType` enum and payload interfaces

### 4. React widget components
- `App.tsx` — container, manages collapsed/expanded (default: expanded)
- `SessionTimer.tsx` — shows active and background time, updates every second
- `TodayStats.tsx` — minutes, videos, shorts count
- `WeekChart.tsx` — simple 7-day bar chart (same visual as current popup)
- `useStats.ts` — custom hook, polls `GET_STATS` every 1s, returns typed stats

### 5. Shadow DOM for style isolation
- Widget styles won't leak into YouTube
- YouTube styles won't affect the widget
- CSS stays in `widget.css`, imported by React

## Build & Dev Workflow

- `npm run dev` — Vite watches, rebuilds to `dist/` on changes
- `npm run build` — Production build to `dist/`
- Chrome loads `dist/` folder as unpacked extension
- Hot-reload: use Vite's watch mode, then just refresh YouTube tab

## What Stays the Same
- Background service worker logic (active/background time tracking)
- Chrome message passing pattern (content ↔ background)
- All data stays in chrome.storage.local
- Content script tracking logic (video, navigation, visibility events)

## Migration Steps (in order)
1. Init package.json, install deps (react, react-dom, typescript, vite, @types/chrome)
2. Create vite.config.ts with extension multi-entry build
3. Create tsconfig.json
4. Create types/messages.ts with shared interfaces
5. Rewrite background/index.ts (TypeScript port)
6. Rewrite content/tracker.ts and content/scraper.ts
7. Build React widget components (App, SessionTimer, TodayStats, WeekChart)
8. Create content/index.ts entry that mounts widget in shadow DOM + starts tracker
9. Update manifest.json (remove popup, point to dist/ outputs)
10. Move icons to public/
11. Test build and verify in Chrome
