import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { initDb } from "./db/index.js";
import { ensureBucket } from "./services/storage.service.js";

async function main() {
    try {
        // DB bootstrap (blocks until Docker DNS + Postgres are ready)
        await initDb();

        // MinIO is non-critical
        try {
            await ensureBucket();
            logger.info("MinIO bucket ready");
        } catch (err) {
            logger.warn({ err }, "MinIO not available - file storage disabled");
        }

        const app = await buildApp();

        await app.listen({
            port: env.API_PORT,
            host: "0.0.0.0",
        });

        logger.info({ port: env.API_PORT, host: "0.0.0.0" }, "Server started");
    } catch (err) {
        logger.fatal({ err }, "Failed to start server");
        process.exit(1);
    }
}

main();
