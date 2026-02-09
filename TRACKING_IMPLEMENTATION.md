# Comprehensive Tracking Implementation

## Summary

This document describes the comprehensive tracking system implemented for the YouTube Detox Chrome extension.

## Content Script Tracking (packages/extension/src/content/tracker.ts)

### Scroll Events
- `scroll_y` - Current scroll position
- `scroll_depth_percent` - Percentage of page scrolled
- `viewport_height` - Height of visible area
- `page_height` - Total page height
- `scroll_velocity` - Speed of scrolling (px/sec)
- `scroll_direction` - "up" or "down"
- `visible_video_count` - Number of thumbnails in viewport
- **Debounced** to 500ms intervals with batch processing

### Thumbnail Events
- Automatic detection via MutationObserver for:
  - `ytd-rich-item-renderer`
  - `ytd-compact-video-renderer`
  - `ytd-video-renderer`
  - `ytd-grid-video-renderer`
- `hover_duration_ms` - Time spent hovering
- `preview_played` - True if preview started (>3s hover)
- `preview_watch_ms` - Time watching preview
- `clicked` - Whether thumbnail was clicked
- `position_index` - Position in the feed/list
- `video_id`, `video_title`, `channel_name` scraped from DOM
- `title_caps_percent`, `title_length` - Clickbait indicators

### Page Events
- `page_type` changes (homepage, watch, shorts, search, subscriptions, etc.)
- `navigation_method` (click, back_button, direct, search)
- `search_query` when on search page
- `search_results_count` for search pages
- `time_on_page_ms` for each page visited
- `from_page_type` - Previous page

### Video Watch Events
- `play` / `pause` events with `pause_count`
- `seek` events with `seek_from`, `seek_to`, `seek_delta`
- `seek_count` per video
- `speed_change` with new `playback_speed`
- `ended` / `abandoned` with `watch_percent_at_abandon`
- `buffer` events for loading detection

### Tab/Visibility Tracking
- `tab_switch_count` per session
- `background_seconds` vs `active_seconds` (verified working)
- Events: `tab_visible`, `tab_hidden`

### Recommendation Events
- Sidebar recommendations tracked via MutationObserver
- `location`: sidebar, end_screen, home_feed, search_results, autoplay_queue
- `position_index` of recommendation
- `action`: ignored, hovered, clicked
- Autoplay tracking:
  - `autoplay_countdown_started`
  - `autoplay_cancelled`
  - `was_autoplay_next`

### Temporal Tracking
- `first_check_time` - First YouTube open of the day (HH:MM)
- `hourly_seconds` breakdown - Usage per hour
- `pre_sleep_active` - Detected if usage after 10pm
- `binge_session_active` - Detected if session >60 min continuous
- `session_duration_ms` tracking

## Backend Routes (packages/backend/app/api/routes/)

### New Route Files Created:

| File | Endpoint | Description |
|------|----------|-------------|
| `scroll.py` | POST `/scroll/events` | Batch scroll events |
| `thumbnails.py` | POST `/thumbnails/events` | Batch thumbnail hover/click events |
| `pages.py` | POST `/pages/events` | Batch page navigation events |
| `video_events.py` | POST `/video-events/events` | Batch video playback events |
| `recommendations.py` | POST `/recommendations/events` | Batch recommendation interactions |
| `interventions.py` | POST `/interventions/events` | Batch intervention events |
| `interventions.py` | GET `/interventions/events` | Retrieve intervention history |
| `interventions.py` | GET `/interventions/summary` | Effectiveness summary by type |
| `mood.py` | POST `/mood/reports` | Batch mood self-reports |
| `mood.py` | GET `/mood/reports` | Retrieve mood reports with stats |
| `mood.py` | GET `/mood/trends` | Daily mood trends over time |

All routes registered in `main.py` with proper prefixes and tags.

## Background Script Sync Service (packages/extension/src/background/index.ts)

### Event Batching
Events are stored in separate queues by type:
- `scroll`, `thumbnail`, `page`, `video_watch`, `recommendation`, `intervention`, `mood`

### Sync Features
- Individual endpoint sync per event type
- `last_sync` tracked per event type
- Offline queue with automatic retry
- Configurable sync interval (default: 5 minutes)
- Bounded queue sizes (max 500 events per type)
- Retry count tracking
- Manual sync via `SYNC_NOW` message
- Status check via `GET_SYNC_STATUS` message

### New Message Types
- `SYNC_NOW` - Trigger immediate sync
- `GET_SYNC_STATUS` - Get sync state information
- `BATCH_EVENTS` - Queue events by type

## Shared Types (packages/shared/src/index.ts)

### New Types Added
- `EventQueues` - Type for all event queue arrays
- `SyncState` - Sync status tracking
- `SyncStatusResponse` - Response for sync status queries
- `TemporalData` - Temporal tracking data structure

### Updated Types
- `RecommendationEvent` - Made `videoTitle` and `channelName` optional
- `MessageType` - Added new sync-related message types

## Testing

### Build Extension
```bash
cd /home/ma/src/youtube-detox-extension
pnpm --filter @yt-detox/shared build
pnpm --filter @yt-detox/extension build
```

### Verify Backend Routes
```bash
cd packages/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Visit http://localhost:8000/docs for OpenAPI documentation
```

### API Endpoints Overview
```
GET  /                          - API info
GET  /health                    - Health check
POST /sync/sessions             - Sync sessions and stats
POST /sync/events               - Sync all events (legacy)
POST /scroll/events             - Batch scroll events
POST /thumbnails/events         - Batch thumbnail events  
POST /pages/events              - Batch page events
POST /video-events/events       - Batch video events
POST /recommendations/events    - Batch recommendation events
POST /interventions/events      - Batch intervention events
GET  /interventions/events      - Get intervention history
GET  /interventions/summary     - Get effectiveness summary
POST /mood/reports              - Batch mood reports
GET  /mood/reports              - Get mood reports with stats
GET  /mood/trends               - Get daily mood trends
```

## Implementation Notes

1. **Performance**: All scroll events are debounced to 500ms with batch processing to avoid performance issues.

2. **Storage**: Events use `chrome.storage.local` for queuing with bounded sizes to prevent memory issues.

3. **IDs**: All events include `user_id` (from backend settings) and `session_id` (browser session ID).

4. **Offline Handling**: Failed syncs move events to an offline queue that retries automatically every 15 minutes.

5. **Thumbnail Detection**: Uses MutationObserver for automatic detection of new thumbnails as YouTube loads content dynamically.

6. **Autoplay Detection**: Monitors for `.ytp-autonav-endscreen-countdown-overlay` to detect autoplay countdown states.

## Version
- Extension: 0.2.0
- Backend API: 0.3.0
