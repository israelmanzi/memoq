import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ORG_ROLES } from '@oxy/shared';
import {
  createOrg,
  findOrgById,
  slugExists,
  listUserOrgs,
  addMember,
  removeMember,
  getMembership,
  listOrgMembers,
  updateMemberRole,
  countOrgAdmins,
} from '../services/org.service.js';
import { findUserByEmail, findUserById } from '../services/auth.service.js';
import {
  createInvitation,
  listPendingInvitationsForOrg,
  cancelInvitation,
  resendInvitation,
} from '../services/invitation.service.js';
import { sendInvitationEmail, isEmailEnabled } from '../services/email.service.js';

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(ORG_ROLES),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ORG_ROLES),
});

const updateRoleSchema = z.object({
  role: z.enum(ORG_ROLES),
});

export async function orgRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('onRequest', app.authenticate);

  // Create organization
  app.post('/', async (request, reply) => {
    const { userId } = request.user;

    const parsed = createOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, slug } = parsed.data;

    if (await slugExists(slug)) {
      return reply.status(409).send({ error: 'Organization slug already taken' });
    }

    try {
      const org = await createOrg({ name, slug, createdBy: userId });
      return reply.status(201).send(org);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create organization');
      return reply.status(500).send({ error: 'Failed to create organization' });
    }
  });

  // List my organizations
  app.get('/', async (request, reply) => {
    const { userId } = request.user;
    const orgs = await listUserOrgs(userId);
    return reply.send({ items: orgs });
  });

  // Get organization by ID
  app.get('/:orgId', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership) {
      return reply.status(403).send({ error: 'Not a member of this organization' });
    }

    const org = await findOrgById(orgId);
    if (!org) {
      return reply.status(404).send({ error: 'Organization not found' });
    }

    return reply.send({ ...org, role: membership.role });
  });

  // List organization members
  app.get('/:orgId/members', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership) {
      return reply.status(403).send({ error: 'Not a member of this organization' });
    }

    const members = await listOrgMembers(orgId);
    return reply.send({ items: members });
  });

  // Add member to organization (admin/pm only)
  app.post('/:orgId/members', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
      return reply.status(403).send({ error: 'Only admins and project managers can add members' });
    }

    const parsed = addMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, role } = parsed.data;

    // Only admins can add other admins
    if (role === 'admin' && membership.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admins can add other admins' });
    }

    const userToAdd = await findUserByEmail(email);
    if (!userToAdd) {
      return reply.status(404).send({ error: 'User not found. They must register first.' });
    }

    try {
      const newMembership = await addMember({
        orgId,
        userId: userToAdd.id,
        role,
      });

      return reply.status(201).send({
        id: newMembership.id,
        userId: userToAdd.id,
        role: newMembership.role,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to add member');
      return reply.status(500).send({ error: 'Failed to add member' });
    }
  });

  // Update member role (admin only)
  app.patch('/:orgId/members/:memberId', async (request, reply) => {
    const { orgId, memberId } = request.params as { orgId: string; memberId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership || membership.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admins can update member roles' });
    }

    const parsed = updateRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { role } = parsed.data;

    // Prevent removing last admin
    if (memberId === userId && role !== 'admin') {
      const adminCount = await countOrgAdmins(orgId);
      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Cannot remove the last admin' });
      }
    }

    const updated = await updateMemberRole(orgId, memberId, role);
    if (!updated) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    return reply.send(updated);
  });

  // Remove member from organization (admin only, or self)
  app.delete('/:orgId/members/:memberId', async (request, reply) => {
    const { orgId, memberId } = request.params as { orgId: string; memberId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership) {
      return reply.status(403).send({ error: 'Not a member of this organization' });
    }

    // Can remove self, or admins can remove others
    const isSelf = memberId === userId;
    const isAdmin = membership.role === 'admin';

    if (!isSelf && !isAdmin) {
      return reply.status(403).send({ error: 'Only admins can remove other members' });
    }

    // Prevent removing last admin
    if (isAdmin && isSelf) {
      const adminCount = await countOrgAdmins(orgId);
      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Cannot remove the last admin' });
      }
    }

    await removeMember(orgId, memberId);
    return reply.status(204).send();
  });

  // ========== Invitation Routes ==========

  // Send invitation to join organization
  app.post('/:orgId/invitations', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
      return reply.status(403).send({ error: 'Only admins and project managers can invite members' });
    }

    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, role } = parsed.data;

    // Only admins can invite other admins
    if (role === 'admin' && membership.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admins can invite other admins' });
    }

    // Check if user is already a member
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      const existingMembership = await getMembership(orgId, existingUser.id);
      if (existingMembership) {
        return reply.status(409).send({ error: 'User is already a member of this organization' });
      }
    }

    // Get org and inviter info for email
    const org = await findOrgById(orgId);
    if (!org) {
      return reply.status(404).send({ error: 'Organization not found' });
    }

    const inviter = await findUserById(userId);
    if (!inviter) {
      return reply.status(500).send({ error: 'Could not find inviter info' });
    }

    try {
      const invitation = await createInvitation({
        orgId,
        email,
        role,
        invitedBy: userId,
      });

      // Send invitation email
      if (isEmailEnabled()) {
        await sendInvitationEmail(
          email,
          inviter.name,
          org.name,
          role,
          invitation.token
        );
      }

      return reply.status(201).send({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        emailSent: isEmailEnabled(),
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create invitation');
      return reply.status(500).send({ error: 'Failed to send invitation. Please try again.' });
    }
  });

  // List pending invitations for organization
  app.get('/:orgId/invitations', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
      return reply.status(403).send({ error: 'Only admins and project managers can view invitations' });
    }

    const invitations = await listPendingInvitationsForOrg(orgId);

    // Filter out expired ones and mark them
    const now = new Date();
    const result = invitations.map(inv => ({
      ...inv,
      isExpired: new Date(inv.expiresAt) < now,
    }));

    return reply.send({ items: result });
  });

  // Cancel an invitation
  app.delete('/:orgId/invitations/:invitationId', async (request, reply) => {
    const { orgId, invitationId } = request.params as { orgId: string; invitationId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
      return reply.status(403).send({ error: 'Only admins and project managers can cancel invitations' });
    }

    const cancelled = await cancelInvitation(invitationId, orgId);
    if (!cancelled) {
      return reply.status(404).send({ error: 'Invitation not found or already processed' });
    }

    return reply.status(204).send();
  });

  // Resend an invitation
  app.post('/:orgId/invitations/:invitationId/resend', async (request, reply) => {
    const { orgId, invitationId } = request.params as { orgId: string; invitationId: string };
    const { userId } = request.user;

    const membership = await getMembership(orgId, userId);
    if (!membership || !['admin', 'project_manager'].includes(membership.role)) {
      return reply.status(403).send({ error: 'Only admins and project managers can resend invitations' });
    }

    const org = await findOrgById(orgId);
    if (!org) {
      return reply.status(404).send({ error: 'Organization not found' });
    }

    const inviter = await findUserById(userId);
    if (!inviter) {
      return reply.status(500).send({ error: 'Could not find inviter info' });
    }

    const invitation = await resendInvitation(invitationId, orgId);
    if (!invitation) {
      return reply.status(404).send({ error: 'Invitation not found or already processed' });
    }

    // Send new invitation email
    if (isEmailEnabled()) {
      await sendInvitationEmail(
        invitation.email,
        inviter.name,
        org.name,
        invitation.role,
        invitation.token
      );
    }

    return reply.send({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      emailSent: isEmailEnabled(),
    });
  });
}
