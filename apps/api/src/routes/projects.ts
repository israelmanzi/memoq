import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WORKFLOW_TYPES, PROJECT_STATUSES, PROJECT_ROLES } from '@memoq/shared';
import {
  createProject,
  findProjectById,
  listOrgProjects,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  getProjectMembership,
  listProjectMembers,
  addProjectResource,
  removeProjectResource,
  listProjectResources,
  getProjectStats,
} from '../services/project.service.js';
import { getMembership } from '../services/org.service.js';
import { findTMById } from '../services/tm.service.js';
import { findTBById } from '../services/tb.service.js';

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  sourceLanguage: z.string().min(2).max(10),
  targetLanguage: z.string().min(2).max(10),
  workflowType: z.enum(WORKFLOW_TYPES).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  workflowType: z.enum(WORKFLOW_TYPES).optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(PROJECT_ROLES),
});

const addResourceSchema = z.object({
  resourceType: z.enum(['tm', 'tb']),
  resourceId: z.string().uuid(),
  isWritable: z.boolean().optional(),
});

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ============ Projects ============

  // Create project
  app.post<{ Params: { orgId: string } }>(
    '/org/:orgId',
    async (request, reply) => {
      const { orgId } = request.params;
      const { userId } = request.user;

      const membership = await getMembership(orgId, userId);
      if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
        return reply.status(403).send({ error: 'Only admins and project managers can create projects' });
      }

      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const project = await createProject({
          orgId,
          ...parsed.data,
          createdBy: userId,
        });
        return reply.status(201).send(project);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to create project');
        return reply.status(500).send({ error: 'Failed to create project' });
      }
    }
  );

  // List org projects
  app.get<{ Params: { orgId: string }; Querystring: { status?: string; limit?: string; offset?: string } }>(
    '/org/:orgId',
    async (request, reply) => {
      const { orgId } = request.params;
      const { userId } = request.user;
      const status = request.query.status as any;
      const limit = Math.min(parseInt(request.query.limit || '10', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      const membership = await getMembership(orgId, userId);
      if (!membership) {
        return reply.status(403).send({ error: 'Not a member of this organization' });
      }

      const result = await listOrgProjects(orgId, { status, limit, offset });
      return reply.send(result);
    }
  );

  // Get project
  app.get<{ Params: { projectId: string } }>(
    '/:projectId',
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

      const stats = await getProjectStats(projectId);
      const projectMembership = await getProjectMembership(projectId, userId);

      return reply.send({
        ...project,
        ...stats,
        userRole: projectMembership?.role ?? null,
      });
    }
  );

  // Update project
  app.patch<{ Params: { projectId: string } }>(
    '/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      const projectMembership = await getProjectMembership(projectId, userId);

      const canEdit =
        membership?.role === 'admin' || projectMembership?.role === 'project_manager';
      if (!canEdit) {
        return reply.status(403).send({ error: 'Only admins and project managers can update projects' });
      }

      const parsed = updateProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await updateProject(projectId, parsed.data);
      return reply.send(updated);
    }
  );

  // Delete project
  app.delete<{ Params: { projectId: string } }>(
    '/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      if (!membership || membership.role !== 'admin') {
        return reply.status(403).send({ error: 'Only admins can delete projects' });
      }

      await deleteProject(projectId);
      return reply.status(204).send();
    }
  );

  // ============ Project Members ============

  // List project members
  app.get<{ Params: { projectId: string } }>(
    '/:projectId/members',
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

      const members = await listProjectMembers(projectId);
      return reply.send({ items: members });
    }
  );

  // Add project member
  app.post<{ Params: { projectId: string } }>(
    '/:projectId/members',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      const projectMembership = await getProjectMembership(projectId, userId);

      const canManage =
        membership?.role === 'admin' || projectMembership?.role === 'project_manager';
      if (!canManage) {
        return reply.status(403).send({ error: 'Only admins and project managers can add members' });
      }

      const parsed = addMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Verify target user is org member
      const targetMembership = await getMembership(project.orgId, parsed.data.userId);
      if (!targetMembership) {
        return reply.status(400).send({ error: 'User must be an organization member first' });
      }

      try {
        const member = await addProjectMember({
          projectId,
          ...parsed.data,
        });
        return reply.status(201).send(member);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to add project member');
        return reply.status(500).send({ error: 'Failed to add project member' });
      }
    }
  );

  // Remove project member
  app.delete<{ Params: { projectId: string; memberId: string } }>(
    '/:projectId/members/:memberId',
    async (request, reply) => {
      const { projectId, memberId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      const projectMembership = await getProjectMembership(projectId, userId);

      const canManage =
        membership?.role === 'admin' || projectMembership?.role === 'project_manager';
      if (!canManage) {
        return reply.status(403).send({ error: 'Only admins and project managers can remove members' });
      }

      await removeProjectMember(projectId, memberId);
      return reply.status(204).send();
    }
  );

  // ============ Project Resources ============

  // List project resources
  app.get<{ Params: { projectId: string } }>(
    '/:projectId/resources',
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

      const resources = await listProjectResources(projectId);
      return reply.send({ items: resources });
    }
  );

  // Add project resource (TM or TB)
  app.post<{ Params: { projectId: string } }>(
    '/:projectId/resources',
    async (request, reply) => {
      const { projectId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      const projectMembership = await getProjectMembership(projectId, userId);

      const canManage =
        membership?.role === 'admin' || projectMembership?.role === 'project_manager';
      if (!canManage) {
        return reply.status(403).send({ error: 'Only admins and project managers can add resources' });
      }

      const parsed = addResourceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Verify resource exists and belongs to org
      if (parsed.data.resourceType === 'tm') {
        const tm = await findTMById(parsed.data.resourceId);
        if (!tm || tm.orgId !== project.orgId) {
          return reply.status(400).send({ error: 'TM not found or belongs to another organization' });
        }
      } else if (parsed.data.resourceType === 'tb') {
        const tb = await findTBById(parsed.data.resourceId);
        if (!tb || tb.orgId !== project.orgId) {
          return reply.status(400).send({ error: 'TB not found or belongs to another organization' });
        }
      }

      await addProjectResource(
        projectId,
        parsed.data.resourceType,
        parsed.data.resourceId,
        parsed.data.isWritable
      );

      return reply.status(201).send({ success: true });
    }
  );

  // Remove project resource
  app.delete<{ Params: { projectId: string; resourceId: string } }>(
    '/:projectId/resources/:resourceId',
    async (request, reply) => {
      const { projectId, resourceId } = request.params;
      const { userId } = request.user;

      const project = await findProjectById(projectId);
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const membership = await getMembership(project.orgId, userId);
      const projectMembership = await getProjectMembership(projectId, userId);

      const canManage =
        membership?.role === 'admin' || projectMembership?.role === 'project_manager';
      if (!canManage) {
        return reply.status(403).send({ error: 'Only admins and project managers can remove resources' });
      }

      await removeProjectResource(projectId, resourceId);
      return reply.status(204).send();
    }
  );
}
