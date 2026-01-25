import type { FastifyInstance } from 'fastify';
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
} from '../services/project.service.js';
import { getMembership } from '../services/org.service.js';
import { findMatches, addTranslationUnit } from '../services/tm.service.js';
import { listProjectResources } from '../services/project.service.js';

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

        const stats = await getDocumentStats(doc.id);
        return reply.status(201).send({ ...doc, ...stats });
      } catch (error) {
        request.log.error({ err: error }, 'Failed to create document');
        return reply.status(500).send({ error: 'Failed to create document' });
      }
    }
  );

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

  // Update document workflow status
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

      const schema = z.object({ status: z.enum(WORKFLOW_STATUSES) });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await updateDocumentStatus(documentId, parsed.data.status);
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
  app.get<{ Params: { documentId: string } }>(
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

      const segments = await listDocumentSegments(documentId);
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

      // Get TM matches
      const resources = await listProjectResources(project.id);
      const tmIds = resources
        .filter((r) => r.resourceType === 'tm')
        .map((r) => r.resourceId);

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

      return reply.send({ ...segment, matches });
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

      const updated = await updateSegment(segmentId, {
        targetText: parsed.data.targetText,
        status: parsed.data.status ?? 'translated',
        lastModifiedBy: userId,
      });

      // If confirmed, save to writable TMs
      if (parsed.data.confirm) {
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

      return reply.send(updated);
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
      return reply.send({ updated: count });
    }
  );
}
