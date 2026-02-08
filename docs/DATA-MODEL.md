# Complete Data Model

## Philosophy

Capture everything that indicates **mindless vs intentional** behavior. Later we can:
- Train ML models to predict doomscrolling
- Identify personal triggers
- Measure intervention effectiveness

---

## 1. Scroll Events

Every scroll on YouTube pages.

```sql
CREATE TABLE scroll_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,  -- groups events in one visit
  
  page_type VARCHAR(20),     -- 'home', 'watch', 'search', 'channel', 'shorts'
  
  timestamp TIMESTAMPTZ NOT NULL,
  scroll_y INTEGER,          -- pixels from top
  scroll_depth_percent SMALLINT,  -- 0-100, how far down the page
  viewport_height INTEGER,
  page_height INTEGER,
  
  scroll_velocity FLOAT,     -- pixels/second (fast = mindless)
  scroll_direction VARCHAR(4),  -- 'up' or 'down'
  
  -- For home/search: how many video cards are now visible
  visible_video_count INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-series queries
CREATE INDEX idx_scroll_user_time ON scroll_events(user_id, timestamp DESC);
```

**Insights we can extract:**
- Scroll velocity patterns (fast scrolling = doomscrolling)
- How deep they go before clicking
- Scroll-up behavior (reconsidering, searching for something)
- Time spent scrolling vs watching

---

## 2. Thumbnail Interactions

Hover and click behavior on video thumbnails.

```sql
CREATE TABLE thumbnail_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  
  video_id VARCHAR(20) NOT NULL,
  video_title TEXT,
  channel_name VARCHAR(255),
  
  page_type VARCHAR(20),     -- where the thumbnail appeared
  position_index INTEGER,    -- position in the list (0 = first)
  position_row INTEGER,      -- which row
  
  -- Hover data
  hover_started_at TIMESTAMPTZ,
  hover_duration_ms INTEGER, -- how long hovered
  preview_played BOOLEAN,    -- did the preview video play?
  preview_watch_ms INTEGER,  -- how long watched preview
  
  -- Outcome
  clicked BOOLEAN DEFAULT FALSE,
  click_timestamp TIMESTAMPTZ,
  
  -- Thumbnail metadata (for ML)
  has_red_title BOOLEAN,     -- clickbait indicator
  title_caps_percent SMALLINT,  -- ALL CAPS = clickbait
  title_length INTEGER,
  has_face_thumbnail BOOLEAN,
  has_surprised_face BOOLEAN,  -- 😱 thumbnails
  view_count BIGINT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_thumb_user_time ON thumbnail_events(user_id, hover_started_at DESC);
```

**Insights we can extract:**
- Hover-to-click ratio (low = mindless browsing)
- Which thumbnails grab attention but aren't clicked (regret avoidance working?)
- Clickbait susceptibility
- Position bias (always clicking first result?)

---

## 3. Page Events

Navigation and page-level behavior.

```sql
CREATE TABLE page_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  
  event_type VARCHAR(30),    -- see list below
  page_type VARCHAR(20),
  page_url TEXT,
  
  timestamp TIMESTAMPTZ NOT NULL,
  
  -- Context
  from_page_type VARCHAR(20),  -- where they came from
  navigation_method VARCHAR(20),  -- 'click', 'back', 'forward', 'reload', 'direct', 'autoplay'
  
  -- For search pages
  search_query TEXT,
  search_results_count INTEGER,
  
  -- Time on page (filled when leaving)
  time_on_page_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event types:
-- 'page_load', 'page_unload', 'tab_visible', 'tab_hidden', 
-- 'tab_switch_away', 'tab_switch_back', 'page_reload',
-- 'back_button', 'forward_button', 'link_click'

CREATE INDEX idx_page_user_time ON page_events(user_id, timestamp DESC);
```

**Insights we can extract:**
- Reload frequency (refresh addiction)
- Back button patterns (rabbit holes)
- Tab switching (distraction level)
- Time on homepage vs watch page ratio

---

## 4. Video Watch Events

Granular video playback data.

```sql
CREATE TABLE video_watch_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  watch_session_id UUID NOT NULL,  -- groups events for one video
  
  video_id VARCHAR(20) NOT NULL,
  
  event_type VARCHAR(20),  -- 'play', 'pause', 'seek', 'speed_change', 'ended', 'abandoned'
  timestamp TIMESTAMPTZ NOT NULL,
  
  video_time_seconds FLOAT,   -- position in video
  
  -- For seeks
  seek_from_seconds FLOAT,
  seek_to_seconds FLOAT,
  seek_delta_seconds FLOAT,
  
  -- For speed changes  
  playback_speed FLOAT,       -- 0.25, 0.5, 1, 1.25, 1.5, 2
  
  -- For abandonment
  watch_percent_at_abandon SMALLINT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_video_watch_user ON video_watch_events(user_id, timestamp DESC);
```

