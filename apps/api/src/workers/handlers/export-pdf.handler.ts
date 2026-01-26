import { Job } from 'bullmq';
import type { ExportPdfJobData, JobResult } from '../../services/queue.service.js';
import { findDocumentById, findProjectById, listDocumentSegments } from '../../services/project.service.js';
import { exportToPdf } from '../../services/pdf-exporter.service.js';
import { uploadFile, generateStorageKey } from '../../services/storage.service.js';
import { logger } from '../../config/logger.js';

export async function handleExportPdf(job: Job<ExportPdfJobData>): Promise<JobResult> {
  const { documentId } = job.data;

  logger.info({ jobId: job.id, documentId }, 'Starting export-pdf job');

  try {
    // Update progress: fetching document
    await job.updateProgress({
      percent: 10,
      stage: 'fetching',
      message: 'Fetching document data...',
    });

    // Get document and project
    const doc = await findDocumentById(documentId);
    if (!doc) {
      return {
        success: false,
        error: 'Document not found',
      };
    }

    const project = await findProjectById(doc.projectId);
    if (!project) {
      return {
        success: false,
        error: 'Project not found',
      };
    }

    // Update progress: fetching segments
    await job.updateProgress({
      percent: 30,
      stage: 'segments',
      message: 'Loading segments...',
    });

    // Get segments
    const segments = await listDocumentSegments(documentId);

    // Update progress: generating PDF
    await job.updateProgress({
      percent: 50,
      stage: 'generating',
      message: 'Generating PDF...',
    });

    // Generate PDF
    const result = await exportToPdf({
      segments: segments.map((seg) => ({
        sourceText: seg.sourceText,
        targetText: seg.targetText,
      })),
      filename: doc.name,
      sourceLanguage: project.sourceLanguage,
      targetLanguage: project.targetLanguage,
    });

    // Update progress: uploading
    await job.updateProgress({
      percent: 80,
      stage: 'uploading',
      message: 'Uploading PDF to storage...',
    });

    // Upload PDF to storage
    const baseName = doc.name.replace(/\.[^.]+$/, '');
    const exportFilename = `${baseName}_translated.pdf`;
    const storageKey = generateStorageKey(documentId, `export_${Date.now()}.pdf`);

    await uploadFile(storageKey, result.content as Buffer, 'application/pdf');

    // Update progress: complete
    await job.updateProgress({
      percent: 100,
      stage: 'complete',
      message: 'PDF export complete',
    });

    logger.info({ jobId: job.id, documentId, storageKey }, 'Export-pdf job completed');

    return {
      success: true,
      data: {
        storageKey,
        filename: exportFilename,
        mimeType: 'application/pdf',
        size: (result.content as Buffer).length,
      },
    };
  } catch (err) {
    logger.error({ jobId: job.id, documentId, err }, 'Export-pdf job failed');
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
