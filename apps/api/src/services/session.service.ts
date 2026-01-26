import { getRedisClient, isRedisEnabled } from './redis.service.js';
import { env } from '../config/env.js';
import { nanoid } from 'nanoid';

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

export interface SessionMetadata {
  userAgent?: string;
  ip?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface Session extends SessionMetadata {
  tokenId: string;
  userId: string;
}

/**
 * Generate a unique token ID for session tracking
 */
export function generateTokenId(): string {
  return nanoid(32);
}

/**
 * Create a new session for a user
 */
export async function createSession(
  userId: string,
  tokenId: string,
  metadata: Partial<SessionMetadata> = {}
): Promise<void> {
  if (!isRedisEnabled()) {
    return; // Sessions disabled when Redis not available
  }

  const redis = getRedisClient();
  const now = Date.now();

  const sessionData: SessionMetadata = {
    userAgent: metadata.userAgent,
    ip: metadata.ip,
    createdAt: now,
    lastActiveAt: now,
  };

  const sessionKey = `${SESSION_PREFIX}${tokenId}`;
  const userSessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;

  // Store session data with TTL
  await redis.setex(
    sessionKey,
    env.SESSION_TTL,
    JSON.stringify({ userId, ...sessionData })
  );

  // Add token to user's session set with expiry timestamp as score
  await redis.zadd(userSessionsKey, now + env.SESSION_TTL * 1000, tokenId);

  // Set expiry on user sessions set
  await redis.expire(userSessionsKey, env.SESSION_TTL);
}

/**
 * Validate if a session exists and is valid
 */
export async function validateSession(tokenId: string): Promise<{ valid: boolean; userId?: string }> {
  if (!isRedisEnabled()) {
    return { valid: true }; // Skip validation when Redis not available
  }

  const redis = getRedisClient();
  const sessionKey = `${SESSION_PREFIX}${tokenId}`;

  const data = await redis.get(sessionKey);
  if (!data) {
    return { valid: false };
  }

  const session = JSON.parse(data) as Session;

  // Update last active timestamp
  const now = Date.now();
  session.lastActiveAt = now;
  await redis.setex(sessionKey, env.SESSION_TTL, JSON.stringify(session));

  return { valid: true, userId: session.userId };
}

/**
 * Invalidate a single session (logout current device)
 */
export async function invalidateSession(tokenId: string): Promise<void> {
  if (!isRedisEnabled()) {
    return;
  }

  const redis = getRedisClient();
  const sessionKey = `${SESSION_PREFIX}${tokenId}`;

  // Get session to find userId
  const data = await redis.get(sessionKey);
  if (data) {
    const session = JSON.parse(data) as Session;
    const userSessionsKey = `${USER_SESSIONS_PREFIX}${session.userId}`;

    // Remove from user's session set
    await redis.zrem(userSessionsKey, tokenId);
  }

  // Delete session
  await redis.del(sessionKey);
}

/**
 * Invalidate all sessions for a user (logout all devices)
 */
export async function invalidateAllUserSessions(userId: string): Promise<number> {
  if (!isRedisEnabled()) {
    return 0;
  }

  const redis = getRedisClient();
  const userSessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;

  // Get all session token IDs for this user
  const tokenIds = await redis.zrange(userSessionsKey, 0, -1);

  if (tokenIds.length === 0) {
    return 0;
  }

  // Delete all session data
  const sessionKeys = tokenIds.map((id) => `${SESSION_PREFIX}${id}`);
  await redis.del(...sessionKeys);

  // Clear user's session set
  await redis.del(userSessionsKey);

  return tokenIds.length;
}

/**
 * List all active sessions for a user
 */
export async function listUserSessions(userId: string): Promise<Session[]> {
  if (!isRedisEnabled()) {
    return [];
  }

  const redis = getRedisClient();
  const userSessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;
  const now = Date.now();

  // Remove expired sessions from the set
  await redis.zremrangebyscore(userSessionsKey, 0, now);

  // Get all active session token IDs
  const tokenIds = await redis.zrange(userSessionsKey, 0, -1);

  if (tokenIds.length === 0) {
    return [];
  }

  // Fetch all session data
  const sessions: Session[] = [];
  for (const tokenId of tokenIds) {
    const sessionKey = `${SESSION_PREFIX}${tokenId}`;
    const data = await redis.get(sessionKey);
    if (data) {
      const sessionData = JSON.parse(data) as SessionMetadata & { userId: string };
      sessions.push({
        tokenId,
        ...sessionData,
      });
    }
  }

  // Sort by last active (most recent first)
  return sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/**
 * Get session count for a user
 */
export async function getUserSessionCount(userId: string): Promise<number> {
  if (!isRedisEnabled()) {
    return 0;
  }

  const redis = getRedisClient();
  const userSessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;
  const now = Date.now();

  // Remove expired sessions
  await redis.zremrangebyscore(userSessionsKey, 0, now);

  return redis.zcard(userSessionsKey);
}
