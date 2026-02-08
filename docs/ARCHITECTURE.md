# Technical Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Chrome Extension                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Content    │  │  Background  │  │      Popup/UI        │   │
│  │   Script     │  │   Worker     │  │                      │   │
│  │  (YouTube)   │  │  (Service)   │  │  Dashboard, Stats,   │   │
│  │              │  │              │  │  Settings            │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│         └────────────┬────┴──────────────────────┘               │
│                      │                                           │
│              chrome.storage.local                                │
│              (offline-first cache)                               │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       │ HTTPS (when online)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Self-Hosted Backend                           │
│                    (homelab Docker)                              │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Traefik   │───▶│   API       │───▶│    PostgreSQL       │  │
│  │   (proxy)   │    │  (Node.js)  │    │    (user data)      │  │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘  │
│                            │                                     │
│                     ┌──────┴──────┐                             │
│                     │   Redis     │                             │
│                     │  (sessions) │                             │
│                     └─────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
                       │
                       │ OAuth 2.0
                       ▼
              ┌─────────────────┐
              │  Google OAuth   │
              │  (Gmail signin) │
              └─────────────────┘
```

## Component Breakdown

### 1. Chrome Extension

#### Content Script (`content.js`)
- Injected into YouTube pages only
- Responsibilities:
  - Detect video playback (watch for URL changes, video element)
  - Extract metadata (title, channel, duration)
  - Track watch time (video.currentTime events)
  - Inject UI overlays (productivity prompts, timers)
  - Apply visual modifications (Phase 3+)
- Communicates with Background Worker via chrome.runtime messages

#### Background Worker (`background.js`)
- Service worker (Manifest V3)
- Responsibilities:
  - Receive events from content script
  - Aggregate session data
  - Sync with backend API
  - Handle alarms for reminders
  - Manage authentication state

#### Popup/Options UI
- Built with: **Preact + TailwindCSS** (tiny bundle)
- Pages:
  - Popup: Quick stats, today's time, toggle interventions
  - Dashboard: Full statistics, charts
  - Settings: Preferences, phase selection, whitelist

### 2. Backend API

**Stack:** Node.js + Fastify + PostgreSQL + Redis

#### Endpoints

```
Auth:
  POST /auth/google          # Exchange Google OAuth code for JWT
  POST /auth/refresh         # Refresh JWT token
  GET  /auth/me              # Get current user

Data Sync:
  POST /sync/sessions        # Batch upload watch sessions
  GET  /sync/sessions        # Get sessions (for new device)
  POST /sync/ratings         # Batch upload productivity ratings
  
Stats:
  GET  /stats/daily          # Daily aggregates
  GET  /stats/weekly         # Weekly trends
  GET  /stats/channels       # Channel breakdown

Settings:
  GET  /settings             # Get user settings
  PUT  /settings             # Update settings
  
Export:
  GET  /export/all           # Full data export (GDPR)
  DELETE /account            # Delete account and all data
```

#### Database Schema

```sql
-- Users (minimal, just for auth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ
);

-- Watch Sessions
CREATE TABLE watch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  video_id VARCHAR(20) NOT NULL,
  title TEXT,
  channel_name VARCHAR(255),
  channel_id VARCHAR(30),
  
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  watch_percent SMALLINT,  -- 0-100
  
  source VARCHAR(20),  -- 'search', 'recommendation', 'subscription', 'direct', 'autoplay'
  productivity_rating SMALLINT,  -- -1, 0, 1
  intention TEXT,  -- what user said they wanted
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- For efficient queries
  INDEX idx_sessions_user_date (user_id, started_at DESC)
);

-- Daily Aggregates (materialized for performance)
CREATE TABLE daily_stats (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  total_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  unique_channels INTEGER DEFAULT 0,
  productive_seconds INTEGER DEFAULT 0,
  unproductive_seconds INTEGER DEFAULT 0,
  
  top_channels JSONB,  -- [{channel, seconds}, ...]
  hourly_distribution JSONB,  -- {0: seconds, 1: seconds, ...}
  
  PRIMARY KEY (user_id, date)
);

