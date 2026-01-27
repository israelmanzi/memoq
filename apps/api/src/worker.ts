import dns from "node:dns";
import { Worker, Job } from 'bullmq';
import { createRedisConnection, isRedisEnabled } from './services/redis.service.js';
import { QUEUE_NAME, type JobData, type JobResult } from './services/queue.service.js';
import { handlePreTranslate } from './workers/handlers/pre-translate.handler.js';
import { handleParseDocument } from './workers/handlers/parse-document.handler.js';
import { handleExportPdf } from './workers/handlers/export-pdf.handler.js';
import { logger } from './config/logger.js';

// Force IPv4 first - Docker DNS can return IPv6 which may not route correctly
dns.setDefaultResultOrder("ipv4first");

let worker: Worker | null = null;

async function processJob(job: Job<JobData>): Promise<JobResult> {
  logger.info({ jobId: job.id, type: job.name }, 'Processing job');

  switch (job.name) {
    case 'pre-translate':
      return handlePreTranslate(job as any);
    case 'parse-document':
      return handleParseDocument(job as any);
    case 'export-pdf':
      return handleExportPdf(job as any);
    default:
      logger.warn({ jobId: job.id, type: job.name }, 'Unknown job type');
      return {
        success: false,
        error: `Unknown job type: ${job.name}`,
      };
  }
}

async function startWorker(): Promise<void> {
  if (!isRedisEnabled()) {
    logger.error('Redis is not configured. Worker cannot start.');
    process.exit(1);
  }

  logger.info('Starting worker...');

  const connection = createRedisConnection();

  worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: 5, // Process up to 5 jobs concurrently
  });

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, type: job.name, success: result?.success }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, type: job?.name, err }, 'Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Job stalled');
  });

  logger.info({ queue: QUEUE_NAME }, 'Worker started');
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down worker...');

  if (worker) {
    // Close the worker and wait for current jobs to finish (with timeout)
    await worker.close();
    logger.info('Worker closed');
  }

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection');
});

// Start the worker
startWorker().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
