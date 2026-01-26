import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let redisClient: Redis | null = null;
let isConnected = false;

/**
 * Get or create the Redis client singleton
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    if (!env.REDIS_URL) {
      throw new Error('REDIS_URL is not configured');
    }

    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      isConnected = true;
      logger.info('Redis connected');
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      logger.error({ err }, 'Redis error');
    });

    redisClient.on('close', () => {
      isConnected = false;
      logger.info('Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  return redisClient;
}

/**
 * Initialize Redis connection
 */
export async function initRedis(): Promise<void> {
  if (!env.REDIS_URL) {
    logger.info('Redis not configured, skipping initialization');
    return;
  }

  const client = getRedisClient();
  await client.connect();
}

/**
 * Check if Redis is enabled
 */
export function isRedisEnabled(): boolean {
  return !!env.REDIS_URL;
}

/**
 * Check if Redis is currently connected
 */
export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null;
}

/**
 * Health check for Redis
 */
export async function checkRedisHealth(): Promise<{ status: 'ok' | 'error'; latency?: number; error?: string }> {
  if (!isRedisEnabled()) {
    return { status: 'ok', error: 'Redis not configured' };
  }

  if (!redisClient) {
    return { status: 'error', error: 'Redis client not initialized' };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;
    return { status: 'ok', latency };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    logger.info('Closing Redis connection...');
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    logger.info('Redis connection closed');
  }
}

/**
 * Get Redis connection for BullMQ (returns a new connection)
 * BullMQ requires separate connections for queue and worker
 */
export function createRedisConnection(): Redis {
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is not configured');
  }

  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
  });
}
