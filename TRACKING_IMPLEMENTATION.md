# Comprehensive Tracking Implementation

## Summary

This document describes the comprehensive tracking system for the YouTube Detox Chrome extension with a unified sync endpoint.

## Content Script Tracking (packages/extension/src/content/tracker.ts)

### Scroll Events
- `scroll_y`, `scroll_depth_percent`, `viewport_height`, `page_height`
- `scroll_velocity` (px/sec), `scroll_direction` (up/down)
- `visible_video_count` - thumbnails in viewport
- **Debounced** to 500ms intervals

### Thumbnail Events
- Automatic detection for `ytd-rich-item-renderer`, `ytd-compact-video-renderer`, etc.
- `hover_duration_ms`, `preview_played`, `preview_watch_ms`
- `clicked`, `position_index`
- `video_id`, `video_title`, `channel_name` scraped from DOM
- `title_caps_percent`, `title_length` (clickbait indicators)

### Page Events
- `page_type` changes (homepage, watch, shorts, search, subscriptions)
- `navigation_method` (click, back_button, direct, search)
- `search_query`, `search_results_count`
- `time_on_page_ms`, `from_page_type`

### Video Watch Events
- `play`, `pause`, `seek`, `speed_change`, `ended`, `abandoned`, `buffer`
- `seek_from`, `seek_to`, `seek_delta`
- `pause_count`, `seek_count` per video
- `playback_speed` changes
- `watch_percent_at_abandon`

### Tab/Visibility
- `tab_switch_count` per session
- `background_seconds` vs `active_seconds`
- Events: `tab_visible`, `tab_hidden`

### Recommendation Events
- Sidebar recommendations tracked via MutationObserver
- `location`: sidebar, end_screen, home_feed, autoplay_queue
- `autoplay_countdown_started`, `autoplay_cancelled`
- `position_index` of clicked recommendation

### Temporal Tracking
- `first_check_time` (first YouTube open of the day)
- `hourly_seconds` breakdown
- `pre_sleep_active` (usage after 10pm)
- `binge_mode_active` (>60 min continuous)

## Backend - Unified Sync Endpoint

### POST /sync

Single endpoint syncs all data types atomically:

```json
{
  "userId": "device-xxx",
  "lastSyncTime": 1234567890,
  "data": {
    "videoSessions": [...],
    "browserSessions": [...],
    "dailyStats": {"2026-02-10": {...}},
    "scrollEvents": [...],
    "thumbnailEvents": [...],
    "pageEvents": [...],
    "videoWatchEvents": [...],
    "recommendationEvents": [...],
    "interventionEvents": [...],
    "moodReports": [...]
  }
}
```

**Benefits:**
- One HTTP request per sync
- Atomic transaction
- Simpler client code

### Query Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /sync/videos` | Query synced video sessions |
| `GET /sync/stats/{date}` | Query daily stats by date |
| `GET /stats/*` | Analytics endpoints |

## Background Script (packages/extension/src/background/index.ts)

### Sync Features
- All events batched in memory queues
- Single `POST /sync` call sends everything
- Automatic retry on failure
- Sync every 5 minutes or when queue > 100 events
- Manual trigger via `SYNC_NOW` message
- Status via `GET_SYNC_STATUS` message
- Bounded queue sizes (max 500 per type)

## Testing

### Build Extension
```bash
cd /home/ma/src/youtube-detox-extension
pnpm --filter @yt-detox/shared build
pnpm --filter @yt-detox/extension build
```

### Start Backend
```bash
cd packages/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Visit http://localhost:8000/docs
```

### Verify
```bash
curl http://localhost:8000/health
# {"status":"ok","version":"0.3.0"}
```

## Version
- Extension: 0.2.0 (v0.3.0 unified sync)
- Backend API: 0.3.0
