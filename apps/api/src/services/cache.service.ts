import { createHash } from 'crypto';
import { getRedisClient, isRedisEnabled } from './redis.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const CACHE_PREFIX = 'cache:';
const TAG_PREFIX = 'tag:';

export interface CacheOptions {
  ttl?: number; // TTL in seconds
  tags?: string[]; // Tags for bulk invalidation
}

/**
 * Generate a hash for cache key components
 */
export function hashKey(...parts: (string | number | string[] | number[])[]): string {
  const normalized = parts.map((p) => {
    if (Array.isArray(p)) {
      return p.sort().join(',');
    }
    return String(p);
  }).join(':');

  return createHash('md5').update(normalized).digest('hex').substring(0, 12);
}

// ============ Cache Key Builders ============

export const cacheKeys = {
  tmFuzzyMatch: (tmIds: string[], sourceHash: string, minMatch: number) =>
    `${CACHE_PREFIX}tm:fuzzy:${hashKey(tmIds)}:${sourceHash}:${minMatch}`,

  tmConcordance: (tmIds: string[], queryHash: string, searchIn: string) =>
    `${CACHE_PREFIX}tm:concordance:${hashKey(tmIds)}:${queryHash}:${searchIn}`,

  tmStats: (tmId: string) => `${CACHE_PREFIX}tm:stats:${tmId}`,

  tbMatch: (tbIds: string[], textHash: string) =>
    `${CACHE_PREFIX}tb:match:${hashKey(tbIds)}:${textHash}`,

  tbStats: (tbId: string) => `${CACHE_PREFIX}tb:stats:${tbId}`,
};

// ============ Tag Builders ============

export const cacheTags = {
  tm: (tmId: string) => `tm:${tmId}`,
  tb: (tbId: string) => `tb:${tbId}`,
};

// ============ Cache Operations ============

/**
 * Get a value from cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  if (!isRedisEnabled()) {
    return null;
  }

  try {
    const redis = getRedisClient();
    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as T;
  } catch (err) {
    logger.warn({ err, key }, 'Cache get error');
    return null;
  }
}

/**
 * Set a value in cache with optional TTL and tags
 */
export async function setCache<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  if (!isRedisEnabled()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    const ttl = options.ttl ?? env.CACHE_TM_MATCH_TTL;

    // Set the cache value
    await redis.setex(key, ttl, serialized);

    // Associate with tags for bulk invalidation
    if (options.tags && options.tags.length > 0) {
      const now = Date.now();
      const expiryScore = now + ttl * 1000;

      for (const tag of options.tags) {
        const tagKey = `${TAG_PREFIX}${tag}`;
        // Use sorted set with expiry timestamp as score
        await redis.zadd(tagKey, expiryScore, key);
        // Set tag expiry slightly longer than max TTL
        await redis.expire(tagKey, ttl + 60);
      }
    }
  } catch (err) {
    logger.warn({ err, key }, 'Cache set error');
  }
}

/**
 * Delete a specific cache key
 */
export async function deleteCache(key: string): Promise<void> {
  if (!isRedisEnabled()) {
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (err) {
    logger.warn({ err, key }, 'Cache delete error');
  }
}

/**
 * Invalidate all cache entries associated with a tag
 */
export async function invalidateCacheByTag(tag: string): Promise<number> {
  if (!isRedisEnabled()) {
    return 0;
  }

  try {
    const redis = getRedisClient();
    const tagKey = `${TAG_PREFIX}${tag}`;
    const now = Date.now();

    // Remove expired entries from the tag set
    await redis.zremrangebyscore(tagKey, 0, now);

    // Get all cache keys associated with this tag
    const cacheKeys = await redis.zrange(tagKey, 0, -1);

    if (cacheKeys.length === 0) {
      return 0;
    }

    // Delete all cache entries
    await redis.del(...cacheKeys);

    // Clear the tag set
    await redis.del(tagKey);

    logger.debug({ tag, count: cacheKeys.length }, 'Cache invalidated by tag');
    return cacheKeys.length;
  } catch (err) {
    logger.warn({ err, tag }, 'Cache invalidation error');
    return 0;
  }
}

/**
 * Invalidate multiple tags at once
 */
export async function invalidateCacheByTags(tags: string[]): Promise<number> {
  let total = 0;
  for (const tag of tags) {
    total += await invalidateCacheByTag(tag);
  }
  return total;
}

/**
 * Cache wrapper function - get or compute
 */
export async function withCache<T>(
  key: string,
  compute: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // Try to get from cache
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Compute the value
  const value = await compute();

  // Store in cache
  await setCache(key, value, options);

  return value;
}

/**
 * Clear all cache entries (for testing/admin purposes)
 */
export async function clearAllCache(): Promise<void> {
  if (!isRedisEnabled()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    const tagKeys = await redis.keys(`${TAG_PREFIX}*`);

    const allKeys = [...keys, ...tagKeys];
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
    }

    logger.info({ count: allKeys.length }, 'Cache cleared');
  } catch (err) {
    logger.warn({ err }, 'Clear cache error');
  }
}
