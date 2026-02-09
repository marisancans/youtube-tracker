# YouTube Detox 🧘

A Chrome extension for gradually reducing YouTube usage through personalized insights and gentle friction.

**Philosophy:** Not a cold-turkey blocker. A gradual, data-driven approach to building healthier viewing habits over 1-2 months.

## Features

### Phase 1: Observation (Week 1)
- Silent tracking of viewing patterns
- No interventions
- Build baseline data

### Phase 2: Awareness (Week 2-3)
- Surface insights about your viewing habits
- Non-judgmental observations

### Phase 3: Friction (Week 4-6)
- Personalized interventions based on your patterns
- Pause before autoplay
- Blur recommendations for algorithm-heavy users

### Phase 4: Reduction (Week 7+)
- Weekly reduction targets
- Progress tracking
- Celebrate wins

## What It Tracks

- **Sessions:** When you visit YouTube, how long you stay
- **Videos:** What you watch, how much of each video
- **Source:** Did you search for it, or did the algorithm serve it?
- **Shorts:** The high-dopamine short-form content
- **Autoplay:** How often you fall into autoplay chains
- **Patterns:** Time of day, day of week, binge sessions

**All data stays local.** Nothing is ever sent anywhere.

## Installation

### Development Mode

1. Clone the repo:
   ```bash
   git clone https://github.com/marisancans/youtube-detox-extension.git
   cd youtube-detox-extension
   ```

2. Add icons to `/icons/` folder:
   - `icon16.png` (16x16)
   - `icon48.png` (48x48)
   - `icon128.png` (128x128)

3. Open Chrome and go to `chrome://extensions/`

4. Enable "Developer mode" (top right)

5. Click "Load unpacked" and select the project folder

6. The extension icon should appear in your toolbar

## Usage

1. Browse YouTube normally for the first week
2. Click the extension icon to see your stats
3. Export your data anytime with the "Export Data" button

## Project Structure

```
youtube-detox-extension/
├── manifest.json           # Extension manifest
├── src/
│   ├── background/         # Service worker (session management)
│   │   └── index.js
│   ├── content/            # Content scripts (YouTube DOM scraping)
│   │   ├── index.js
│   │   ├── scraper.js
│   │   └── styles.css
│   ├── popup/              # Extension popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── utils/              # Shared utilities
│       ├── storage.js
│       └── logger.js
├── icons/                  # Extension icons
└── research/               # Research documents
    ├── 01-academic-findings.md
    └── 02-logging-personalization.md
```

## Privacy

- All data stored locally via `chrome.storage.local`
- No external API calls
- No analytics or telemetry
- You own your data - export or delete anytime

## License

MIT
