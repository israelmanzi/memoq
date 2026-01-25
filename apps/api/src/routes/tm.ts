import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import {
  createTM,
  findTMById,
  listOrgTMs,
  deleteTM,
  updateTM,
  addTranslationUnit,
  getTranslationUnit,
  deleteTranslationUnit,
  listTMUnits,
  findMatches,
  getTMStats,
  addTranslationUnitsBulk,
  getTMDeleteInfo,
} from '../services/tm.service.js';
import { getMembership } from '../services/org.service.js';
import { logActivity } from '../services/activity.service.js';
import { parseTMX } from '../services/tmx-tbx-parser.service.js';

const createTMSchema = z.object({
  name: z.string().min(1).max(200),
  sourceLanguage: z.string().min(2).max(10),
  targetLanguage: z.string().min(2).max(10),
});

const updateTMSchema = z.object({
  name: z.string().min(1).max(200),
});

const addUnitSchema = z.object({
  sourceText: z.string().min(1),
  targetText: z.string().min(1),
  contextPrev: z.string().optional(),
  contextNext: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const addUnitsBulkSchema = z.object({
  units: z.array(
    z.object({
      sourceText: z.string().min(1),
      targetText: z.string().min(1),
      contextPrev: z.string().optional(),
      contextNext: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
});

const findMatchesSchema = z.object({
  sourceText: z.string().min(1),
  contextPrev: z.string().optional(),
  contextNext: z.string().optional(),
  minMatchPercent: z.number().min(0).max(100).optional(),
  maxResults: z.number().min(1).max(100).optional(),
});

export async function tmRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('onRequest', app.authenticate);

  // ============ TM CRUD ============

  // Create TM
  app.post<{ Params: { orgId: string } }>(
    '/org/:orgId',
    async (request, reply) => {
      const { orgId } = request.params;
      const { userId } = request.user;

      const membership = await getMembership(orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can create TMs' });
      }

      const parsed = createTMSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const tm = await createTM({
          orgId,
          ...parsed.data,
          createdBy: userId,
        });

        await logActivity({
          entityType: 'tm',
          entityId: tm.id,
          entityName: tm.name,
          action: 'create',
          userId,
          orgId,
          metadata: { sourceLanguage: tm.sourceLanguage, targetLanguage: tm.targetLanguage },
        });

        return reply.status(201).send(tm);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to create TM');
        return reply.status(500).send({ error: 'Failed to create translation memory' });
      }
    }
  );

  // List TMs for organization
  app.get<{ Params: { orgId: string }; Querystring: { limit?: string; offset?: string } }>(
    '/org/:orgId',
    async (request, reply) => {
      const { orgId } = request.params;
      const { userId } = request.user;
      const limit = Math.min(parseInt(request.query.limit || '10', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      const membership = await getMembership(orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const result = await listOrgTMs(orgId, { limit, offset });
      return reply.send(result);
    }
  );

  // Get TM by ID
  app.get<{ Params: { tmId: string } }>(
    '/:tmId',
    async (request, reply) => {
      const { tmId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const stats = await getTMStats(tmId);
      return reply.send({ ...tm, ...stats });
    }
  );

  // Update TM
  app.patch<{ Params: { tmId: string } }>(
    '/:tmId',
    async (request, reply) => {
      const { tmId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can update TMs' });
      }

      const parsed = updateTMSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await updateTM(tmId, parsed.data);

      await logActivity({
        entityType: 'tm',
        entityId: tmId,
        entityName: updated?.name ?? tm.name,
        action: 'update',
        userId,
        orgId: tm.orgId,
        metadata: { changes: Object.keys(parsed.data) },
      });

      return reply.send(updated);
    }
  );

  // Get TM delete info (dependencies)
  app.get<{ Params: { tmId: string } }>(
    '/:tmId/delete-info',
    async (request, reply) => {
      const { tmId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const deleteInfo = await getTMDeleteInfo(tmId);
      return reply.send(deleteInfo);
    }
  );

  // Delete TM (soft delete)
  app.delete<{ Params: { tmId: string } }>(
    '/:tmId',
    async (request, reply) => {
      const { tmId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership || membership.role !== 'admin') {
        return reply.status(403).send({ error: 'Only admins can delete TMs' });
      }

      await deleteTM(tmId, userId);

      await logActivity({
        entityType: 'tm',
        entityId: tmId,
        entityName: tm.name,
        action: 'delete',
        userId,
        orgId: tm.orgId,
      });

      return reply.status(204).send();
    }
  );

  // ============ Translation Units ============

  // Add translation unit
  app.post<{ Params: { tmId: string } }>(
    '/:tmId/units',
    async (request, reply) => {
      const { tmId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const parsed = addUnitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const unit = await addTranslationUnit({
          tmId,
          ...parsed.data,
          createdBy: userId,
        });

        await logActivity({
          entityType: 'tm_unit',
          entityId: unit.id,
          entityName: parsed.data.sourceText.slice(0, 50),
          action: 'create',
          userId,
          orgId: tm.orgId,
          metadata: { tmId, tmName: tm.name },
        });

        return reply.status(201).send(unit);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to add translation unit');
        return reply.status(500).send({ error: 'Failed to add translation unit' });
      }
    }
  );

  // Bulk add translation units
  app.post<{ Params: { tmId: string } }>(
    '/:tmId/units/bulk',
    async (request, reply) => {
      const { tmId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can bulk import' });
      }

      const parsed = addUnitsBulkSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const count = await addTranslationUnitsBulk(tmId, parsed.data.units, userId);

        await logActivity({
          entityType: 'tm',
          entityId: tmId,
          entityName: tm.name,
          action: 'upload',
          userId,
          orgId: tm.orgId,
          metadata: { importedCount: count },
        });

        return reply.send({ imported: count });
      } catch (error) {
        request.log.error({ err: error }, 'Failed to bulk import units');
        return reply.status(500).send({ error: 'Failed to import translation units' });
      }
    }
  );

  // Upload TMX file
  app.post<{ Params: { tmId: string } }>(
    '/:tmId/upload',
    async (request, reply) => {
      const { tmId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can upload TMX files' });
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

      const filename = file.filename.toLowerCase();
      if (!filename.endsWith('.tmx')) {
        return reply.status(400).send({ error: 'Invalid file type. Only .tmx files are supported' });
      }

      try {
        const buffer = await file.toBuffer();
        const parseResult = parseTMX(buffer, {
          expectedSourceLanguage: tm.sourceLanguage,
          expectedTargetLanguage: tm.targetLanguage,
        });

        if (parseResult.units.length === 0) {
          return reply.status(400).send({
            error: 'No translation units found in the TMX file',
            warnings: parseResult.warnings,
          });
        }

        // Import units using bulk import
        const imported = await addTranslationUnitsBulk(tmId, parseResult.units, userId);

        await logActivity({
          entityType: 'tm',
          entityId: tmId,
          entityName: tm.name,
          action: 'upload',
          userId,
          orgId: tm.orgId,
          metadata: {
            filename: file.filename,
            importedCount: imported,
            sourceLanguage: parseResult.sourceLanguage,
            targetLanguage: parseResult.targetLanguage,
          },
        });

        return reply.send({
          imported,
          sourceLanguage: parseResult.sourceLanguage,
          targetLanguage: parseResult.targetLanguage,
          warnings: parseResult.warnings,
        });
      } catch (error: any) {
        request.log.error({ err: error }, 'Failed to parse TMX file');
        return reply.status(400).send({
          error: error.message || 'Failed to parse TMX file',
        });
      }
    }
  );

  // List translation units
  app.get<{ Params: { tmId: string }; Querystring: { limit?: string; offset?: string } }>(
    '/:tmId/units',
    async (request, reply) => {
      const { tmId } = request.params;
      const { userId } = request.user;
      const limit = Math.min(parseInt(request.query.limit || '100', 10), 500);
      const offset = parseInt(request.query.offset || '0', 10);

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const result = await listTMUnits(tmId, limit, offset);
      return reply.send(result);
    }
  );

  // Get translation unit
  app.get<{ Params: { tmId: string; unitId: string } }>(
    '/:tmId/units/:unitId',
    async (request, reply) => {
      const { tmId, unitId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const unit = await getTranslationUnit(unitId);
      if (!unit || unit.tmId !== tmId) {
        return reply.status(404).send({ error: 'Translation unit not found' });
      }

      return reply.send(unit);
    }
  );

  // Delete translation unit
  app.delete<{ Params: { tmId: string; unitId: string } }>(
    '/:tmId/units/:unitId',
    async (request, reply) => {
      const { tmId, unitId } = request.params;
      const { userId } = request.user;

      const tm = await findTMById(tmId);
      if (!tm) {
        return reply.status(404).send({ error: 'Translation memory not found' });
      }

      const membership = await getMembership(tm.orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can delete units' });
      }

      const unit = await getTranslationUnit(unitId);
      if (!unit || unit.tmId !== tmId) {
        return reply.status(404).send({ error: 'Translation unit not found' });
      }

      await deleteTranslationUnit(unitId);

      await logActivity({
        entityType: 'tm_unit',
        entityId: unitId,
        entityName: unit.sourceText.slice(0, 50),
        action: 'delete',
        userId,
        orgId: tm.orgId,
        metadata: { tmId, tmName: tm.name },
      });

      return reply.status(204).send();
    }
  );

  // ============ Matching ============

  // Find matches for source text
  app.post<{ Params: { orgId: string } }>(
    '/org/:orgId/match',
    async (request, reply) => {
      const { orgId } = request.params;
      const { userId } = request.user;

      const membership = await getMembership(orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const parsed = findMatchesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Get all TMs for this org
      const { items: tms } = await listOrgTMs(orgId, { limit: 1000 });
      const tmIds = tms.map((tm) => tm.id);

      const matches = await findMatches({
        tmIds,
        ...parsed.data,
      });

      return reply.send({ matches });
    }
  );

  // Find matches in specific TMs
  app.post<{ Body: { tmIds: string[]; sourceText: string; contextPrev?: string; contextNext?: string; minMatchPercent?: number; maxResults?: number } }>(
    '/match',
    async (request, reply) => {
      const { userId } = request.user;

      const schema = z.object({
        tmIds: z.array(z.string().uuid()).min(1),
        sourceText: z.string().min(1),
        contextPrev: z.string().optional(),
        contextNext: z.string().optional(),
        minMatchPercent: z.number().min(0).max(100).optional(),
        maxResults: z.number().min(1).max(100).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Verify user has access to all requested TMs
      for (const tmId of parsed.data.tmIds) {
        const tm = await findTMById(tmId);
        if (!tm) {
          return reply.status(404).send({ error: `TM ${tmId} not found` });
        }
        const membership = await getMembership(tm.orgId, userId);
        if (!membership) {
          return reply.status(403).send({ error: `No access to TM ${tmId}` });
        }
      }

      const matches = await findMatches(parsed.data);
      return reply.send({ matches });
    }
  );
}