**Insights we can extract:**
- Seek patterns (skipping = disengaged or searching for value?)
- Speed preferences (2x = extracting value efficiently)
- Abandonment points (what makes people leave?)
- Pause patterns (actually engaged vs background noise)

---

## 5. Watch Sessions (Aggregated)

One row per video watched.

```sql
CREATE TABLE watch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,  -- browser session
  
  video_id VARCHAR(20) NOT NULL,
  video_title TEXT,
  channel_name VARCHAR(255),
  channel_id VARCHAR(30),
  video_duration_seconds INTEGER,
  video_category VARCHAR(50),
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  active_watch_seconds INTEGER,  -- actual attention time
  total_duration_seconds INTEGER,  -- end - start
  
  -- How they got there
  source VARCHAR(20),  -- 'search', 'recommendation', 'subscription', 'autoplay', 'direct', 'shorts', 'notification'
  source_position INTEGER,  -- position in recommendation list
  
  -- Engagement metrics
  watch_percent SMALLINT,
  seek_count INTEGER,
  pause_count INTEGER,
  average_speed FLOAT,
  
  -- User input
  productivity_rating SMALLINT,  -- -1, 0, 1
  intention TEXT,
  matched_intention BOOLEAN,  -- did they find what they wanted?
  
  -- Outcome
  led_to_another_video BOOLEAN,
  next_video_source VARCHAR(20),  -- how they got to next
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watch_user_time ON watch_sessions(user_id, started_at DESC);
CREATE INDEX idx_watch_channel ON watch_sessions(user_id, channel_id);
```

---

## 6. Browser Sessions

One row per YouTube visit.

```sql
CREATE TABLE browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  
  -- Entry point
  entry_page_type VARCHAR(20),
  entry_url TEXT,
  entry_source VARCHAR(30),  -- 'direct', 'bookmark', 'notification', 'link', 'new_tab'
  
  -- What triggered this visit?
  trigger_type VARCHAR(30),  -- 'habit', 'notification', 'task', 'boredom', 'unknown'
  
  -- Session totals
  total_duration_seconds INTEGER,
  active_duration_seconds INTEGER,  -- excluding tab-hidden time
  
  pages_visited INTEGER,
  videos_watched INTEGER,
  videos_started_not_finished INTEGER,
  
  scroll_total_pixels INTEGER,
  thumbnails_hovered INTEGER,
  thumbnails_clicked INTEGER,
  
  page_reloads INTEGER,
  back_button_presses INTEGER,
  
  -- Time distribution
  time_on_home_seconds INTEGER,
  time_on_watch_seconds INTEGER,
  time_on_search_seconds INTEGER,
  time_on_shorts_seconds INTEGER,
  
  -- Productivity
  productive_videos INTEGER,
  unproductive_videos INTEGER,
  
  -- How it ended
  exit_type VARCHAR(20),  -- 'closed_tab', 'navigated_away', 'idle_timeout', 'intervention'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_user_time ON browser_sessions(user_id, started_at DESC);
```

**Insights we can extract:**
- Session frequency and duration patterns
- What triggers visits (notifications, habit, boredom)
- Productive vs unproductive session ratios
- How sessions end (intervention success?)

---

## 7. Recommendation Interactions

What YouTube recommends and what user does with it.

```sql
CREATE TABLE recommendation_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  
  -- Where shown
  location VARCHAR(30),  -- 'sidebar', 'end_screen', 'home_feed', 'search_results', 'autoplay_queue'
  position_index INTEGER,
  
  -- Video info
  video_id VARCHAR(20) NOT NULL,
  video_title TEXT,
  channel_name VARCHAR(255),
  
  -- User action
  action VARCHAR(20),  -- 'ignored', 'hovered', 'clicked', 'not_interested', 'dont_recommend'
  hover_duration_ms INTEGER,
  
  timestamp TIMESTAMPTZ NOT NULL,
  
  -- Was autoplay involved?
  was_autoplay_next BOOLEAN,
  autoplay_countdown_started BOOLEAN,
  autoplay_cancelled BOOLEAN,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rec_user_time ON recommendation_events(user_id, timestamp DESC);
```

---

## 8. Intervention Events

Track when interventions fire and their effectiveness.

