import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './routes/auth.js';
import { syncRoutes } from './routes/sync.js';
import { statsRoutes } from './routes/stats.js';
import { closePool } from './db/index.js';

const app = Fastify({ logger: true });

// Plugins
await app.register(cors, { origin: true });

// Error handler
app.setErrorHandler(errorHandler);

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
await app.register(authRoutes);
await app.register(syncRoutes);
await app.register(statsRoutes);

// Graceful shutdown
const shutdown = async () => {
  console.log('[API] Shutting down...');
  await app.close();
  await closePool();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[API] Listening on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
