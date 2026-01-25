import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import authPlugin from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
  });

  // Plugins
  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Auth middleware (adds app.authenticate decorator)
  await app.register(authPlugin);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  return app;
}
