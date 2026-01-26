import { Job } from 'bullmq';
import type { PreTranslateJobData, JobResult } from '../../services/queue.service.js';
import { preTranslateDocument, refreshDocumentWorkflowStatus } from '../../services/project.service.js';
import { logger } from '../../config/logger.js';

export async function handlePreTranslate(job: Job<PreTranslateJobData>): Promise<JobResult> {
  const { documentId, tmIds, minMatchPercent = 75, overwriteExisting = false } = job.data;

  logger.info({ jobId: job.id, documentId }, 'Starting pre-translate job');

  try {
    // Update progress: starting
    await job.updateProgress({
      percent: 0,
      stage: 'starting',
      message: 'Initializing pre-translation...',
    });

    // Update progress: matching
    await job.updateProgress({
      percent: 20,
      stage: 'matching',
      message: 'Finding TM matches...',
    });

    // Perform pre-translation
    const result = await preTranslateDocument({
      documentId,
      tmIds,
      minMatchPercent,
      overwriteExisting,
    });

    // Update progress: updating segments
    await job.updateProgress({
      percent: 80,
      stage: 'updating',
      message: 'Updating document segments...',
    });

    // Refresh workflow status
    await refreshDocumentWorkflowStatus(documentId);

    // Update progress: complete
    await job.updateProgress({
      percent: 100,
      stage: 'complete',
      message: 'Pre-translation complete',
    });

    logger.info({ jobId: job.id, documentId, result }, 'Pre-translate job completed');

    return {
      success: true,
      data: {
        exactMatches: result.exactMatches,
        fuzzyMatches: result.fuzzyMatches,
        totalSegments: result.totalSegments,
        preTranslated: result.preTranslated,
      },
    };
  } catch (err) {
    logger.error({ jobId: job.id, documentId, err }, 'Pre-translate job failed');
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
