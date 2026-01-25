import { config } from 'dotenv';
import { z } from 'zod';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load .env from monorepo root
const rootEnv = resolve(process.cwd(), '../../.env');
const localEnv = resolve(process.cwd(), '.env');

if (existsSync(localEnv)) {
  config({ path: localEnv });
} else if (existsSync(rootEnv)) {
  config({ path: rootEnv });
} else {
  config(); // Fallback to default behavior
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default('localhost'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
