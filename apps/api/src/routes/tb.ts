import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import {
  createTB,
  findTBById,
  listOrgTBs,
  deleteTB,
  updateTB,
  addTerm,
  getTerm,
  deleteTerm,
  updateTerm,
  listTBTerms,
  findTermsInText,
  getTBStats,
  addTermsBulk,
  getTBDeleteInfo,
} from '../services/tb.service.js';
import { getMembership } from '../services/org.service.js';
import { logActivity } from '../services/activity.service.js';
import { parseTBX } from '../services/tmx-tbx-parser.service.js';

const createTBSchema = z.object({
  name: z.string().min(1).max(200),
  sourceLanguage: z.string().min(2).max(10),
  targetLanguage: z.string().min(2).max(10),
});

const updateTBSchema = z.object({
  name: z.string().min(1).max(200),
});

const addTermSchema = z.object({
  sourceTerm: z.string().min(1).max(500),
  targetTerm: z.string().min(1).max(500),
  definition: z.string().max(2000).optional(),
});

const updateTermSchema = z.object({
  sourceTerm: z.string().min(1).max(500).optional(),
  targetTerm: z.string().min(1).max(500).optional(),
  definition: z.string().max(2000).optional(),
});

const addTermsBulkSchema = z.object({
  terms: z.array(
    z.object({
      sourceTerm: z.string().min(1).max(500),
      targetTerm: z.string().min(1).max(500),
      definition: z.string().max(2000).optional(),
    })
  ),
});

const findTermsSchema = z.object({
  text: z.string().min(1),
});

