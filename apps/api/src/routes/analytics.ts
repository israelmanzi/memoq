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
  getOrgStatistics,
  getOrgTimeline,
  getOrgLeverage,
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

const orgStatsSchema = z.object({
  orgId: z.string().uuid(),
});

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  /**
   * GET /org/:orgId/statistics
   * Get organization-wide statistics across all projects
   */
  app.get('/org/:orgId/statistics', async (request, reply) => {
    const { orgId } = orgStatsSchema.parse(request.params);

    const membership = await getMembership(orgId, request.user.userId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const statistics = await getOrgStatistics(orgId);
      return reply.send(statistics);
    } catch (error) {
      console.error('Org statistics error:', error);
      return reply.code(500).send({ error: 'Failed to get organization statistics' });
    }
  });

  /**
   * GET /org/:orgId/timeline
   * Get organization-wide activity timeline (daily breakdown)
   */
  app.get('/org/:orgId/timeline', async (request, reply) => {
    const { orgId } = orgStatsSchema.parse(request.params);
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };

    const membership = await getMembership(orgId, request.user.userId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const timeline = await getOrgTimeline(
        orgId,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );
      return reply.send(timeline);
    } catch (error) {
      console.error('Org timeline error:', error);
      return reply.code(500).send({ error: 'Failed to get organization timeline' });
    }
  });

  /**
   * GET /org/:orgId/leverage
   * Get organization-wide TM leverage distribution
   */
  app.get('/org/:orgId/leverage', async (request, reply) => {
    const { orgId } = orgStatsSchema.parse(request.params);

    const membership = await getMembership(orgId, request.user.userId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const leverage = await getOrgLeverage(orgId);
      return reply.send(leverage);
    } catch (error) {
      console.error('Org leverage error:', error);
      return reply.code(500).send({ error: 'Failed to get organization leverage' });
    }
  });

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

    const membership = await getMembership(project.orgId, request.user.userId);
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

    const membership = await getMembership(project.orgId, request.user.userId);
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

    const membership = await getMembership(project.orgId, request.user.userId);
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

    const membership = await getMembership(project.orgId, request.user.userId);
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

    const membership = await getMembership(project.orgId, request.user.userId);
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

    const membership = await getMembership(project.orgId, request.user.userId);
    if (!membership) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const { db, projectMembers, documentAssignments, documents, segments } = await import('../db/index.js');
      const { eq, inArray } = await import('drizzle-orm');

      // Get all documents in this project
      const projectDocs = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.projectId, projectId));

      const docIds = projectDocs.map((d) => d.id);

      // Collect unique user IDs from multiple sources
      const userIds = new Set<string>();

      // 1. Project members
      const members = await db
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(eq(projectMembers.projectId, projectId));

      members.forEach((m) => userIds.add(m.userId));

      // 2. Document assignments (if there are documents)
      if (docIds.length > 0) {
        const assignments = await db
          .select({ userId: documentAssignments.userId })
          .from(documentAssignments)
          .where(inArray(documentAssignments.documentId, docIds));

        assignments.forEach((a) => userIds.add(a.userId));

        // 3. Actual contributors (people who translated or reviewed segments)
        const translators = await db
          .select({ userId: segments.translatedBy })
          .from(segments)
          .where(inArray(segments.documentId, docIds))
          .groupBy(segments.translatedBy);

        translators.forEach((t) => {
          if (t.userId) userIds.add(t.userId);
        });

        const reviewers = await db
          .select({ userId: segments.reviewedBy })
          .from(segments)
          .where(inArray(segments.documentId, docIds))
          .groupBy(segments.reviewedBy);

        reviewers.forEach((r) => {
          if (r.userId) userIds.add(r.userId);
        });
      }

      // Get productivity for each unique user
      const teamProductivity = await Promise.all(
        Array.from(userIds).map(async (userId) => {
          try {
            return await getUserProductivity(userId, projectId);
          } catch (error) {
            console.warn(`Failed to get productivity for user ${userId}:`, error);
            return null;
          }
        })
      );

      // Filter out null results and sort by total contributions
      const validResults = teamProductivity
        .filter((p) => p !== null)
        .sort((a, b) => {
          const aTotal = (a?.statistics.segmentsTranslated ?? 0) + (a?.statistics.segmentsReviewed ?? 0);
          const bTotal = (b?.statistics.segmentsTranslated ?? 0) + (b?.statistics.segmentsReviewed ?? 0);
          return bTotal - aTotal;
        });

      return reply.send(validResults);
    } catch (error) {
      console.error('Team productivity error:', error);
      return reply.code(500).send({ error: 'Failed to get team productivity' });
    }
  });
}
