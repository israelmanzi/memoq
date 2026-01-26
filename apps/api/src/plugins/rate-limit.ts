import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { getRedisClient, isRedisEnabled } from '../services/redis.service.js';
import { logger } from '../config/logger.js';

async function rateLimitPlugin(app: FastifyInstance) {
  // Configure Redis store if available
  let redisStore: any = undefined;

  if (isRedisEnabled()) {
    try {
      const redis = getRedisClient();
      redisStore = {
        get: async (key: string) => {
          const val = await redis.get(key);
          return val ? JSON.parse(val) : null;
        },
        set: async (key: string, value: { current: number; ttl: number }) => {
          const ttl = Math.ceil(value.ttl / 1000); // Convert to seconds
          await redis.setex(key, ttl, JSON.stringify(value));
        },
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Redis rate limit store, using in-memory');
    }
  }

  // Register global rate limiter
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    redis: redisStore,
    keyGenerator: (request: FastifyRequest) => {
      // Use user ID if authenticated, otherwise use IP
      const user = request.user as { userId?: string } | undefined;
      if (user?.userId) {
        return `ratelimit:user:${user.userId}`;
      }
      return `ratelimit:ip:${request.ip}`;
    },
    errorResponseBuilder: (_request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: Math.ceil(context.ttl / 1000),
      };
    },
  });

  // Add stricter rate limits for specific routes
  app.addHook('onRoute', (routeOptions) => {
    const { url, method } = routeOptions;

    // Stricter limits for auth routes
    if (url.startsWith('/api/v1/auth/')) {
      // Login - 10 attempts per minute
      if (url === '/api/v1/auth/login' && method === 'POST') {
        routeOptions.config = {
          ...routeOptions.config,
          rateLimit: {
            max: 10,
            timeWindow: 60000, // 1 minute
          },
        };
      }

      // Register - 5 attempts per minute
      if (url === '/api/v1/auth/register' && method === 'POST') {
        routeOptions.config = {
          ...routeOptions.config,
          rateLimit: {
            max: 5,
            timeWindow: 60000,
          },
        };
      }

      // MFA verification - 5 attempts per minute
      if ((url === '/api/v1/auth/verify-mfa' || url === '/api/v1/auth/mfa-setup-verify') && method === 'POST') {
        routeOptions.config = {
          ...routeOptions.config,
          rateLimit: {
            max: 5,
            timeWindow: 60000,
          },
        };
      }

      // Password reset request - 3 per minute
      if (url === '/api/v1/auth/forgot-password' && method === 'POST') {
        routeOptions.config = {
          ...routeOptions.config,
          rateLimit: {
            max: 3,
            timeWindow: 60000,
          },
        };
      }
    }
  });
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
});