-- User Settings
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  current_phase SMALLINT DEFAULT 1,
  phase_started_at TIMESTAMPTZ DEFAULT NOW(),
  
  interventions_enabled JSONB DEFAULT '[]',
  daily_goal_minutes INTEGER,
  
  whitelisted_channels JSONB DEFAULT '[]',
  blocked_channels JSONB DEFAULT '[]',
  
  reminder_interval_minutes INTEGER DEFAULT 30,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Google OAuth Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Extension│     │  Google  │     │ Backend  │     │  User    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ chrome.identity.launchWebAuthFlow()             │
     │───────────────▶│                │                │
     │                │                │                │
     │                │ Google login page              │
     │                │───────────────────────────────▶│
     │                │                │                │
     │                │◀──────────────────────────────│
     │                │  User approves                 │
     │                │                │                │
     │◀───────────────│                │                │
     │  Authorization code             │                │
     │                │                │                │
     │  POST /auth/google {code}       │                │
     │────────────────────────────────▶│                │
     │                │                │                │
     │                │  Exchange code │                │
     │                │◀───────────────│                │
     │                │  for tokens    │                │
     │                │───────────────▶│                │
     │                │                │                │
     │◀────────────────────────────────│                │
     │  JWT token (our own)            │                │
     │                │                │                │
```

**Extension OAuth Setup:**
1. Create project in Google Cloud Console
2. Enable "Google+ API" or "People API"
3. Create OAuth 2.0 credentials (Chrome Extension type)
4. Add extension ID to authorized origins
5. Scopes needed: `email`, `profile` (minimal)

**Backend Token Exchange:**
```javascript
// Backend receives auth code from extension
app.post('/auth/google', async (req, res) => {
  const { code } = req.body;
  
  // Exchange code for Google tokens
  const { tokens } = await oauth2Client.getToken(code);
  
  // Get user info from Google
  const userInfo = await google.oauth2('v2').userinfo.get({
    auth: oauth2Client
  });
  
  // Create or update user in our DB
  const user = await upsertUser(userInfo.data);
  
  // Issue our own JWT
  const jwt = signJWT({ userId: user.id });
  
  return { token: jwt, user };
});
```

## YouTube Detection Avoidance

### The Problem
YouTube actively detects and blocks adblockers. They look for:
- Extensions modifying the DOM
- Blocked network requests
- Specific extension fingerprints
- MutationObserver patterns

### Our Strategy

**Phase 1-2: OBSERVATION ONLY (Safe)**
- We only READ, never WRITE to the DOM
- No network blocking
- No element hiding
- Just listen to video events and page changes
- **Risk: ZERO** — YouTube can't detect passive observation

**Phase 3+: VISUAL MODIFICATIONS (Careful)**

Techniques to avoid detection:

1. **CSS Injection instead of DOM removal**
   ```css
   /* DON'T: Remove elements */
   /* element.remove() — detectable */
   
   /* DO: Hide with CSS */
   ytd-watch-next-secondary-results-renderer {
     opacity: 0 !important;
     pointer-events: none !important;
     height: 0 !important;
     overflow: hidden !important;
   }
   ```

2. **Delayed modifications**
   - Wait 2-3 seconds after page load
   - Randomize timing slightly
   - Don't modify during initial render

3. **User stylesheet approach**
   - Inject as `user_stylesheet` in manifest
   - Appears as user preference, not extension

4. **Never touch ads**
   - Don't block any ad-related requests
   - Don't hide ad elements
   - This is what triggers YouTube's detector

5. **Minimal MutationObserver usage**
   - YouTube watches for excessive observers
   - Use one observer, debounce callbacks
   - Disconnect when not needed

6. **Feature flags**
   - If YouTube updates detection, can disable specific features
   - Graceful degradation

### What We Modify (Phase 3+)

| Element | Modification | Detection Risk |
|---------|--------------|----------------|
| Recommendations sidebar | CSS hide | Low |
| Autoplay toggle | CSS/set attribute | Low |
| Homepage feed | CSS hide | Low |
| Video titles | Text replacement | Medium |
| Thumbnails | CSS grayscale | Very Low |
| Comment section | CSS collapse | Low |
| End screen cards | CSS hide | Low |

### What We NEVER Touch

- Ad elements
- Ad network requests
- YouTube premium prompts
- Any monetization-related UI

## Data Flow

### Watch Session Tracking

```javascript
// Content script detects video
const video = document.querySelector('video');

