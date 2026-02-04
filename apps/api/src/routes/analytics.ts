/**
 * Analytics API Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  analyzeLeverage,
  getProjectStatistics,
  getUserProductivity,
  getDocumentAnalytics,
  getProjectTimeline,
} from '../services/analytics.service.js';
import { findProjectById, findDocumentById } from '../services/project.service.js';
import { getMembership } from '../services/org.service.js';

const leverageAnalysisSchema = z.object({
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
});

const projectStatsSchema = z.object({
  projectId: z.string().uuid(),
});


const documentAnalyticsSchema = z.object({
  documentId: z.string().uuid(),
});


export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  /**
   * POST /leverage-analysis
   * Analyze TM leverage for a document before translation starts
   * Shows match distribution (100%, 95-99%, etc.) and estimated effort
   */
  app.post('/leverage-analysis', async (request, reply) => {
    const { documentId, projectId } = leverageAnalysisSchema.parse(request.body);

    // Verify user has access to project
    const project = await findProjectById(projectId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const membership = await getMembership(request.user.userId, project.orgId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    // Verify document belongs to project
    const document = await findDocumentById(documentId);
    if (!document || document.projectId !== projectId) {
      return reply.code(404).send({ error: 'Document not found in project' });
    }

    try {
      const analysis = await analyzeLeverage(documentId, projectId);
      return reply.send(analysis);
    } catch (error) {
      console.error('Leverage analysis error:', error);
      return reply.code(500).send({ error: 'Failed to analyze leverage' });
    }
  });

  /**
   * GET /project/:projectId/statistics
   * Get comprehensive project statistics including progress, word counts, timeline
   */
  app.get('/project/:projectId/statistics', async (request, reply) => {
    const { projectId } = projectStatsSchema.parse(request.params);

    const project = await findProjectById(projectId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const membership = await getMembership(request.user.userId, project.orgId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const statistics = await getProjectStatistics(projectId);
      return reply.send(statistics);
    } catch (error) {
      console.error('Project statistics error:', error);
      return reply.code(500).send({ error: 'Failed to get project statistics' });
    }
  });

  /**
   * POST /project/:projectId/productivity
   * Get user productivity metrics within a project
   * If userId not provided, returns current user's productivity
   */
  app.post('/project/:projectId/productivity', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      userId?: string;
      startDate?: string;
      endDate?: string;
    };

    const userId = body.userId || request.user.userId;
    const startDate = body.startDate ? new Date(body.startDate) : undefined;
    const endDate = body.endDate ? new Date(body.endDate) : undefined;

    const project = await findProjectById(projectId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const membership = await getMembership(request.user.userId, project.orgId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const productivity = await getUserProductivity(userId, projectId, startDate, endDate);
      return reply.send(productivity);
    } catch (error) {
      console.error('User productivity error:', error);
      return reply.code(500).send({ error: 'Failed to get user productivity' });
    }
  });

  /**
   * GET /document/:documentId/analytics
   * Get analytics for a specific document
   */
  app.get('/document/:documentId/analytics', async (request, reply) => {
    const { documentId } = documentAnalyticsSchema.parse(request.params);

    const document = await findDocumentById(documentId);
    if (!document) {
      return reply.code(404).send({ error: 'Document not found' });
    }

    const project = await findProjectById(document.projectId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const membership = await getMembership(request.user.userId, project.orgId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const analytics = await getDocumentAnalytics(documentId);
      return reply.send(analytics);
    } catch (error) {
      console.error('Document analytics error:', error);
      return reply.code(500).send({ error: 'Failed to get document analytics' });
    }
  });

  /**
   * POST /project/:projectId/timeline
   * Get project activity timeline (daily breakdown)
   */
  app.post('/project/:projectId/timeline', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      startDate?: string;
      endDate?: string;
    };

    const startDate = body.startDate ? new Date(body.startDate) : undefined;
    const endDate = body.endDate ? new Date(body.endDate) : undefined;

    const project = await findProjectById(projectId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const membership = await getMembership(request.user.userId, project.orgId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const timeline = await getProjectTimeline(projectId, startDate, endDate);
      return reply.send(timeline);
    } catch (error) {
      console.error('Project timeline error:', error);
      return reply.code(500).send({ error: 'Failed to get project timeline' });
    }
  });

  /**
   * GET /project/:projectId/team-productivity
   * Get productivity metrics for all team members in a project
   */
  app.get('/project/:projectId/team-productivity', async (request, reply) => {
    const { projectId } = projectStatsSchema.parse(request.params);

    const project = await findProjectById(projectId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const membership = await getMembership(request.user.userId, project.orgId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      // Get all project members
      const { db, projectMembers } = await import('../db/index.js');
      const { eq } = await import('drizzle-orm');

      const members = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, projectId));

      // Get productivity for each member
      const teamProductivity = await Promise.all(
        members.map(async (member) => {
          try {
            return await getUserProductivity(member.userId, projectId);
          } catch (error) {
            console.warn(`Failed to get productivity for user ${member.userId}:`, error);
            return null;
          }
        })
      );

      // Filter out null results
      const validResults = teamProductivity.filter((p) => p !== null);

      return reply.send(validResults);
    } catch (error) {
      console.error('Team productivity error:', error);
      return reply.code(500).send({ error: 'Failed to get team productivity' });
    }
  });
}
