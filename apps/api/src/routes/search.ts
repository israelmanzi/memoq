import type { FastifyInstance } from 'fastify';
import { getMembership } from '../services/org.service.js';
import {
  searchAll,
  searchSegments,
  searchTMUnits,
  searchTerms,
} from '../services/search.service.js';

export async function searchRoutes(app: FastifyInstance) {
  // Require authentication for all search routes
  app.addHook('onRequest', app.authenticate);

  // Search within an organization
  app.get<{
    Params: { orgId: string };
    Querystring: { q?: string; type?: string; limit?: string };
  }>('/org/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    const { userId } = request.user;
    const { q, type = 'all', limit: limitStr } = request.query;

    // Check org membership
    const membership = await getMembership(orgId, userId);
    if (!membership) {
      return reply.status(403).send({ error: 'Not a member of this organization' });
    }

    // Validate query
    if (!q || q.trim().length < 2) {
      return reply.status(400).send({ error: 'Search query must be at least 2 characters' });
    }

    const query = q.trim();
    const limit = Math.min(parseInt(limitStr || '20', 10), 100);

    try {
      switch (type) {
        case 'segments': {
          const result = await searchSegments(orgId, query, limit);
          return reply.send({
            query,
            type: 'segments',
            ...result,
          });
        }
        case 'tm': {
          const result = await searchTMUnits(orgId, query, limit);
          return reply.send({
            query,
            type: 'tm',
            ...result,
          });
        }
        case 'terms': {
          const result = await searchTerms(orgId, query, limit);
          return reply.send({
            query,
            type: 'terms',
            ...result,
          });
        }
        case 'all':
        default: {
          const result = await searchAll(orgId, query, limit);
          return reply.send(result);
        }
      }
    } catch (error) {
      request.log.error({ err: error }, 'Search failed');
      return reply.status(500).send({ error: 'Search failed' });
    }
  });
}
