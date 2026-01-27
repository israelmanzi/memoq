import { config } from 'dotenv';
import { z } from 'zod';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load .env - check multiple locations for monorepo compatibility
const envPaths = [
  resolve(process.cwd(), '.env'),           // Current directory (production)
  resolve(process.cwd(), '../../.env'),     // Monorepo root (development)
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}
// In Docker, env vars are passed via docker-compose, so no .env file needed

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default('localhost'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('OXY <noreply@resend.dev>'),
  // App URL for email links
  APP_URL: z.string().default('http://localhost:5063'),
  // MinIO / S3 Storage
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z.string().transform((v) => v === 'true').default('false'),
  MINIO_ROOT_USER: z.string().default('minioadmin'),
  MINIO_ROOT_PASSWORD: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('oxy-documents'),
  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000), // 1 minute in ms
  // Cache TTLs (in seconds)
  CACHE_TM_MATCH_TTL: z.coerce.number().default(3600), // 1 hour
  CACHE_TB_MATCH_TTL: z.coerce.number().default(3600), // 1 hour
  // Session TTL (in seconds)
  SESSION_TTL: z.coerce.number().default(604800), // 7 days
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
