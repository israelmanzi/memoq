import type { FastifyInstance } from 'fastify';
import {
  listProjectActivities,
  listDocumentActivities,
  listOrgActivities,
} from '../services/activity.service.js';
import { getMembership } from '../services/org.service.js';
import { findProjectById, findDocumentById } from '../services/project.service.js';

export async function activityRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Get organization activity feed
  app.get<{ Params: { orgId: string }; Querystring: { limit?: string; offset?: string } }>(
    '/org/:orgId',
    async (request, reply) => {
      const { orgId } = request.params;
      const { userId } = request.user;
      const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      const membership = await getMembership(orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const result = await listOrgActivities(orgId, { limit, offset });
      return reply.send(result);
    }
  );

  // Get project activity feed
  app.get<{ Params: { projectId: string }; Querystring: { limit?: string; offset?: string } }>(
    '/project/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;
      const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const result = await listProjectActivities(projectId, { limit, offset });
      return reply.send(result);
    }
  );

  // Get document activity feed
  app.get<{ Params: { documentId: string }; Querystring: { limit?: string; offset?: string } }>(
    '/document/:documentId',
    async (request, reply) => {
      const { documentId } = request.params;
      const { userId } = request.user;
      const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      const document = await findDocumentById(documentId);
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const project = await findProjectById(document.projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const result = await listDocumentActivities(documentId, { limit, offset });
      return reply.send(result);
    }
  );
}
