-- YouTube Detox - Initial Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watch_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  video_id TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  duration_seconds INTEGER DEFAULT 0,
  watched_seconds INTEGER DEFAULT 0,
  watched_percent INTEGER DEFAULT 0,
  source TEXT,
  is_short BOOLEAN DEFAULT FALSE,
  playback_speed REAL DEFAULT 1,
  productivity_rating SMALLINT,
  rated_at TIMESTAMPTZ,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watch_sessions_user_ts ON watch_sessions(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_watch_sessions_video ON watch_sessions(video_id);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  active_seconds INTEGER DEFAULT 0,
  background_seconds INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  shorts_count INTEGER DEFAULT 0,
  autoplay_count INTEGER DEFAULT 0,
  recommendation_clicks INTEGER DEFAULT 0,
  search_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_browser_sessions_user_ts ON browser_sessions(user_id, started_at);

CREATE TABLE IF NOT EXISTS daily_stats (
  user_id TEXT NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  total_seconds INTEGER DEFAULT 0,
  active_seconds INTEGER DEFAULT 0,
  background_seconds INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  shorts_count INTEGER DEFAULT 0,
  search_count INTEGER DEFAULT 0,
  recommendation_clicks INTEGER DEFAULT 0,
  autoplay_count INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  productive_videos INTEGER DEFAULT 0,
  unproductive_videos INTEGER DEFAULT 0,
  neutral_videos INTEGER DEFAULT 0,
  prompts_shown INTEGER DEFAULT 0,
  prompts_answered INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sessions_count INTEGER DEFAULT 0,
  browser_sessions_count INTEGER DEFAULT 0
);
