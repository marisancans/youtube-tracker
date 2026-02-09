import type { FastifyInstance } from 'fastify';

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/status', async () => {
    return {
      message: 'Auth not yet implemented. Using X-User-Id header for now.',
      status: 501,
    };
  });
}
