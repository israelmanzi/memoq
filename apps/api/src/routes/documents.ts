import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import { WORKFLOW_STATUSES, SEGMENT_STATUSES, DOCUMENT_ROLES } from '@oxy/shared';
import {
  assignUserToDocument,
  listDocumentAssignments,
  removeDocumentAssignment,
  canUserEditDocument,
  getAllowedSegmentStatuses,
  getAssignmentsForDocuments,
  filterDocumentsByAssignment,
} from '../services/document-assignment.service.js';
import type { DocumentAssignmentFilter } from '@oxy/shared';
import {
  findProjectById,
  getProjectMembership,
  createDocument,
  findDocumentById,
  listProjectDocuments,
  updateDocumentStatus,
  updateDocumentStorageKey,
  deleteDocument,
  createSegmentsBulk,
  findSegmentById,
  findSegmentByIdWithUsers,
  listDocumentSegments,
  updateSegment,
  updateSegmentsBulk,
  getDocumentStats,
  refreshDocumentWorkflowStatus,
  canAdvanceToWorkflowStatus,
  preTranslateDocument,
  propagateTranslation,
} from '../services/project.service.js';
import { getMembership } from '../services/org.service.js';
import { findUserById } from '../services/auth.service.js';
import { sendDocumentAssignmentEmail, isEmailEnabled } from '../services/email.service.js';
import { findMatches, addTranslationUnit, concordanceSearch } from '../services/tm.service.js';
import { findTermsInText } from '../services/tb.service.js';
import { listProjectResources } from '../services/project.service.js';
import { parseFile, detectFileType, getSupportedExtensions, isBinaryFileType } from '../services/file-parser.service.js';
import { exportDocument, exportToDocxInPlace, exportToPdfInPlace, getSupportedExportFormats, getExportFormatsForFileType, type ExportFormat } from '../services/file-exporter.service.js';
import { isV2Metadata, type DocxStructureMetadataV2 } from '../services/docx-parser.service.js';
import { isConversionEnabled } from '../services/conversion.service.js';
import { uploadFile, getFile, generateStorageKey, getMimeType } from '../services/storage.service.js';
import { logActivity } from '../services/activity.service.js';
import { db } from '../db/index.js';
import { documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const createDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  fileType: z.string().min(1).max(20),
  segments: z.array(
    z.object({
      sourceText: z.string().min(1),
      targetText: z.string().optional(),
    })
  ),
});

const updateSegmentSchema = z.object({
  targetText: z.string(),
  status: z.enum(SEGMENT_STATUSES).optional(),
  confirm: z.boolean().optional(), // If true, also save to TM
  propagate: z.boolean().optional(), // If true, propagate to identical untranslated segments
});

const bulkUpdateSegmentsSchema = z.object({
  segments: z.array(
    z.object({
      id: z.string().uuid(),
      targetText: z.string(),
      status: z.enum(SEGMENT_STATUSES).optional(),
    })
  ),
});

