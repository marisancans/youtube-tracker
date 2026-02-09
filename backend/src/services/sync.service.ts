import { getClient, query } from '../db/index.js';

interface WatchSession {
  id?: string;
  videoId: string;
  title?: string;
  channel?: string;
  durationSeconds?: number;
  watchedSeconds?: number;
  watchedPercent?: number;
  source?: string;
  isShort?: boolean;
  playbackSpeed?: number;
  productivityRating?: number | null;
  ratedAt?: number | null;
  timestamp: number;
}

interface BrowserSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  activeSeconds?: number;
  backgroundSeconds?: number;
  durationSeconds?: number;
  videos?: string[];
  shortsCount?: number;
  autoplayCount?: number;
  recommendationClicks?: number;
  searchCount?: number;
}

export async function syncSessions(
  userId: string,
  sessions: WatchSession[],
  browserSessions: BrowserSession[],
) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Ensure user exists
    await client.query(
      `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId],
    );

    // Upsert watch sessions
    for (const s of sessions) {
      await client.query(
        `INSERT INTO watch_sessions (id, user_id, video_id, title, channel, duration_seconds, watched_seconds, watched_percent, source, is_short, playback_speed, productivity_rating, rated_at, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           productivity_rating = COALESCE(EXCLUDED.productivity_rating, watch_sessions.productivity_rating),
           rated_at = COALESCE(EXCLUDED.rated_at, watch_sessions.rated_at)`,
        [
          s.id || `${userId}-${s.videoId}-${s.timestamp}`,
          userId,
          s.videoId,
          s.title || null,
          s.channel || null,
          s.durationSeconds || 0,
          s.watchedSeconds || 0,
          s.watchedPercent || 0,
          s.source || null,
          s.isShort || false,
          s.playbackSpeed || 1,
          s.productivityRating ?? null,
          s.ratedAt ? new Date(s.ratedAt) : null,
          new Date(s.timestamp),
        ],
      );
    }

    // Upsert browser sessions
    for (const bs of browserSessions) {
      await client.query(
        `INSERT INTO browser_sessions (id, user_id, started_at, ended_at, active_seconds, background_seconds, duration_seconds, video_count, shorts_count, autoplay_count, recommendation_clicks, search_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           ended_at = EXCLUDED.ended_at,
           active_seconds = EXCLUDED.active_seconds,
           background_seconds = EXCLUDED.background_seconds,
           duration_seconds = EXCLUDED.duration_seconds`,
        [
          bs.id,
          userId,
          new Date(bs.startedAt),
          bs.endedAt ? new Date(bs.endedAt) : null,
          bs.activeSeconds || 0,
          bs.backgroundSeconds || 0,
          bs.durationSeconds || 0,
          bs.videos?.length || 0,
          bs.shortsCount || 0,
          bs.autoplayCount || 0,
          bs.recommendationClicks || 0,
          bs.searchCount || 0,
        ],
      );
    }

    // Log sync
    await client.query(
      `INSERT INTO sync_logs (user_id, sessions_count, browser_sessions_count)
       VALUES ($1, $2, $3)`,
      [userId, sessions.length, browserSessions.length],
    );

    await client.query('COMMIT');

    return {
      sessionsUpserted: sessions.length,
      browserSessionsUpserted: browserSessions.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
