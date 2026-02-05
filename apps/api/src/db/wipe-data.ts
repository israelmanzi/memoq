/**
 * Data Wipe Script
 * Completely wipes all data from PostgreSQL, Redis, and MinIO
 * USE WITH CAUTION - THIS WILL DELETE ALL DATA
 */

import { db, initDb } from './index.js';
import { sql } from 'drizzle-orm';
import { getRedisClient, initRedis, isRedisEnabled } from '../services/redis.service.js';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

// S3/MinIO client
const s3Client = new S3Client({
  endpoint: `http${env.MINIO_USE_SSL ? 's' : ''}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

async function wipePostgreSQL() {
  console.log('🗑️  Wiping PostgreSQL database...');

  try {
    // Disable foreign key checks temporarily
    await db.execute(sql`SET session_replication_role = 'replica';`);

    // Get all tables in public schema
    const result = await db.execute<{ tablename: string }>(sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    const tables = Array.isArray(result) ? result : (result as any).rows || [];
    console.log(`  Found ${tables.length} tables to truncate`);

    // Truncate all tables
    for (const table of tables) {
      const tableName = table.tablename;
      console.log(`  Truncating: ${tableName}`);
      await db.execute(sql.raw(`TRUNCATE TABLE "${tableName}" CASCADE;`));
    }

    // Re-enable foreign key checks
    await db.execute(sql`SET session_replication_role = 'origin';`);

    console.log('  ✅ PostgreSQL data wiped successfully\n');
  } catch (error) {
    console.error('  ❌ Error wiping PostgreSQL:', error);
    throw error;
  }
}

async function wipeRedis() {
  console.log('🗑️  Wiping Redis cache...');

  try {
    if (!isRedisEnabled()) {
      console.log('  ⚠️  Redis is not enabled, skipping...\n');
      return;
    }

    await initRedis();

    const client = getRedisClient();
    if (!client) {
      console.log('  ⚠️  Redis client not initialized, skipping...\n');
      return;
    }

    // Flush all Redis data
    await client.flushdb();

    console.log('  ✅ Redis cache wiped successfully\n');
  } catch (error) {
    console.error('  ❌ Error wiping Redis:', error);
    // Don't throw - Redis is optional
    console.log('  ⚠️  Continuing despite Redis error...\n');
  }
}

async function wipeMinIO() {
  console.log('🗑️  Wiping MinIO storage...');

  try {
    const bucketName = env.MINIO_BUCKET;

    console.log(`  Removing all objects from bucket: ${bucketName}`);

    // List all objects in bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
    });

    const listResponse = await s3Client.send(listCommand);
    const objects = listResponse.Contents || [];

    console.log(`  Found ${objects.length} objects to delete`);

    if (objects.length > 0) {
      // Delete all objects
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: objects.map((obj) => ({ Key: obj.Key! })),
          Quiet: false,
        },
      });

      await s3Client.send(deleteCommand);
      console.log(`  Deleted ${objects.length} objects`);
    }

    console.log('  ✅ MinIO storage wiped successfully\n');
  } catch (error: any) {
    console.error('  ❌ Error wiping MinIO:', error);
    // Don't throw - MinIO is optional
    console.log('  ⚠️  Continuing despite MinIO error...\n');
  }
}

async function wipeAllData() {
  console.log('═══════════════════════════════════════════');
  console.log('⚠️  DATA WIPE SCRIPT');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('This will DELETE ALL DATA from:');
  console.log('  • PostgreSQL (all tables)');
  console.log('  • Redis (all cache)');
  console.log('  • MinIO (all files)');
  console.log('');
  console.log('Starting in 3 seconds...');
  console.log('Press Ctrl+C to cancel');
  console.log('');

  // Wait 3 seconds to allow cancellation
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Starting data wipe...\n');

  try {
    // Initialize database connection
    await initDb();

    // Wipe in order: Redis (cache), MinIO (files), PostgreSQL (DB)
    await wipeRedis();
    await wipeMinIO();
    await wipePostgreSQL();

    console.log('═══════════════════════════════════════════');
    console.log('✅ ALL DATA WIPED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('Database is now completely empty.');
    console.log('Run seed script to populate with test data:');
    console.log('  pnpm --filter @oxy/api tsx src/db/seed-test-data.ts');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('═══════════════════════════════════════════');
    console.error('❌ DATA WIPE FAILED');
    console.error('═══════════════════════════════════════════');
    console.error('');
    console.error('Error:', error);
    console.error('');
    console.error('Database may be in an inconsistent state.');
    console.error('You may need to manually reset the database.');
    console.error('');
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  wipeAllData();
}

export { wipeAllData, wipePostgreSQL, wipeRedis, wipeMinIO };
