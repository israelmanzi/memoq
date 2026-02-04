/**
 * Machine Translation API Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isMTEnabled, translateText, translateBatch, getUsage, getSupportedLanguages } from '../services/mt.service.js';
import { findDocumentById, findSegmentById, listDocumentSegments, updateSegment, findProjectById } from '../services/project.service.js';
import { getMembership } from '../services/org.service.js';

const translateSegmentSchema = z.object({
  segmentId: z.string().uuid(),
});

const translateBatchSchema = z.object({
  documentId: z.string().uuid(),
  segmentIds: z.array(z.string().uuid()).optional(), // If not provided, translate all untranslated
  overwrite: z.boolean().optional().default(false),
});

export async function mtRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Check if MT is enabled
  app.get('/status', async (_request, reply) => {
    const enabled = isMTEnabled();

    if (!enabled) {
      return reply.send({
        enabled: false,
        provider: null,
        message: 'Machine translation is not configured. Set DEEPL_API_KEY environment variable.',
      });
    }

    try {
      const usage = await getUsage();
      return reply.send({
        enabled: true,
        provider: 'deepl',
        usage: {
          used: usage.characterCount,
          limit: usage.characterLimit,
          percentUsed: Math.round((usage.characterCount / usage.characterLimit) * 100),
        },
      });
    } catch {
      return reply.send({
        enabled: true,
        provider: 'deepl',
        usage: null,
      });
    }
  });

  // Get supported languages
  app.get('/languages', async (_request, reply) => {
    if (!isMTEnabled()) {
      return reply.status(503).send({ error: 'Machine translation is not configured' });
    }

    try {
      const languages = await getSupportedLanguages();
      return reply.send({ languages });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get supported languages' });
    }
  });

  // Translate a single segment
  app.post<{ Body: z.infer<typeof translateSegmentSchema> }>(
    '/translate/segment',
    async (request, reply) => {
      if (!isMTEnabled()) {
        return reply.status(503).send({ error: 'Machine translation is not configured' });
      }

      const { segmentId } = translateSegmentSchema.parse(request.body);
      const { userId } = request.user;

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

      try {
        const result = await translateText(segment.sourceText, {
          sourceLanguage: project.sourceLanguage,
          targetLanguage: project.targetLanguage,
        });

        return reply.send({
          segmentId,
          sourceText: segment.sourceText,
          translatedText: result.translatedText,
          detectedSourceLanguage: result.detectedSourceLanguage,
        });
      } catch (error) {
        request.log.error({ error }, 'MT translation failed');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Translation failed',
        });
      }
    }
  );

  // Translate multiple segments (batch)
  app.post<{ Body: z.infer<typeof translateBatchSchema> }>(
    '/translate/batch',
    async (request, reply) => {
      if (!isMTEnabled()) {
        return reply.status(503).send({ error: 'Machine translation is not configured' });
      }

      const { documentId, segmentIds, overwrite } = translateBatchSchema.parse(request.body);
      const { userId } = request.user;

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

      // Get segments to translate
      let allSegments = await listDocumentSegments(documentId);

      // Filter by segmentIds if provided
      if (segmentIds && segmentIds.length > 0) {
        const idSet = new Set(segmentIds);
        allSegments = allSegments.filter(s => idSet.has(s.id));
      }

      // Filter to only untranslated (unless overwrite is true)
      const segmentsToTranslate = overwrite
        ? allSegments
        : allSegments.filter(s => !s.targetText || s.targetText.trim() === '');

      if (segmentsToTranslate.length === 0) {
        return reply.send({
          translated: 0,
          message: 'No segments to translate',
        });
      }

      try {
        const texts = segmentsToTranslate.map(s => s.sourceText);
        const result = await translateBatch(texts, {
          sourceLanguage: project.sourceLanguage,
          targetLanguage: project.targetLanguage,
        });

        // Update segments with translations
        let updatedCount = 0;
        for (const translation of result.translations) {
          const segment = segmentsToTranslate[translation.index];
          if (segment) {
            await updateSegment(segment.id, {
              targetText: translation.translatedText,
              status: 'draft',
              lastModifiedBy: userId,
            });
            updatedCount++;
          }
        }

        return reply.send({
          translated: updatedCount,
          detectedSourceLanguage: result.detectedSourceLanguage,
        });
      } catch (error) {
        request.log.error({ error }, 'Batch MT translation failed');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Batch translation failed',
        });
      }
    }
  );
}