export async function documentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ============ Documents ============

  // Create document with segments
  app.post<{ Params: { projectId: string } }>(
    '/project/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      const projectMembership = await getProjectMembership(projectId, userId);

      const canCreate =
        membership?.role === 'admin' || projectMembership?.role === 'project_manager';
      if (!canCreate) {
        return reply.status(403).send({ error: 'Only admins and project managers can create documents' });
      }

      const parsed = createDocumentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const doc = await createDocument({
          projectId,
          name: parsed.data.name,
          fileType: parsed.data.fileType,
          createdBy: userId,
        });

        // Create segments
        await createSegmentsBulk(doc.id, parsed.data.segments);

        // Log activity
        await logActivity({
          entityType: 'document',
          entityId: doc.id,
          entityName: doc.name,
          action: 'create',
          userId,
          orgId: project.orgId,
          projectId,
          documentId: doc.id,
        });

        // Pre-translate using attached TMs
        const resources = await listProjectResources(projectId);
        const tmIds = resources
          .filter((r) => r.resourceType === 'tm')
          .map((r) => r.resourceId);

        let preTranslateResult = null;
        if (tmIds.length > 0) {
          preTranslateResult = await preTranslateDocument({
            documentId: doc.id,
            tmIds,
            minMatchPercent: 75,
            overwriteExisting: false,
          });

          // Refresh workflow status after pre-translation
          await refreshDocumentWorkflowStatus(doc.id);
        }

        const stats = await getDocumentStats(doc.id);
        return reply.status(201).send({ ...doc, ...stats, preTranslation: preTranslateResult });
      } catch (error) {
        request.log.error({ err: error }, 'Failed to create document');
        return reply.status(500).send({ error: 'Failed to create document' });
      }
    }
  );

  // Upload document file
  app.post<{ Params: { projectId: string } }>(
    '/project/:projectId/upload',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      const projectMembership = await getProjectMembership(projectId, userId);

      const canCreate =
        membership?.role === 'admin' || projectMembership?.role === 'project_manager';
      if (!canCreate) {
        return reply.status(403).send({ error: 'Only admins and project managers can upload documents' });
      }

      let file: MultipartFile | undefined;
      try {
        file = await request.file();
      } catch (err) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      if (!file) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const filename = file.filename;
      const fileType = detectFileType(filename, file.mimetype);
      const supportedExtensions = getSupportedExtensions();

      if (!supportedExtensions.includes(fileType)) {
        return reply.status(400).send({
          error: `Unsupported file type. Supported: ${supportedExtensions.join(', ')}`,
        });
      }

      try {
        // Read file buffer
        const buffer = await file.toBuffer();

        // Parse the file
        const parseResult = await parseFile(buffer, filename, fileType);

        if (parseResult.segments.length === 0) {
          return reply.status(400).send({ error: 'No segments found in the file' });
        }

        // Handle binary vs text file storage
        const isBinary = parseResult.isBinary || isBinaryFileType(fileType);
        let fileStorageKey: string | null = null;

        // For PDFs converted to DOCX, include the converted DOCX storage key in metadata
        let structureMetadata = parseResult.structureMetadata || null;

        // Create document first to get ID for storage key
        const doc = await createDocument({
          projectId,
          name: filename,
          fileType,
          originalContent: isBinary ? null : buffer.toString('utf-8'),
          createdBy: userId,
          // Binary file fields
          fileStorageKey: null, // Will update after upload
          structureMetadata,
          pageCount: parseResult.pageCount || null,
          isBinaryFormat: isBinary,
        });

        // Upload binary files to object storage
        if (isBinary) {
          try {
            fileStorageKey = generateStorageKey(doc.id, filename);
            await uploadFile(fileStorageKey, buffer, getMimeType(fileType));
            // Update document with storage key
            await updateDocumentStorageKey(doc.id, fileStorageKey);

            // For PDFs with converted DOCX, also upload the converted DOCX
            if (fileType === 'pdf' && parseResult.convertedDocxBuffer && parseResult.convertedDocxMetadata) {
              const convertedDocxKey = generateStorageKey(doc.id, filename.replace(/\.pdf$/i, '_converted.docx'));
              await uploadFile(convertedDocxKey, parseResult.convertedDocxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

              // Update structureMetadata to include converted DOCX info
              // Use a combined metadata object that includes both DOCX metadata and PDF conversion info
              const enhancedMetadata = {
                ...parseResult.convertedDocxMetadata,
                originalFileType: 'pdf' as const,
                convertedDocxStorageKey: convertedDocxKey,
              };
              structureMetadata = enhancedMetadata as unknown as typeof structureMetadata;

              // Update document with the enhanced metadata
              await db
                .update(documents)
                .set({ structureMetadata })
                .where(eq(documents.id, doc.id));

              request.log.info({ documentId: doc.id, convertedDocxKey }, 'Uploaded converted DOCX for PDF document');
            }
          } catch (storageError: any) {
            request.log.warn({ err: storageError }, 'Failed to upload to storage, falling back to database');
            // Storage not available - could fall back to base64 in DB if needed
          }
        }

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
          },
        });

        // Pre-translate using attached TMs
        const resources = await listProjectResources(projectId);
        const tmIds = resources
          .filter((r) => r.resourceType === 'tm')
          .map((r) => r.resourceId);

        let preTranslateResult = null;
        if (tmIds.length > 0) {
          preTranslateResult = await preTranslateDocument({
            documentId: doc.id,
            tmIds,
            minMatchPercent: 75, // Include fuzzy matches >= 75%
            overwriteExisting: false,
          });

          // Refresh workflow status after pre-translation
          await refreshDocumentWorkflowStatus(doc.id);
        }

        const stats = await getDocumentStats(doc.id);
        return reply.status(201).send({
          ...doc,
          ...stats,
          detectedSourceLanguage: parseResult.sourceLanguage,
          detectedTargetLanguage: parseResult.targetLanguage,
          preTranslation: preTranslateResult,
        });
      } catch (error: any) {
        request.log.error({ err: error }, 'Failed to parse and create document');
        return reply.status(400).send({
          error: error.message || 'Failed to parse file',
        });
      }
    }
  );

  // Get supported file types
  app.get('/supported-types', async (_request, reply) => {
    return reply.send({
      extensions: getSupportedExtensions(),
      mimeTypes: [
        'text/plain',
        'application/xliff+xml',
        'application/x-xliff+xml',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf',
      ],
    });
  });

  // Get original file (for PDF viewer and binary file download)
  // Accepts token via query param for PDF viewer (can't set headers)
  app.get<{ Params: { documentId: string }; Querystring: { token?: string } }>(
    '/:documentId/original-file',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      // Check if file is stored in object storage
      if (!doc.fileStorageKey) {
        return reply.status(404).send({ error: 'Original file not available' });
      }

      try {
        const buffer = await getFile(doc.fileStorageKey);
        const mimeType = getMimeType(doc.fileType);

        reply
          .header('Content-Type', mimeType)
          .header('Content-Disposition', `inline; filename="${doc.name}"`)
          .send(buffer);
      } catch (error: any) {
        request.log.error({ err: error }, 'Failed to retrieve file from storage');
        return reply.status(500).send({ error: 'Failed to retrieve file' });
      }
    }
  );

  // List project documents
  app.get<{
    Params: { projectId: string };
    Querystring: { limit?: string; offset?: string; filter?: DocumentAssignmentFilter };
  }>(
    '/project/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;
      const limit = Math.min(parseInt(request.query.limit || '10', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);
      const filter = request.query.filter || 'all';

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      // Get all documents first (we need to filter on assignments which requires loading them all)
      const result = await listProjectDocuments(projectId, { limit: 1000, offset: 0 });

      // Add stats to each document
      const docsWithStats = await Promise.all(
        result.items.map(async (doc) => {
          const stats = await getDocumentStats(doc.id);
          return { ...doc, ...stats };
        })
      );

      // Get assignment data for all documents
      const documentIds = docsWithStats.map((d) => d.id);
      const assignmentsMap = await getAssignmentsForDocuments(documentIds);

      // Build workflow status and type maps for filtering
      const workflowStatusMap = new Map<string, string>();
      const workflowTypeMap = new Map<string, string>();
      for (const doc of docsWithStats) {
        workflowStatusMap.set(doc.id, doc.workflowStatus);
        // All documents in a project share the same workflow type
        workflowTypeMap.set(doc.id, project.workflowType);
      }

      // Apply assignment filter
      const filteredIds = await filterDocumentsByAssignment(
        documentIds,
        userId,
        filter,
        workflowStatusMap,
        workflowTypeMap
      );

      // Enrich documents with assignment info
      const enrichedDocs = docsWithStats
        .filter((doc) => filteredIds.has(doc.id))
        .map((doc) => {
          const assignments = assignmentsMap.get(doc.id) ?? {
            translator: null,
            reviewer_1: null,
            reviewer_2: null,
          };

          // Determine if user is assigned and to what role
          const myRole =
            assignments.translator?.userId === userId
              ? 'translator'
              : assignments.reviewer_1?.userId === userId
                ? 'reviewer_1'
                : assignments.reviewer_2?.userId === userId
                  ? 'reviewer_2'
                  : null;

          // Determine if it's awaiting user's action
          const activeRole =
            doc.workflowStatus === 'translation'
              ? 'translator'
              : doc.workflowStatus === 'review_1'
                ? 'reviewer_1'
                : doc.workflowStatus === 'review_2'
                  ? 'reviewer_2'
                  : null;

          const isAwaitingMyAction = myRole !== null && myRole === activeRole;

          return {
            ...doc,
            assignments,
            isAssignedToMe: myRole !== null,
            myRole,
            isAwaitingMyAction,
          };
        });

      // Apply pagination to filtered results
      const paginatedDocs = enrichedDocs.slice(offset, offset + limit);

      return reply.send({
        items: paginatedDocs,
        total: enrichedDocs.length,
        filter,
      });
    }
  );

  // Get document
  app.get<{ Params: { documentId: string } }>(
    '/:documentId',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const projectMembership = await getProjectMembership(project.id, userId);
      const isAdminOrPM =
        membership.role === 'admin' || projectMembership?.role === 'project_manager';

      const stats = await getDocumentStats(documentId);

      // Check edit permissions and include in response
      const editPermission = await canUserEditDocument(
        documentId,
        userId,
        doc.workflowStatus,
        isAdminOrPM
      );

      // Get assignment info for this document
      const assignmentsMap = await getAssignmentsForDocuments([documentId]);
      const assignments = assignmentsMap.get(documentId) ?? {
        translator: null,
        reviewer_1: null,
        reviewer_2: null,
      };

      // Determine user's role
      const myRole =
        assignments.translator?.userId === userId
          ? 'translator'
          : assignments.reviewer_1?.userId === userId
            ? 'reviewer_1'
            : assignments.reviewer_2?.userId === userId
              ? 'reviewer_2'
              : null;

      return reply.send({
        ...doc,
        ...stats,
        canEdit: editPermission.allowed,
        editRestrictionReason: editPermission.reason,
        workflowType: project.workflowType,
        assignments,
        myRole,
        isAdminOrPM,
      });
    }
  );

  // Export document
  app.get<{
    Params: { documentId: string };
    Querystring: { format?: string; bilingual?: string };
  }>(
    '/:documentId/export',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;
      const format = (request.query.format || 'xliff') as ExportFormat | 'pdf';

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      // Validate format based on document type
      const availableFormats = getExportFormatsForFileType(doc.fileType);

      // Check if PDF has converted DOCX
      const docxMetadata = doc.structureMetadata as { convertedDocxStorageKey?: string } | null;
      const pdfHasConvertedDocx = doc.fileType === 'pdf' && docxMetadata?.convertedDocxStorageKey;

      // Determine available export formats
      let allFormats: string[];
      if (pdfHasConvertedDocx) {
        // PDF with converted DOCX: can export as DOCX or PDF (via LibreOffice)
        allFormats = ['txt', 'xliff', 'docx'];
        // Add PDF export if LibreOffice conversion is available
        if (isConversionEnabled()) {
          allFormats.push('pdf');
        }
      } else {
        allFormats = [...availableFormats, 'pdf'];
      }

      if (!allFormats.includes(format)) {
        return reply.status(400).send({
          error: `Unsupported export format. Available for this document: ${allFormats.join(', ')}`,
        });
      }

      // DOCX export only for DOCX documents or PDFs with converted DOCX
      if (format === 'docx' && doc.fileType !== 'docx' && !pdfHasConvertedDocx) {
        return reply.status(400).send({
          error: 'DOCX export is only available for DOCX documents or PDFs with conversion enabled',
        });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      // Get all segments
      const segments = await listDocumentSegments(documentId);

      let result: { content: string | Buffer; mimeType: string; extension: string };

      if (format === 'pdf' && doc.fileType === 'pdf' && doc.fileStorageKey && isConversionEnabled()) {
        // PDF export: Use PyMuPDF to replace text directly in the original PDF
        // This preserves the original layout and formatting perfectly
        try {
          const originalPdfBuffer = await getFile(doc.fileStorageKey);
          result = await exportToPdfInPlace({
            originalPdfBuffer,
            segments: segments.map((seg) => ({
              sourceText: seg.sourceText,
              targetText: seg.targetText,
            })),
            filename: doc.name,
          });
          request.log.info({ documentId }, 'Exported PDF with PyMuPDF text replacement');
        } catch (pdfError) {
          request.log.warn({ error: pdfError }, 'PyMuPDF PDF export failed');
          return reply.status(500).send({ error: 'Failed to export PDF document' });
        }
      } else if (format === 'pdf') {
        // PDF export for non-PDF source documents - not supported yet
        return reply.status(400).send({ error: 'PDF export is only supported for PDF source documents' });
      } else if (format === 'docx' && doc.fileType === 'docx' && doc.fileStorageKey && isV2Metadata(doc.structureMetadata)) {
        // Use in-place replacement for DOCX with v2 metadata (preserves all formatting)
        try {
          const originalDocxBuffer = await getFile(doc.fileStorageKey);
          result = await exportToDocxInPlace({
            originalDocxBuffer,
            segments: segments.map((seg) => ({
              sourceText: seg.sourceText,
              targetText: seg.targetText,
              status: seg.status ?? undefined,
            })),
            structureMetadata: doc.structureMetadata as DocxStructureMetadataV2,
          });
        } catch (inPlaceError) {
          // Fall back to rebuild if in-place fails
          request.log.warn({ error: inPlaceError }, 'In-place DOCX export failed, falling back to rebuild');
          result = await exportDocument(
            {
              filename: doc.name,
              sourceLanguage: project.sourceLanguage,
              targetLanguage: project.targetLanguage,
              segments: segments.map((seg) => ({
                sourceText: seg.sourceText,
                targetText: seg.targetText,
                status: seg.status ?? undefined,
              })),
              originalContent: doc.originalContent,
              fileType: doc.fileType,
              structureMetadata: doc.structureMetadata as any,
            },
            format as ExportFormat
          );
        }
      } else {
        // Use standard document exporter (for non-DOCX or legacy DOCX without v2 metadata)
        result = await exportDocument(
          {
            filename: doc.name,
            sourceLanguage: project.sourceLanguage,
            targetLanguage: project.targetLanguage,
            segments: segments.map((seg) => ({
              sourceText: seg.sourceText,
              targetText: seg.targetText,
              status: seg.status ?? undefined,
            })),
            originalContent: doc.originalContent,
            fileType: doc.fileType,
            structureMetadata: doc.structureMetadata as any,
          },
          format as ExportFormat
        );
      }

      // Generate export filename: originalname_Translated.ext
      const baseName = doc.name.replace(/\.[^.]+$/, '');
      const exportFilename = `${baseName}_Translated.${result.extension}`;

      // Log activity
      await logActivity({
        entityType: 'document',
        entityId: documentId,
        entityName: doc.name,
        action: 'exported',
        userId,
        orgId: project.orgId,
        projectId: project.id,
        documentId,
        metadata: { format, segmentCount: segments.length },
      });

      reply
        .header('Content-Type', result.mimeType)
        .header('Content-Disposition', `attachment; filename="${exportFilename}"`)
        .send(result.content);
    }
  );

  // Get supported export formats
  app.get('/export-formats', async (_request, reply) => {
    return reply.send({
      formats: getSupportedExportFormats(),
    });
  });

  // Update document workflow status (manual override)
  app.patch<{ Params: { documentId: string } }>(
    '/:documentId/status',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      const projectMembership = await getProjectMembership(project.id, userId);

      const canUpdate =
        membership?.role === 'admin' || projectMembership?.role === 'project_manager';
      if (!canUpdate) {
        return reply.status(403).send({ error: 'Only admins and project managers can update document status' });
      }

      const schema = z.object({
        status: z.enum(WORKFLOW_STATUSES),
        force: z.boolean().optional(), // Allow forcing status change (admin only)
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const targetStatus = parsed.data.status;

      // Validate transition unless forcing (admin only)
      if (!parsed.data.force || membership?.role !== 'admin') {
        // Only validate when advancing (not when going back)
        const statusOrder = ['translation', 'review_1', 'review_2', 'complete'];
        const currentIdx = statusOrder.indexOf(doc.workflowStatus);
        const targetIdx = statusOrder.indexOf(targetStatus);

        if (targetIdx > currentIdx) {
          const validation = await canAdvanceToWorkflowStatus(
            documentId,
            targetStatus,
            project.workflowType
          );

          if (!validation.allowed) {
            return reply.status(400).send({
              error: 'Cannot advance workflow',
              reason: validation.reason,
            });
          }
        }
      }

      const updated = await updateDocumentStatus(documentId, targetStatus);
      return reply.send(updated);
    }
  );

  // Delete document
  app.delete<{ Params: { documentId: string } }>(
    '/:documentId',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership || membership.role !== 'admin') {
        return reply.status(403).send({ error: 'Only admins can delete documents' });
      }

      await deleteDocument(documentId);
      return reply.status(204).send();
    }
  );

  // ============ Segments ============

  // List document segments
  app.get<{ Params: { documentId: string }; Querystring: { includeMatches?: string } }>(
    '/:documentId/segments',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;
      const includeMatches = request.query.includeMatches === 'true';

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const segments = await listDocumentSegments(documentId);

      // Optionally include best match % for each segment
      if (includeMatches) {
        const resources = await listProjectResources(project.id);
        const tmIds = resources
          .filter((r) => r.resourceType === 'tm')
          .map((r) => r.resourceId);

        if (tmIds.length > 0) {
          const segmentsWithMatches = await Promise.all(
            segments.map(async (seg, idx) => {
              const contextPrev = idx > 0 ? segments[idx - 1]?.sourceText : undefined;
              const contextNext = idx < segments.length - 1 ? segments[idx + 1]?.sourceText : undefined;

              const matches = await findMatches({
                tmIds,
                sourceText: seg.sourceText,
                contextPrev,
                contextNext,
                minMatchPercent: 50,
                maxResults: 1,
              });

              const bestMatch = matches[0];
              return {
                ...seg,
                bestMatchPercent: bestMatch?.matchPercent ?? null,
                hasContextMatch: bestMatch?.isContextMatch ?? false,
              };
            })
          );

          return reply.send({ items: segmentsWithMatches });
        }
      }

      return reply.send({ items: segments });
    }
  );

  // Get segment with TM matches
  app.get<{ Params: { documentId: string; segmentId: string } }>(
    '/:documentId/segments/:segmentId',
    async (request, reply) => {
      const { documentId, segmentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const segment = await findSegmentByIdWithUsers(segmentId);
      if (!segment || segment.documentId !== documentId) {
        return reply.status(404).send({ error: 'Segment not found' });
      }

      // Get project resources
      const resources = await listProjectResources(project.id);
      const tmIds = resources
        .filter((r) => r.resourceType === 'tm')
        .map((r) => r.resourceId);
      const tbIds = resources
        .filter((r) => r.resourceType === 'tb')
        .map((r) => r.resourceId);

      // Get TM matches
      let matches: any[] = [];
      if (tmIds.length > 0) {
        // Get context from adjacent segments
        const allSegments = await listDocumentSegments(documentId);
        const idx = allSegments.findIndex((s) => s.id === segmentId);
        const contextPrev = idx > 0 ? allSegments[idx - 1]?.sourceText : undefined;
        const contextNext =
          idx < allSegments.length - 1 ? allSegments[idx + 1]?.sourceText : undefined;

        matches = await findMatches({
          tmIds,
          sourceText: segment.sourceText,
          contextPrev,
          contextNext,
        });
      }

      // Get TB term matches
      let termMatches: any[] = [];
      if (tbIds.length > 0) {
        termMatches = await findTermsInText({
          tbIds,
          text: segment.sourceText,
        });
      }

      return reply.send({ ...segment, matches, termMatches });
    }
  );

  // Concordance search - find TM entries containing a word/phrase
  app.get<{ Params: { documentId: string }; Querystring: { q: string; searchIn?: string } }>(
    '/:documentId/concordance',
    async (request, reply) => {
      const { documentId } = request.params;
      const { q, searchIn } = request.query;
      const { userId } = request.user;

      if (!q || q.trim().length < 2) {
        return reply.status(400).send({ error: 'Query must be at least 2 characters' });
      }

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      // Get TM IDs from project resources
      const resources = await listProjectResources(project.id);
      const tmIds = resources
        .filter((r) => r.resourceType === 'tm')
        .map((r) => r.resourceId);

      if (tmIds.length === 0) {
        return reply.send({ items: [], message: 'No translation memories attached to this project' });
      }

      const searchInOption = searchIn === 'source' || searchIn === 'target' ? searchIn : 'both';

      const results = await concordanceSearch({
        tmIds,
        query: q.trim(),
        searchIn: searchInOption,
        caseSensitive: false,
        maxResults: 50,
      });

      return reply.send({ items: results });
    }
  );

  // Update segment
  app.patch<{ Params: { documentId: string; segmentId: string } }>(
    '/:documentId/segments/:segmentId',
    async (request, reply) => {
      const { documentId, segmentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const projectMembership = await getProjectMembership(project.id, userId);
      const isAdminOrPM =
        membership.role === 'admin' || projectMembership?.role === 'project_manager';

      // Check if user can edit based on assignment
      const canEdit = await canUserEditDocument(
        documentId,
        userId,
        doc.workflowStatus,
        isAdminOrPM
      );

      if (!canEdit.allowed) {
        return reply.status(403).send({ error: canEdit.reason });
      }

      const segment = await findSegmentById(segmentId);
      if (!segment || segment.documentId !== documentId) {
        return reply.status(404).send({ error: 'Segment not found' });
      }

      const parsed = updateSegmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Validate status based on workflow stage
      const allowedStatuses = getAllowedSegmentStatuses(doc.workflowStatus, isAdminOrPM);
      const requestedStatus = parsed.data.status ?? 'translated';

      if (!allowedStatuses.includes(requestedStatus)) {
        return reply.status(400).send({
          error: `Cannot set status to '${requestedStatus}' during ${doc.workflowStatus} stage`,
          allowedStatuses,
        });
      }

      const finalStatus = requestedStatus;
      const oldStatus = segment.status ?? 'untranslated';

      const updated = await updateSegment(segmentId, {
        targetText: parsed.data.targetText,
        status: finalStatus,
        lastModifiedBy: userId,
      });

      // Log significant status changes
      const isReview = ['reviewed_1', 'reviewed_2', 'locked'].includes(finalStatus);
      const wasUnreviewed = !['reviewed_1', 'reviewed_2', 'locked'].includes(oldStatus);

      if (isReview && wasUnreviewed) {
        // Log review action
        await logActivity({
          entityType: 'segment',
          entityId: segmentId,
          action: 'review',
          userId,
          orgId: project.orgId,
          projectId: project.id,
          documentId,
          metadata: { status: finalStatus },
        });
      } else if (finalStatus === 'translated' && oldStatus === 'untranslated') {
        // Log first translation
        await logActivity({
          entityType: 'segment',
          entityId: segmentId,
          action: 'translate',
          userId,
          orgId: project.orgId,
          projectId: project.id,
          documentId,
        });
      }

      // Auto-save to TM when:
      // 1. Explicitly confirmed via confirm: true (manual "Save to TM" button)
      // 2. Status is reviewed_1 or higher (confirmed by reviewer)
      const confirmedStatuses = ['reviewed_1', 'reviewed_2', 'locked'];
      const shouldSaveToTm = parsed.data.confirm || confirmedStatuses.includes(finalStatus);

      if (shouldSaveToTm && parsed.data.targetText.trim()) {
        const resources = await listProjectResources(project.id);
        const writableTmIds = resources
          .filter((r) => r.resourceType === 'tm' && r.isWritable)
          .map((r) => r.resourceId);

        for (const tmId of writableTmIds) {
          await addTranslationUnit({
            tmId,
            sourceText: segment.sourceText,
            targetText: parsed.data.targetText,
            createdBy: userId,
          });
        }
      }

      // Propagate translation to identical untranslated segments if requested
      let propagationResult = null;
      if (parsed.data.propagate && parsed.data.targetText.trim()) {
        propagationResult = await propagateTranslation({
          documentId,
          sourceText: segment.sourceText,
          targetText: parsed.data.targetText,
          excludeSegmentId: segmentId,
          status: finalStatus,
          lastModifiedBy: userId,
        });
      }

      // Auto-refresh document workflow status
      const newWorkflowStatus = await refreshDocumentWorkflowStatus(documentId);

      return reply.send({
        ...updated,
        documentWorkflowStatus: newWorkflowStatus,
        propagation: propagationResult,
      });
    }
  );

  // Bulk update segments
  app.patch<{ Params: { documentId: string } }>(
    '/:documentId/segments',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const projectMembership = await getProjectMembership(project.id, userId);
      const isAdminOrPM =
        membership.role === 'admin' || projectMembership?.role === 'project_manager';

      // Check if user can edit based on assignment
      const canEdit = await canUserEditDocument(
        documentId,
        userId,
        doc.workflowStatus,
        isAdminOrPM
      );

      if (!canEdit.allowed) {
        return reply.status(403).send({ error: canEdit.reason });
      }

      const parsed = bulkUpdateSegmentsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const updates = parsed.data.segments.map((s) => ({
        ...s,
        lastModifiedBy: userId,
      }));

      const count = await updateSegmentsBulk(updates);

      // Auto-refresh document workflow status
      const newWorkflowStatus = await refreshDocumentWorkflowStatus(documentId);

      return reply.send({ updated: count, documentWorkflowStatus: newWorkflowStatus });
    }
  );

  // ============ Document Assignments ============

  // List assignments for a document
  app.get<{ Params: { documentId: string } }>(
    '/:documentId/assignments',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const assignments = await listDocumentAssignments(documentId);
      return reply.send({ items: assignments });
    }
  );

  // Assign user to document role
  app.post<{ Params: { documentId: string } }>(
    '/:documentId/assignments',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const projectMembership = await getProjectMembership(project.id, userId);
      const isAdminOrPM =
        membership.role === 'admin' || projectMembership?.role === 'project_manager';

      if (!isAdminOrPM) {
        return reply.status(403).send({ error: 'Only admins and project managers can assign users' });
      }

      const schema = z.object({
        userId: z.string().uuid(),
        role: z.enum(DOCUMENT_ROLES),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Verify target user is a member of the organization
      const targetMembership = await getMembership(project.orgId, parsed.data.userId);
      if (!targetMembership) {
        return reply.status(400).send({ error: 'User is not a member of this organization' });
      }

      const assignment = await assignUserToDocument({
        documentId,
        userId: parsed.data.userId,
        role: parsed.data.role,
        assignedBy: userId,
      });

      await logActivity({
        entityType: 'document',
        entityId: documentId,
        action: 'assign',
        userId,
        orgId: project.orgId,
        projectId: project.id,
        documentId,
        metadata: { assignedUserId: parsed.data.userId, role: parsed.data.role },
      });

      // Send email notification to the assigned user
      if (isEmailEnabled()) {
        try {
          const [assignedUser, assignerUser] = await Promise.all([
            findUserById(parsed.data.userId),
            findUserById(userId),
          ]);

          if (assignedUser && assignerUser) {
            await sendDocumentAssignmentEmail(
              assignedUser.email,
              assignedUser.name,
              doc.name,
              project.name,
              parsed.data.role,
              assignerUser.name
            );
          }
        } catch (emailError) {
          // Log but don't fail the assignment if email fails
          request.log.warn({ error: emailError }, 'Failed to send assignment notification email');
        }
      }

      return reply.status(201).send(assignment);
    }
  );

  // Self-assign (claim a role)
  app.post<{ Params: { documentId: string } }>(
    '/:documentId/assignments/claim',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const schema = z.object({
        role: z.enum(DOCUMENT_ROLES),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Check if user's org role allows claiming this document role
      // translator org role -> can claim translator document role
      // reviewer org role -> can claim reviewer_1 or reviewer_2 document role
      const roleMapping: Record<string, string[]> = {
        translator: ['translator'],
        reviewer: ['reviewer_1', 'reviewer_2'],
        project_manager: ['translator', 'reviewer_1', 'reviewer_2'],
        admin: ['translator', 'reviewer_1', 'reviewer_2'],
      };

      const allowedRoles = roleMapping[membership.role] ?? [];
      if (!allowedRoles.includes(parsed.data.role)) {
        return reply.status(403).send({
          error: `Your organization role (${membership.role}) cannot claim the ${parsed.data.role} role`,
        });
      }

      const assignment = await assignUserToDocument({
        documentId,
        userId,
        role: parsed.data.role,
        assignedBy: userId,
      });

      await logActivity({
        entityType: 'document',
        entityId: documentId,
        action: 'claim',
        userId,
        orgId: project.orgId,
        projectId: project.id,
        documentId,
        metadata: { role: parsed.data.role },
      });

      return reply.status(201).send(assignment);
    }
  );

  // Remove assignment
  app.delete<{ Params: { documentId: string; role: string } }>(
    '/:documentId/assignments/:role',
    async (request, reply) => {
      const { documentId, role } = request.params;
      const { userId } = request.user;

      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      // Validate role parameter
      if (!DOCUMENT_ROLES.includes(role as any)) {
        return reply.status(400).send({ error: 'Invalid role' });
      }

      const projectMembership = await getProjectMembership(project.id, userId);
      const isAdminOrPM =
        membership.role === 'admin' || projectMembership?.role === 'project_manager';

      // Only admins/PMs can remove assignments (or we could allow self-unassign)
      if (!isAdminOrPM) {
        return reply.status(403).send({ error: 'Only admins and project managers can remove assignments' });
      }

      const removed = await removeDocumentAssignment(documentId, role as any);

      if (!removed) {
        return reply.status(404).send({ error: 'Assignment not found' });
      }

      await logActivity({
        entityType: 'document',
        entityId: documentId,
        action: 'unassign',
        userId,
        orgId: project.orgId,
        projectId: project.id,
        documentId,
        metadata: { role },
      });

      return reply.status(204).send();
    }
  );
}
