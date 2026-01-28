import Redis, { RedisOptions } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let redisClient: Redis | null = null;
let isConnected = false;

/**
 * Get Redis connection options from env
 */
function getRedisOptions(): RedisOptions {
  // Use explicit params for more reliable connections
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: true,
  };
}

/**
 * Get or create the Redis client singleton
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    const options = getRedisOptions();
    logger.info({ host: options.host, port: options.port }, 'Creating Redis client');

    redisClient = new Redis(options);

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
  if (!isRedisEnabled()) {
    logger.info('Redis not configured, skipping initialization');
    return;
  }

  const client = getRedisClient();
  await client.connect();
}

/**
 * Check if Redis is enabled (either via URL or explicit host)
 */
export function isRedisEnabled(): boolean {
  return !!(env.REDIS_URL || env.REDIS_HOST);
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
  if (!isRedisEnabled()) {
    throw new Error('Redis is not configured');
  }

  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
  });
}
