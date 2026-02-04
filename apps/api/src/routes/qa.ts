/**
 * QA (Quality Assurance) API Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { checkDocument, checkSegment, type QACheckOptions } from '../services/qa.service.js';
import { findDocumentById, findSegmentById, listDocumentSegments, findProjectById } from '../services/project.service.js';
import { getMembership } from '../services/org.service.js';
import { listProjectResources } from '../services/project.service.js';
import { db } from '../db/index.js';
import { terms } from '../db/schema.js';
import { inArray } from 'drizzle-orm';

const checkDocumentSchema = z.object({
  checkEmptyTarget: z.boolean().optional().default(true),
  checkNumbers: z.boolean().optional().default(true),
  checkPunctuation: z.boolean().optional().default(true),
  checkTerminology: z.boolean().optional().default(true),
  checkLength: z.boolean().optional().default(true),
  checkUntranslated: z.boolean().optional().default(true),
  maxLengthDifferencePercent: z.number().optional().default(50),
});

const checkSegmentSchema = z.object({
  segmentId: z.string().uuid(),
  options: checkDocumentSchema.optional(),
});

export async function qaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Run QA checks on a document
  app.post<{
    Params: { documentId: string };
    Body: z.infer<typeof checkDocumentSchema>;
  }>(
    '/document/:documentId',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;
      const options = checkDocumentSchema.parse(request.body || {});

      // Get document and verify access
      const doc = await findDocumentById(documentId);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(doc.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Verify membership
      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      // Get segments
      const segments = await listDocumentSegments(documentId);
      const segmentsForQA = segments.map(s => ({
        id: s.id,
        segmentIndex: s.segmentIndex,
        sourceText: s.sourceText,
        targetText: s.targetText,
        status: s.status ?? undefined,
      }));

      // Get terminology from project TBs if terminology check is enabled
      let terminology: Array<{ source: string; target: string }> = [];
      if (options.checkTerminology) {
        const resources = await listProjectResources(doc.projectId);
        const tbIds = resources.filter(r => r.resourceType === 'tb').map(r => r.resourceId);

        if (tbIds.length > 0) {
          const allTerms = await db
            .select({
              sourceTerm: terms.sourceTerm,
              targetTerm: terms.targetTerm,
            })
            .from(terms)
            .where(inArray(terms.tbId, tbIds));

          terminology = allTerms.map(t => ({
            source: t.sourceTerm,
            target: t.targetTerm,
          }));
        }
      }

      // Run QA checks
      const qaOptions: QACheckOptions = {
        ...options,
        terminology,
      };

      const result = checkDocument(documentId, segmentsForQA, qaOptions);

      return reply.send(result);
    }
  );

  // Run QA check on a single segment
  app.post<{ Body: z.infer<typeof checkSegmentSchema> }>(
    '/segment',
    async (request, reply) => {
      const { segmentId, options: checkOptions } = checkSegmentSchema.parse(request.body);
      const { userId } = request.user;
      const options = checkOptions || {
        checkEmptyTarget: true,
        checkNumbers: true,
        checkPunctuation: true,
        checkTerminology: true,
        checkLength: true,
        checkUntranslated: true,
        maxLengthDifferencePercent: 50,
      };

      // Get segment and verify access
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

      // Verify membership
      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      // Get terminology if enabled
      let terminology: Array<{ source: string; target: string }> = [];
      if (options.checkTerminology !== false) {
        const resources = await listProjectResources(doc.projectId);
        const tbIds = resources.filter(r => r.resourceType === 'tb').map(r => r.resourceId);

        if (tbIds.length > 0) {
          const allTerms = await db
            .select({
              sourceTerm: terms.sourceTerm,
              targetTerm: terms.targetTerm,
            })
            .from(terms)
            .where(inArray(terms.tbId, tbIds));

          terminology = allTerms.map(t => ({
            source: t.sourceTerm,
            target: t.targetTerm,
          }));
        }
      }

      // Run QA check
      const segmentForQA = {
        id: segment.id,
        segmentIndex: segment.segmentIndex,
        sourceText: segment.sourceText,
        targetText: segment.targetText,
        status: segment.status ?? undefined,
      };

      const result = checkSegment(segmentForQA, { ...options, terminology });

      return reply.send(result);
    }
  );
}