video.addEventListener('timeupdate', throttle(() => {
  // Send progress to background
  chrome.runtime.sendMessage({
    type: 'VIDEO_PROGRESS',
    data: {
      videoId: getVideoId(),
      currentTime: video.currentTime,
      duration: video.duration
    }
  });
}, 5000));  // Every 5 seconds

// Background worker aggregates
let currentSession = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'VIDEO_PROGRESS') {
    if (!currentSession || currentSession.videoId !== msg.data.videoId) {
      // New video, save previous session
      if (currentSession) saveSession(currentSession);
      currentSession = createSession(msg.data);
    }
    currentSession.watchedSeconds = msg.data.currentTime;
  }
});
```

### Sync Strategy

**Offline-first:**
1. All data written to `chrome.storage.local` immediately
2. Background worker syncs to backend every 5 minutes (if online)
3. On sync: send all unsent sessions, receive any settings changes
4. Conflict resolution: server wins for settings, merge for sessions

```javascript
// Background worker sync
async function syncToBackend() {
  const { pendingSessions, lastSyncAt } = await chrome.storage.local.get([
    'pendingSessions', 
    'lastSyncAt'
  ]);
  
  if (!pendingSessions?.length) return;
  
  try {
    await api.post('/sync/sessions', { sessions: pendingSessions });
    await chrome.storage.local.set({ 
      pendingSessions: [],
      lastSyncAt: Date.now()
    });
  } catch (e) {
    // Will retry next cycle
    console.error('Sync failed:', e);
  }
}

// Sync every 5 minutes
chrome.alarms.create('sync', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync') syncToBackend();
});
```

## Docker Deployment

```yaml
# docker-compose.yml addition for homelab

services:
  youtube-detox-api:
    build: ./youtube-detox-extension/backend
    container_name: youtube-detox-api
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@youtube-detox-db:5432/youtube_detox
      - REDIS_URL=redis://youtube-detox-redis:6379
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - youtube-detox-db
      - youtube-detox-redis
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.ytdetox.rule=Host(`ytdetox.blueadrock.com`)"
      - "traefik.http.routers.ytdetox.tls.certresolver=letsencrypt"
    networks:
      - default

  youtube-detox-db:
    image: postgres:16-alpine
    container_name: youtube-detox-db
    restart: unless-stopped
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=youtube_detox
    volumes:
      - ./data/youtube-detox-postgres:/var/lib/postgresql/data
    networks:
      - default

  youtube-detox-redis:
    image: redis:7-alpine
    container_name: youtube-detox-redis
    restart: unless-stopped
    networks:
      - default
```

## Security Considerations

1. **JWT tokens** — Short expiry (1 hour), refresh tokens in Redis
2. **HTTPS only** — All API calls over TLS
3. **CORS** — Whitelist extension ID only
4. **Rate limiting** — Prevent abuse
5. **Data encryption** — Encrypt sensitive fields at rest
6. **Minimal data** — Only store what's needed
7. **User deletion** — Full GDPR compliance, cascade delete

## Extension Manifest (V3)

```json
{
  "manifest_version": 3,
  "name": "YouTube Detox",
  "version": "0.1.0",
  "description": "Gradually reduce YouTube addiction through awareness and friction",
  
  "permissions": [
    "storage",
    "alarms",
    "identity"
  ],
  
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://ytdetox.blueadrock.com/*"
  ],
  
  "background": {
    "service_worker": "background.js"
  },
  
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  
  "options_page": "options.html",
  
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["email", "profile"]
  },
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

## Development Workflow

1. Extension code in `/src`
2. Backend code in `/backend`
3. `npm run dev` — Watch mode for extension
4. `docker compose up youtube-detox-api` — Local backend
5. Load unpacked extension from `/dist`
6. Changes to content script require extension reload
7. Background worker auto-reloads
