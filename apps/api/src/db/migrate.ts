import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sql } from './index.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  logger.info('Running database migrations...');

  try {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    await sql.unsafe(schema);

    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error({ err: error }, 'Migration failed');
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
