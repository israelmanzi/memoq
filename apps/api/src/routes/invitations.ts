import type { FastifyInstance } from 'fastify';
import {
  findInvitationByToken,
  acceptInvitation,
} from '../services/invitation.service.js';

export async function invitationRoutes(app: FastifyInstance) {
  // Get invitation details by token (public - no auth required)
  app.get('/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const invitation = await findInvitationByToken(token);
    if (!invitation) {
      return reply.status(404).send({ error: 'Invitation not found' });
    }

    const isExpired = new Date(invitation.expiresAt) < new Date();
    const isValid = invitation.status === 'pending' && !isExpired;

    return reply.send({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: isExpired && invitation.status === 'pending' ? 'expired' : invitation.status,
      isValid,
      expiresAt: invitation.expiresAt,
      organization: invitation.organization ? {
        id: invitation.organization.id,
        name: invitation.organization.name,
      } : null,
      invitedBy: invitation.invitedByUser ? {
        name: invitation.invitedByUser.name,
      } : null,
    });
  });

  // Accept invitation (requires auth)
  app.post('/:token/accept', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const { userId } = request.user;

    const result = await acceptInvitation(token, userId);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.send({
      success: true,
      orgId: result.orgId,
      message: 'Successfully joined the organization',
    });
  });
}
