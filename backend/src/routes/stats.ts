import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/index.js';

function getUserId(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.headers['x-user-id'] as string;
  if (!userId) {
    reply.status(400).send({ error: 'X-User-Id header required' });
    return null;
  }
  return userId;
}

export async function statsRoutes(app: FastifyInstance) {
  // Daily stats
  app.get('/stats/daily', async (request, reply) => {
    const userId = getUserId(request, reply);
    if (!userId) return;

    const { date } = request.query as { date?: string };
    const targetDate = date || new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT
        COUNT(*) as video_count,
        COALESCE(SUM(watched_seconds), 0) as total_seconds,
        COUNT(*) FILTER (WHERE is_short) as shorts_count,
        COUNT(*) FILTER (WHERE productivity_rating = 1) as productive_videos,
        COUNT(*) FILTER (WHERE productivity_rating = -1) as unproductive_videos,
        COUNT(*) FILTER (WHERE productivity_rating = 0) as neutral_videos
       FROM watch_sessions
       WHERE user_id = $1 AND timestamp::date = $2`,
      [userId, targetDate],
    );

    return { date: targetDate, ...result.rows[0] };
  });

  // Weekly stats
  app.get('/stats/weekly', async (request, reply) => {
    const userId = getUserId(request, reply);
    if (!userId) return;

    const result = await query(
      `SELECT
        timestamp::date as date,
        COUNT(*) as video_count,
        COALESCE(SUM(watched_seconds), 0) as total_seconds,
        COUNT(*) FILTER (WHERE is_short) as shorts_count
       FROM watch_sessions
       WHERE user_id = $1 AND timestamp >= NOW() - INTERVAL '7 days'
       GROUP BY timestamp::date
       ORDER BY date`,
      [userId],
    );

    return { days: result.rows };
  });

  // Channel breakdown
  app.get('/stats/channels', async (request, reply) => {
    const userId = getUserId(request, reply);
    if (!userId) return;

    const { days } = request.query as { days?: string };
    const daysNum = parseInt(days || '30', 10);

    const result = await query(
      `SELECT
        channel,
        COUNT(*) as video_count,
        COALESCE(SUM(watched_seconds), 0) as total_seconds,
        ROUND(AVG(watched_percent)) as avg_watched_percent
       FROM watch_sessions
       WHERE user_id = $1 AND timestamp >= NOW() - ($2 || ' days')::INTERVAL AND channel IS NOT NULL
       GROUP BY channel
       ORDER BY total_seconds DESC
       LIMIT 20`,
      [userId, daysNum.toString()],
    );

    return { channels: result.rows };
  });
}
