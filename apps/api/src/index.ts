import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { checkConnection } from './db/index.js';
import { ensureBucket } from './services/storage.service.js';

async function main() {
  try {
    await checkConnection();

    // Ensure MinIO bucket exists
    try {
      await ensureBucket();
      logger.info('MinIO bucket ready');
    } catch (err) {
      logger.warn({ err }, 'MinIO not available - file storage disabled');
    }

    const app = await buildApp();

    await app.listen({
      port: env.API_PORT,
      host: '0.0.0.0',
    });

    logger.info({ port: env.API_PORT, host: env.API_HOST }, 'Server started');
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
