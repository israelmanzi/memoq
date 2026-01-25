import { buildApp } from './app.js';
import { env } from './config/env.js';
import { checkConnection } from './db/index.js';

async function main() {
  try {
    await checkConnection();

    const app = await buildApp();

    await app.listen({
      port: env.API_PORT,
      host: '0.0.0.0',
    });

    console.log(`Server running at http://${env.API_HOST}:${env.API_PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
