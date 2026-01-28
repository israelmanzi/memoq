import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { Sql } from "postgres";
import { createConnection, Socket } from "net";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import * as schema from "./schema.js";

let client: Sql | null = null;
export let db: PostgresJsDatabase<typeof schema>;

function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

// Get database config from env
function getDbConfig() {
    return {
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD || "",
        database: env.DB_NAME,
    };
}

// Test raw TCP connectivity before attempting PostgreSQL connection
function testTcpConnection(host: string, port: number, timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
        const socket: Socket = createConnection({ host, port });
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error(`TCP connection to ${host}:${port} timed out after ${timeout}ms`));
        }, timeout);

        socket.on("connect", () => {
            clearTimeout(timer);
            socket.destroy();
            resolve();
        });

        socket.on("error", (err) => {
            clearTimeout(timer);
            socket.destroy();
            reject(new Error(`TCP connection to ${host}:${port} failed: ${err.message}`));
        });
    });
}

export async function initDb(retries = 15, delay = 2000): Promise<void> {
    const config = getDbConfig();
    // Build connection string from explicit params (more reliable)
    const connectionString = `postgresql://${config.user}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;

    logger.info({ host: config.host, port: config.port, database: config.database }, "Initializing database connection");

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // First, verify TCP connectivity
            logger.debug({ host: config.host, port: config.port, attempt }, "Testing TCP connectivity");
            await testTcpConnection(config.host, config.port, 5000);
            logger.debug({ host: config.host, port: config.port }, "TCP connection successful");

            // Now attempt PostgreSQL connection
            client = postgres(connectionString, {
                max: 10,
                idle_timeout: 20,
                connect_timeout: 15,
            });

            await client`SELECT 1`;

            db = drizzle(client, { schema });

            logger.info({ host: config.host, port: config.port, database: config.database }, "Database connected successfully");
            return;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.warn({ err: errorMessage, attempt, maxRetries: retries, host: config.host, port: config.port }, "Database connection failed");

            if (client) {
                try {
                    await client.end({ timeout: 5 });
                } catch {
                    // Ignore cleanup errors
                }
                client = null;
            }

            if (attempt === retries) {
                logger.error({ err: errorMessage, host: config.host, port: config.port }, "All database connection attempts exhausted");
                throw err;
            }

            logger.info({ nextAttemptIn: delay, attempt, maxRetries: retries }, "Retrying database connection");
            await sleep(delay);
            delay = Math.min(delay * 1.5, 15000);
        }
    }
}

// Re-export schema for convenience
export * from "./schema.js";
