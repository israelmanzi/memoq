import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { Sql } from "postgres";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import * as schema from "./schema.js";

let client: Sql | null = null;
export let db: PostgresJsDatabase<typeof schema>;

function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

export async function initDb(retries = 10, delay = 2000): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            client = postgres(env.DATABASE_URL, {
                max: 10,
                idle_timeout: 20,
                connect_timeout: 10,
            });

            await client`select 1`;

            db = drizzle(client, { schema });

            logger.info("Database connected");
            return;
        } catch (err) {
            logger.warn({ err, attempt }, "Database connection failed");

            if (client) {
                await client.end({ timeout: 5 });
                client = null;
            }

            if (attempt === retries) throw err;

            await sleep(delay);
            delay = Math.min(delay * 1.5, 15000);
        }
    }
}

// Re-export schema for convenience
export * from './schema.js';
