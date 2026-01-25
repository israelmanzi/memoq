import postgres from 'postgres';
import { env } from '../config/env.js';

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export async function checkConnection(): Promise<void> {
  try {
    await sql`SELECT 1`;
    console.log('Database connected');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}
