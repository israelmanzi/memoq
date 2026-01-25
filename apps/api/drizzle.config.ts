import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load .env from monorepo root or local
const rootEnv = resolve(process.cwd(), '../../.env');
const localEnv = resolve(process.cwd(), '.env');

if (existsSync(localEnv)) {
  config({ path: localEnv });
} else if (existsSync(rootEnv)) {
  config({ path: rootEnv });
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
