import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import { WORKFLOW_STATUSES, SEGMENT_STATUSES } from '@memoq/shared';
import {
  findProjectById,
  getProjectMembership,
  createDocument,
  findDocumentById,
  listProjectDocuments,
  updateDocumentStatus,
  deleteDocument,
  createSegmentsBulk,
  findSegmentById,
  listDocumentSegments,
  updateSegment,
  updateSegmentsBulk,
  getDocumentStats,
  refreshDocumentWorkflowStatus,
  canAdvanceToWorkflowStatus,
  preTranslateDocument,
} from '../services/project.service.js';
import { getMembership } from '../services/org.service.js';
import { findMatches, addTranslationUnit } from '../services/tm.service.js';
import { findTermsInText } from '../services/tb.service.js';
import { listProjectResources } from '../services/project.service.js';
import { parseFile, detectFileType, getSupportedExtensions } from '../services/file-parser.service.js';

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
        });

        // Create segments
        await createSegmentsBulk(doc.id, parsed.data.segments);

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

        // Create document
        const doc = await createDocument({
          projectId,
          name: filename,
          fileType,
          originalContent: buffer.toString('utf-8'),
        });

        // Create segments
        await createSegmentsBulk(doc.id, parseResult.segments);

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
      ],
    });
  });

  // List project documents
  app.get<{ Params: { projectId: string } }>(
    '/project/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const docs = await listProjectDocuments(projectId);

      // Add stats to each document
      const docsWithStats = await Promise.all(
        docs.map(async (doc) => {
          const stats = await getDocumentStats(doc.id);
          return { ...doc, ...stats };
        })
      );

      return reply.send({ items: docsWithStats });
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

      const stats = await getDocumentStats(documentId);
      return reply.send({ ...doc, ...stats });
    }
  );

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

      const segment = await findSegmentById(segmentId);
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

      const finalStatus = parsed.data.status ?? 'translated';

      const updated = await updateSegment(segmentId, {
        targetText: parsed.data.targetText,
        status: finalStatus,
        lastModifiedBy: userId,
      });

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

      // Auto-refresh document workflow status
      const newWorkflowStatus = await refreshDocumentWorkflowStatus(documentId);

      return reply.send({ ...updated, documentWorkflowStatus: newWorkflowStatus });
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
}
