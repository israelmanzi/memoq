import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as schema from './schema.js';

const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
});

export const db = drizzle(client, { schema });

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkConnection(retries = 5, delay = 3000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await client`SELECT 1`;
      logger.info('Database connected');
      return;
    } catch (error) {
      logger.warn({ err: error, attempt, retries }, 'Database connection attempt failed');
      if (attempt === retries) {
        logger.error({ err: error }, 'Database connection failed after all retries');
        throw error;
      }
      logger.info(`Retrying database connection in ${delay / 1000}s...`);
      await sleep(delay);
      delay = Math.min(delay * 1.5, 15000); // exponential backoff, max 15s
    }
  }
}

// Re-export schema for convenience
export * from './schema.js';
