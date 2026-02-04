import { Queue, Job, JobsOptions } from 'bullmq';
import { createRedisConnection, isRedisEnabled } from './redis.service.js';
import { logger } from '../config/logger.js';

// Job type definitions
export type JobType =
  | 'pre-translate'
  | 'parse-document';

export interface PreTranslateJobData {
  documentId: string;
  tmIds: string[];
  minMatchPercent?: number;
  overwriteExisting?: boolean;
  userId: string;
}

export interface ParseDocumentJobData {
  projectId: string;
  filename: string;
  fileType: string;
  storageKey: string;
  userId: string;
}

export type JobData = PreTranslateJobData | ParseDocumentJobData;

export interface JobProgress {
  percent: number;
  stage?: string;
  message?: string;
}

export interface JobResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// Queue names
export const QUEUE_NAME = 'oxy-jobs';

let jobQueue: Queue | null = null;

/**
 * Get or create the job queue
 */
export function getQueue(): Queue | null {
  if (!isRedisEnabled()) {
    return null;
  }

  if (!jobQueue) {
    const connection = createRedisConnection();
    jobQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
          age: 3600, // Or jobs older than 1 hour
        },
        removeOnFail: {
          count: 50, // Keep last 50 failed jobs
          age: 86400, // Or jobs older than 1 day
        },
      },
    });

    jobQueue.on('error', (err) => {
      logger.error({ err }, 'Queue error');
    });
  }

  return jobQueue;
}

/**
 * Add a job to the queue
 */
export async function addJob<T extends JobData>(
  type: JobType,
  data: T,
  options?: JobsOptions
): Promise<{ jobId: string } | null> {
  const queue = getQueue();
  if (!queue) {
    logger.warn('Queue not available, job not added');
    return null;
  }

  const job = await queue.add(type, data, {
    ...options,
  });

  logger.info({ jobId: job.id, type }, 'Job added to queue');

  return { jobId: job.id ?? '' };
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string): Promise<{
  id: string;
  type: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
  progress?: JobProgress;
  result?: JobResult;
  error?: string;
  createdAt?: number;
  processedAt?: number;
  finishedAt?: number;
} | null> {
  const queue = getQueue();
  if (!queue) {
    return null;
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();

  // Map BullMQ states to our simplified states
  const statusMap: Record<string, 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown'> = {
    waiting: 'waiting',
    'waiting-children': 'waiting',
    active: 'active',
    completed: 'completed',
    failed: 'failed',
    delayed: 'delayed',
    prioritized: 'waiting',
    unknown: 'unknown',
  };

  return {
    id: job.id ?? jobId,
    type: job.name,
    status: statusMap[state] ?? 'unknown',
    progress: job.progress as JobProgress | undefined,
    result: state === 'completed' ? (job.returnvalue as JobResult) : undefined,
    error: state === 'failed' ? job.failedReason : undefined,
    createdAt: job.timestamp,
    processedAt: job.processedOn,
    finishedAt: job.finishedOn,
  };
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const queue = getQueue();
  if (!queue) {
    return null;
  }

  const job = await queue.getJob(jobId);
  return job ?? null;
}

/**
 * Close the queue connection
 */
export async function closeQueue(): Promise<void> {
  if (jobQueue) {
    await jobQueue.close();
    jobQueue = null;
    logger.info('Queue closed');
  }
}

/**
 * Check if queue is available
 */
export function isQueueEnabled(): boolean {
  return isRedisEnabled();
}
