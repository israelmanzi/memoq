import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import authPlugin from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { orgRoutes } from './routes/organizations.js';
import { tmRoutes } from './routes/tm.js';
import { projectRoutes } from './routes/projects.js';
import { documentRoutes } from './routes/documents.js';
import { tbRoutes } from './routes/tb.js';
import { activityRoutes } from './routes/activity.js';
import { searchRoutes } from './routes/search.js';
import { mfaRoutes } from './routes/mfa.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
  });

  // Plugins
  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? env.APP_URL : true,
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
  await app.register(orgRoutes, { prefix: '/api/v1/organizations' });
  await app.register(tmRoutes, { prefix: '/api/v1/tm' });
  await app.register(projectRoutes, { prefix: '/api/v1/projects' });
  await app.register(documentRoutes, { prefix: '/api/v1/documents' });
  await app.register(tbRoutes, { prefix: '/api/v1/tb' });
  await app.register(activityRoutes, { prefix: '/api/v1/activity' });
  await app.register(searchRoutes, { prefix: '/api/v1/search' });
  await app.register(mfaRoutes, { prefix: '/api/v1/mfa' });

  return app;
}