```sql
CREATE TABLE intervention_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  
  intervention_type VARCHAR(50),  -- 'productivity_prompt', 'time_warning', 'intention_prompt', 'friction_delay', etc.
  
  triggered_at TIMESTAMPTZ NOT NULL,
  trigger_reason TEXT,  -- why it fired
  
  -- User response
  response VARCHAR(30),  -- 'dismissed', 'engaged', 'productive', 'unproductive', 'stopped_watching'
  response_at TIMESTAMPTZ,
  response_time_ms INTEGER,
  
  -- Outcome
  user_left_youtube BOOLEAN,
  minutes_until_return INTEGER,  -- if they left, when did they come back?
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_intervention_user ON intervention_events(user_id, triggered_at DESC);
```

---

## 9. Daily Aggregates

Pre-computed for fast dashboard queries.

```sql
CREATE TABLE daily_aggregates (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Time
  total_time_seconds INTEGER DEFAULT 0,
  active_time_seconds INTEGER DEFAULT 0,
  
  -- Sessions
  session_count INTEGER DEFAULT 0,
  avg_session_duration_seconds INTEGER,
  
  -- Videos
  videos_watched INTEGER DEFAULT 0,
  videos_completed INTEGER DEFAULT 0,  -- >90% watched
  videos_abandoned INTEGER DEFAULT 0,  -- <30% watched
  unique_channels INTEGER DEFAULT 0,
  
  -- Productivity
  productive_time_seconds INTEGER DEFAULT 0,
  unproductive_time_seconds INTEGER DEFAULT 0,
  neutral_time_seconds INTEGER DEFAULT 0,
  
  -- Scrolling
  total_scroll_pixels INTEGER DEFAULT 0,
  avg_scroll_velocity FLOAT,
  
  -- Thumbnails
  thumbnails_hovered INTEGER DEFAULT 0,
  thumbnails_clicked INTEGER DEFAULT 0,
  hover_to_click_ratio FLOAT,
  
  -- Navigation
  page_reloads INTEGER DEFAULT 0,
  back_button_count INTEGER DEFAULT 0,
  
  -- Recommendations
  recommendations_shown INTEGER DEFAULT 0,
  recommendations_clicked INTEGER DEFAULT 0,
  autoplay_accepted INTEGER DEFAULT 0,
  autoplay_cancelled INTEGER DEFAULT 0,
  
  -- Interventions
  interventions_shown INTEGER DEFAULT 0,
  interventions_effective INTEGER DEFAULT 0,  -- led to leaving or productive choice
  
  -- Hourly breakdown
  hourly_seconds JSONB,  -- {"0": 120, "1": 0, ..., "23": 3600}
  
  -- Top channels
  top_channels JSONB,  -- [{"channel": "...", "seconds": 1234}, ...]
  
  PRIMARY KEY (user_id, date)
);
```

---

## Data Collection Events (Extension → Backend)

The extension batches and sends these event types:

```typescript
type EventBatch = {
  session_id: string;
  events: (
    | ScrollEvent
    | ThumbnailEvent
    | PageEvent
    | VideoWatchEvent
    | RecommendationEvent
    | InterventionEvent
  )[];
  timestamp: number;
};

// Sync every 30 seconds while active
// Sync on page unload
// Sync on tab hidden
```

---

## Privacy Tiers

User can choose data collection level:

| Tier | What's Collected |
|------|------------------|
| **Minimal** | Watch sessions only (video, duration, rating) |
| **Standard** | + Page events, scroll depth, thumbnails clicked |
| **Full** | + All scroll events, hover times, seek patterns |

Default: **Standard**

---

## Storage Estimates (Full Tier)

Per active hour on YouTube:
- Scroll events: ~500 rows × 100 bytes = 50 KB
- Thumbnail events: ~100 rows × 200 bytes = 20 KB
- Page events: ~20 rows × 150 bytes = 3 KB
- Video watch events: ~200 rows × 100 bytes = 20 KB
- Recommendation events: ~50 rows × 150 bytes = 7.5 KB

**~100 KB per hour of YouTube usage**

Heavy user (4 hrs/day): 400 KB/day × 365 = **~150 MB/year**

Light user: **~30 MB/year**

Easily manageable on homelab.

---

## Future ML Applications

With this data we can:

1. **Predict doomscrolling sessions** before they start
2. **Identify trigger patterns** (time of day, entry point, mood indicators)
3. **Personalize interventions** (what works for THIS user)
4. **Detect relapse patterns** early
5. **Measure intervention effectiveness** scientifically
6. **Discover "danger" channels/content types** for each user
7. **Build "productive use" classifiers** from ratings
