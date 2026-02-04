/**
 * Segment Comments API Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createComment,
  getSegmentComments,
  getCommentById,
  updateComment,
  deleteComment,
  resolveComment,
  getCommentsForSegments,
} from '../services/comments.service.js';
import { findSegmentById, findDocumentById, findProjectById, listDocumentSegments } from '../services/project.service.js';
import { getMembership } from '../services/org.service.js';

const createCommentSchema = z.object({
  segmentId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function commentsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Get comments for a segment (threaded)
  app.get<{ Params: { segmentId: string } }>(
    '/segment/:segmentId',
    async (request, reply) => {
      const { segmentId } = request.params;
      const { userId } = request.user;

      // Verify access
      const segment = await findSegmentById(segmentId);
      if (!segment) {
        return reply.status(404).send({ error: 'Segment not found' });
      }

      const doc = await findDocumentById(segment.documentId);
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

      const comments = await getSegmentComments(segmentId);
      return reply.send({ comments });
    }
  );

  // Get comment counts for all segments in a document
  app.get<{ Params: { documentId: string } }>(
    '/document/:documentId/counts',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;

      // Verify access
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

      // Get all segment IDs for this document
      const segments = await listDocumentSegments(documentId);
      const segmentIds = segments.map(s => s.id);

      const counts = await getCommentsForSegments(segmentIds);

      // Convert Map to object for JSON serialization
      const countsObj: Record<string, { count: number; hasUnresolved: boolean }> = {};
      for (const [segmentId, data] of counts) {
        countsObj[segmentId] = data;
      }

      return reply.send({ counts: countsObj });
    }
  );

  // Create a comment
  app.post<{ Body: z.infer<typeof createCommentSchema> }>(
    '/',
    async (request, reply) => {
      const { segmentId, content, parentId } = createCommentSchema.parse(request.body);
      const { userId } = request.user;

      // Verify access
      const segment = await findSegmentById(segmentId);
      if (!segment) {
        return reply.status(404).send({ error: 'Segment not found' });
      }

      const doc = await findDocumentById(segment.documentId);
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

      try {
        const comment = await createComment({
          segmentId,
          userId,
          content,
          parentId,
        });

        return reply.status(201).send({ comment });
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : 'Failed to create comment',
        });
      }
    }
  );

  // Update a comment
  app.patch<{
    Params: { commentId: string };
    Body: z.infer<typeof updateCommentSchema>;
  }>(
    '/:commentId',
    async (request, reply) => {
      const { commentId } = request.params;
      const { content } = updateCommentSchema.parse(request.body);
      const { userId } = request.user;

      try {
        // Get comment to verify access
        const existingComment = await getCommentById(commentId);

        const segment = await findSegmentById(existingComment.segmentId);
        if (!segment) {
          return reply.status(404).send({ error: 'Segment not found' });
        }

        const doc = await findDocumentById(segment.documentId);
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

        const comment = await updateComment(commentId, userId, { content });
        return reply.send({ comment });
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : 'Failed to update comment',
        });
      }
    }
  );

  // Delete a comment
  app.delete<{ Params: { commentId: string } }>(
    '/:commentId',
    async (request, reply) => {
      const { commentId } = request.params;
      const { userId } = request.user;

      try {
        const existingComment = await getCommentById(commentId);

        const segment = await findSegmentById(existingComment.segmentId);
        if (!segment) {
          return reply.status(404).send({ error: 'Segment not found' });
        }

        const doc = await findDocumentById(segment.documentId);
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

        await deleteComment(commentId, userId);
        return reply.status(204).send();
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : 'Failed to delete comment',
        });
      }
    }
  );

  // Resolve/unresolve a comment thread
  app.post<{
    Params: { commentId: string };
    Body: { resolved: boolean };
  }>(
    '/:commentId/resolve',
    async (request, reply) => {
      const { commentId } = request.params;
      const { resolved } = request.body;
      const { userId } = request.user;

      try {
        const existingComment = await getCommentById(commentId);

        const segment = await findSegmentById(existingComment.segmentId);
        if (!segment) {
          return reply.status(404).send({ error: 'Segment not found' });
        }

        const doc = await findDocumentById(segment.documentId);
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

        const comment = await resolveComment(commentId, userId, resolved);
        return reply.send({ comment });
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : 'Failed to resolve comment',
        });
      }
    }
  );
}