export async function tbRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ============ Term Base CRUD ============

  // Create TB
  app.post<{ Params: { orgId: string } }>(
    '/org/:orgId',
    async (request, reply) => {
      const { orgId } = request.params;
      const { userId } = request.user;

      const membership = await getMembership(orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can create term bases' });
      }

      const parsed = createTBSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const tb = await createTB({
          orgId,
          ...parsed.data,
          createdBy: userId,
        });

        await logActivity({
          entityType: 'tb',
          entityId: tb.id,
          entityName: tb.name,
          action: 'create',
          userId,
          orgId,
          metadata: { sourceLanguage: tb.sourceLanguage, targetLanguage: tb.targetLanguage },
        });

        return reply.status(201).send(tb);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to create term base');
        return reply.status(500).send({ error: 'Failed to create term base' });
      }
    }
  );

  // List TBs for organization
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

      const result = await listOrgTBs(orgId, { limit, offset });
      return reply.send(result);
    }
  );

  // Get TB by ID
  app.get<{ Params: { tbId: string } }>(
    '/:tbId',
    async (request, reply) => {
      const { tbId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const stats = await getTBStats(tbId);
      return reply.send({ ...tb, ...stats });
    }
  );

  // Update TB
  app.patch<{ Params: { tbId: string } }>(
    '/:tbId',
    async (request, reply) => {
      const { tbId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can update term bases' });
      }

      const parsed = updateTBSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await updateTB(tbId, parsed.data);

      await logActivity({
        entityType: 'tb',
        entityId: tbId,
        entityName: updated?.name ?? tb.name,
        action: 'update',
        userId,
        orgId: tb.orgId,
        metadata: { changes: Object.keys(parsed.data) },
      });

      return reply.send(updated);
    }
  );

  // Get TB delete info (dependencies)
  app.get<{ Params: { tbId: string } }>(
    '/:tbId/delete-info',
    async (request, reply) => {
      const { tbId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const deleteInfo = await getTBDeleteInfo(tbId);
      return reply.send(deleteInfo);
    }
  );

  // Delete TB (soft delete)
  app.delete<{ Params: { tbId: string } }>(
    '/:tbId',
    async (request, reply) => {
      const { tbId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership || membership.role !== 'admin') {
        return reply.status(403).send({ error: 'Only admins can delete term bases' });
      }

      await deleteTB(tbId, userId);

      await logActivity({
        entityType: 'tb',
        entityId: tbId,
        entityName: tb.name,
        action: 'delete',
        userId,
        orgId: tb.orgId,
      });

      return reply.status(204).send();
    }
  );

  // ============ Terms ============

  // Add term
  app.post<{ Params: { tbId: string } }>(
    '/:tbId/terms',
    async (request, reply) => {
      const { tbId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const parsed = addTermSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const term = await addTerm({
          tbId,
          ...parsed.data,
          createdBy: userId,
        });

        await logActivity({
          entityType: 'tb_term',
          entityId: term.id,
          entityName: `${parsed.data.sourceTerm} → ${parsed.data.targetTerm}`,
          action: 'create',
          userId,
          orgId: tb.orgId,
          metadata: { tbId, tbName: tb.name },
        });

        return reply.status(201).send(term);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to add term');
        return reply.status(500).send({ error: 'Failed to add term' });
      }
    }
  );

  // Bulk add terms
  app.post<{ Params: { tbId: string } }>(
    '/:tbId/terms/bulk',
    async (request, reply) => {
      const { tbId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can bulk import' });
      }

      const parsed = addTermsBulkSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const count = await addTermsBulk(tbId, parsed.data.terms, userId);

        await logActivity({
          entityType: 'tb',
          entityId: tbId,
          entityName: tb.name,
          action: 'upload',
          userId,
          orgId: tb.orgId,
          metadata: { importedCount: count },
        });

        return reply.send({ imported: count });
      } catch (error) {
        request.log.error({ err: error }, 'Failed to bulk import terms');
        return reply.status(500).send({ error: 'Failed to import terms' });
      }
    }
  );

  // Upload TBX file
  app.post<{ Params: { tbId: string } }>(
    '/:tbId/upload',
    async (request, reply) => {
      const { tbId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can upload TBX files' });
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
      if (!filename.endsWith('.tbx')) {
        return reply.status(400).send({ error: 'Invalid file type. Only .tbx files are supported' });
      }

      try {
        const buffer = await file.toBuffer();
        const parseResult = parseTBX(buffer, {
          expectedSourceLanguage: tb.sourceLanguage,
          expectedTargetLanguage: tb.targetLanguage,
        });

        if (parseResult.terms.length === 0) {
          return reply.status(400).send({
            error: 'No terms found in the TBX file',
            warnings: parseResult.warnings,
          });
        }

        // Import terms using bulk import
        const imported = await addTermsBulk(tbId, parseResult.terms, userId);

        await logActivity({
          entityType: 'tb',
          entityId: tbId,
          entityName: tb.name,
          action: 'upload',
          userId,
          orgId: tb.orgId,
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
        request.log.error({ err: error }, 'Failed to parse TBX file');
        return reply.status(400).send({
          error: error.message || 'Failed to parse TBX file',
        });
      }
    }
  );

  // List terms
  app.get<{
    Params: { tbId: string };
    Querystring: { limit?: string; offset?: string; search?: string };
  }>(
    '/:tbId/terms',
    async (request, reply) => {
      const { tbId } = request.params;
      const { userId } = request.user;
      const limit = Math.min(parseInt(request.query.limit || '100', 10), 500);
      const offset = parseInt(request.query.offset || '0', 10);
      const search = request.query.search;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const result = await listTBTerms(tbId, limit, offset, search);
      return reply.send(result);
    }
  );

  // Get term
  app.get<{ Params: { tbId: string; termId: string } }>(
    '/:tbId/terms/:termId',
    async (request, reply) => {
      const { tbId, termId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const term = await getTerm(termId);
      if (!term || term.tbId !== tbId) {
        return reply.status(404).send({ error: 'Term not found' });
      }

      return reply.send(term);
    }
  );

  // Update term
  app.patch<{ Params: { tbId: string; termId: string } }>(
    '/:tbId/terms/:termId',
    async (request, reply) => {
      const { tbId, termId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const term = await getTerm(termId);
      if (!term || term.tbId !== tbId) {
        return reply.status(404).send({ error: 'Term not found' });
      }

      const parsed = updateTermSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await updateTerm(termId, parsed.data);

      await logActivity({
        entityType: 'tb_term',
        entityId: termId,
        entityName: `${updated?.sourceTerm ?? term.sourceTerm} → ${updated?.targetTerm ?? term.targetTerm}`,
        action: 'update',
        userId,
        orgId: tb.orgId,
        metadata: { tbId, tbName: tb.name, changes: Object.keys(parsed.data) },
      });

      return reply.send(updated);
    }
  );

  // Delete term
  app.delete<{ Params: { tbId: string; termId: string } }>(
    '/:tbId/terms/:termId',
    async (request, reply) => {
      const { tbId, termId } = request.params;
      const { userId } = request.user;

      const tb = await findTBById(tbId);
      if (!tb) {
        return reply.status(404).send({ error: 'Term base not found' });
      }

      const membership = await getMembership(tb.orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can delete terms' });
      }

      const term = await getTerm(termId);
      if (!term || term.tbId !== tbId) {
        return reply.status(404).send({ error: 'Term not found' });
      }

      await deleteTerm(termId);

      await logActivity({
        entityType: 'tb_term',
        entityId: termId,
        entityName: `${term.sourceTerm} → ${term.targetTerm}`,
        action: 'delete',
        userId,
        orgId: tb.orgId,
        metadata: { tbId, tbName: tb.name },
      });

      return reply.status(204).send();
    }
  );

  // ============ Term Matching ============

  // Find terms in text (for all org TBs)
  app.post<{ Params: { orgId: string } }>(
    '/org/:orgId/match',
    async (request, reply) => {
      const { orgId } = request.params;
      const { userId } = request.user;

      const membership = await getMembership(orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const parsed = findTermsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { items: tbs } = await listOrgTBs(orgId, { limit: 1000 });
      const tbIds = tbs.map((tb) => tb.id);

      const matches = await findTermsInText({
        tbIds,
        text: parsed.data.text,
      });

      return reply.send({ matches });
    }
  );

  // Find terms in specific TBs
  app.post<{
    Body: { tbIds: string[]; text: string };
  }>(
    '/match',
    async (request, reply) => {
      const { userId } = request.user;

      const schema = z.object({
        tbIds: z.array(z.string().uuid()).min(1),
        text: z.string().min(1),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Verify user has access to all requested TBs
      for (const tbId of parsed.data.tbIds) {
        const tb = await findTBById(tbId);
        if (!tb) {
          return reply.status(404).send({ error: `Term base ${tbId} not found` });
        }
        const membership = await getMembership(tb.orgId, userId);
        if (!membership) {
          return reply.status(403).send({ error: `No access to term base ${tbId}` });
        }
      }

      const matches = await findTermsInText(parsed.data);
      return reply.send({ matches });
    }
  );
}
