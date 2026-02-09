import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { syncSessions } from '../services/sync.service.js';
import { query } from '../db/index.js';

function getUserId(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.headers['x-user-id'] as string;
  if (!userId) {
    reply.status(400).send({ error: 'X-User-Id header required' });
    return null;
  }
  return userId;
}

export async function syncRoutes(app: FastifyInstance) {
  // Upload sessions
  app.post('/sync/sessions', async (request, reply) => {
    const userId = getUserId(request, reply);
    if (!userId) return;

    const body = request.body as {
      sessions?: any[];
      browserSessions?: any[];
    };

    const result = await syncSessions(
      userId,
      body.sessions || [],
      body.browserSessions || [],
    );

    return { success: true, ...result };
  });

  // Download sessions since timestamp
  app.get('/sync/sessions', async (request, reply) => {
    const userId = getUserId(request, reply);
    if (!userId) return;

    const { since } = request.query as { since?: string };
    const sinceDate = since ? new Date(parseInt(since, 10)) : new Date(0);

    const sessions = await query(
      `SELECT * FROM watch_sessions WHERE user_id = $1 AND timestamp > $2 ORDER BY timestamp`,
      [userId, sinceDate],
    );

    const browserSessions = await query(
      `SELECT * FROM browser_sessions WHERE user_id = $1 AND started_at > $2 ORDER BY started_at`,
      [userId, sinceDate],
    );

    return {
      sessions: sessions.rows,
      browserSessions: browserSessions.rows,
    };
  });

  // Upload settings
  app.post('/sync/settings', async (request, reply) => {
    const userId = getUserId(request, reply);
    if (!userId) return;

    const body = request.body as { settings: any };

    // Ensure user exists
    await query(
      `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId],
    );

    await query(
      `INSERT INTO user_settings (user_id, settings, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET settings = $2, updated_at = NOW()`,
      [userId, JSON.stringify(body.settings || {})],
    );

    return { success: true };
  });

  // Download settings
  app.get('/sync/settings', async (request, reply) => {
    const userId = getUserId(request, reply);
    if (!userId) return;

    const result = await query(
      `SELECT settings FROM user_settings WHERE user_id = $1`,
      [userId],
    );

    return { settings: result.rows[0]?.settings || {} };
  });
}
