import { Job } from 'bullmq';
import type { ParseDocumentJobData, JobResult } from '../../services/queue.service.js';
import { parseFile, isBinaryFileType } from '../../services/file-parser.service.js';
import { getFile } from '../../services/storage.service.js';
import {
  createDocument,
  createSegmentsBulk,
} from '../../services/project.service.js';
import { logActivity } from '../../services/activity.service.js';
import { findProjectById } from '../../services/project.service.js';
import { logger } from '../../config/logger.js';

export async function handleParseDocument(job: Job<ParseDocumentJobData>): Promise<JobResult> {
  const { projectId, filename, fileType, storageKey, userId } = job.data;

  logger.info({ jobId: job.id, projectId, filename }, 'Starting parse-document job');

  try {
    // Update progress: fetching file
    await job.updateProgress({
      percent: 10,
      stage: 'fetching',
      message: 'Fetching file from storage...',
    });

    // Get file from storage
    const buffer = await getFile(storageKey);

    // Update progress: parsing
    await job.updateProgress({
      percent: 30,
      stage: 'parsing',
      message: 'Parsing document...',
    });

    // Parse the file
    const parseResult = await parseFile(buffer, filename, fileType);

    if (parseResult.segments.length === 0) {
      return {
        success: false,
        error: 'No segments found in the file',
      };
    }

    // Update progress: creating document
    await job.updateProgress({
      percent: 60,
      stage: 'creating',
      message: 'Creating document record...',
    });

    const project = await findProjectById(projectId);
    if (!project) {
      return {
        success: false,
        error: 'Project not found',
      };
    }

    const isBinary = parseResult.isBinary || isBinaryFileType(fileType);

    // Create document
    const doc = await createDocument({
      projectId,
      name: filename,
      fileType,
      originalContent: isBinary ? null : buffer.toString('utf-8'),
      createdBy: userId,
      fileStorageKey: isBinary ? storageKey : null,
      structureMetadata: parseResult.structureMetadata || null,
      pageCount: parseResult.pageCount || null,
      isBinaryFormat: isBinary,
    });

    // Update progress: creating segments
    await job.updateProgress({
      percent: 80,
      stage: 'segments',
      message: `Creating ${parseResult.segments.length} segments...`,
    });

    // Create segments
    await createSegmentsBulk(doc.id, parseResult.segments);

    // Log activity
    await logActivity({
      entityType: 'document',
      entityId: doc.id,
      entityName: doc.name,
      action: 'upload',
      userId,
      orgId: project.orgId,
      projectId,
      documentId: doc.id,
      metadata: {
        fileType,
        segmentCount: parseResult.segments.length,
        async: true,
      },
    });

    // Update progress: complete
    await job.updateProgress({
      percent: 100,
      stage: 'complete',
      message: 'Document parsing complete',
    });

    logger.info(
      { jobId: job.id, documentId: doc.id, segmentCount: parseResult.segments.length },
      'Parse-document job completed'
    );

    return {
      success: true,
      data: {
        documentId: doc.id,
        segmentCount: parseResult.segments.length,
        sourceLanguage: parseResult.sourceLanguage,
        targetLanguage: parseResult.targetLanguage,
      },
    };
  } catch (err) {
    logger.error({ jobId: job.id, projectId, filename, err }, 'Parse-document job failed');
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
