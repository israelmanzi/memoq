import postgres from 'postgres';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export async function checkConnection(): Promise<void> {
  try {
    await sql`SELECT 1`;
    logger.info('Database connected');
  } catch (error) {
    logger.error({ err: error }, 'Database connection failed');
    throw error;
  }
}
