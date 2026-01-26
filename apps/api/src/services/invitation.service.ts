import { eq, and, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { orgInvitations, users, orgMemberships } from '../db/schema.js';
import { nanoid } from 'nanoid';
import type { OrgRole } from '@oxy/shared';

const INVITATION_EXPIRY_DAYS = 7;

export interface CreateInvitationInput {
  orgId: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
}

export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  invitedByUser?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Create a new invitation
 */
export async function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
  const token = nanoid(32);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  // Check for existing pending invitation for this email in this org
  const existing = await db.query.orgInvitations.findFirst({
    where: and(
      eq(orgInvitations.orgId, input.orgId),
      eq(orgInvitations.email, input.email.toLowerCase()),
      eq(orgInvitations.status, 'pending')
    ),
  });

  if (existing) {
    // Cancel the existing one and create a new one
    await db
      .update(orgInvitations)
      .set({ status: 'cancelled' })
      .where(eq(orgInvitations.id, existing.id));
  }

  const [invitation] = await db
    .insert(orgInvitations)
    .values({
      orgId: input.orgId,
      email: input.email.toLowerCase(),
      role: input.role,
      token,
      invitedBy: input.invitedBy,
      expiresAt,
    })
    .returning();

  return invitation as Invitation;
}

/**
 * Find invitation by token
 */
export async function findInvitationByToken(token: string): Promise<Invitation | null> {
  const invitation = await db.query.orgInvitations.findFirst({
    where: eq(orgInvitations.token, token),
    with: {
      organization: true,
      invitedByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return invitation as Invitation | null;
}

/**
 * Find all pending invitations for an email
 */
export async function findPendingInvitationsForEmail(email: string): Promise<Invitation[]> {
  const now = new Date();
  const invitations = await db.query.orgInvitations.findMany({
    where: and(
      eq(orgInvitations.email, email.toLowerCase()),
      eq(orgInvitations.status, 'pending'),
      // Only non-expired
    ),
    with: {
      organization: true,
    },
  });

  // Filter out expired ones
  return invitations.filter(inv => new Date(inv.expiresAt) > now) as Invitation[];
}

/**
 * List pending invitations for an organization
 */
export async function listPendingInvitationsForOrg(orgId: string): Promise<Invitation[]> {
  const invitations = await db.query.orgInvitations.findMany({
    where: and(
      eq(orgInvitations.orgId, orgId),
      eq(orgInvitations.status, 'pending')
    ),
    with: {
      invitedByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: (inv, { desc }) => [desc(inv.createdAt)],
  });

  return invitations as Invitation[];
}

/**
 * Accept an invitation - add user to organization
 */
export async function acceptInvitation(
  token: string,
  userId: string
): Promise<{ success: boolean; error?: string; orgId?: string }> {
  const invitation = await findInvitationByToken(token);

  if (!invitation) {
    return { success: false, error: 'Invitation not found' };
  }

  if (invitation.status !== 'pending') {
    return { success: false, error: 'Invitation is no longer valid' };
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    // Mark as expired
    await db
      .update(orgInvitations)
      .set({ status: 'expired' })
      .where(eq(orgInvitations.id, invitation.id));
    return { success: false, error: 'Invitation has expired' };
  }

  // Get the user's email to verify it matches
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return { success: false, error: 'This invitation was sent to a different email address' };
  }

  // Check if user is already a member
  const existingMembership = await db.query.orgMemberships.findFirst({
    where: and(
      eq(orgMemberships.orgId, invitation.orgId),
      eq(orgMemberships.userId, userId)
    ),
  });

  if (existingMembership) {
    // Mark invitation as accepted anyway
    await db
      .update(orgInvitations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(orgInvitations.id, invitation.id));
    return { success: false, error: 'You are already a member of this organization' };
  }

  // Add user to organization
  await db.insert(orgMemberships).values({
    orgId: invitation.orgId,
    userId,
    role: invitation.role,
  });

  // Mark invitation as accepted
  await db
    .update(orgInvitations)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(eq(orgInvitations.id, invitation.id));

  return { success: true, orgId: invitation.orgId };
}

/**
 * Accept all pending invitations for a user (called on registration)
 */
export async function acceptAllPendingInvitations(
  userId: string,
  email: string
): Promise<{ accepted: number; orgIds: string[] }> {
  const pendingInvitations = await findPendingInvitationsForEmail(email);
  const orgIds: string[] = [];
  let accepted = 0;

  for (const invitation of pendingInvitations) {
    // Check if user is already a member (shouldn't happen for new registration)
    const existingMembership = await db.query.orgMemberships.findFirst({
      where: and(
        eq(orgMemberships.orgId, invitation.orgId),
        eq(orgMemberships.userId, userId)
      ),
    });

    if (!existingMembership) {
      // Add user to organization
      await db.insert(orgMemberships).values({
        orgId: invitation.orgId,
        userId,
        role: invitation.role,
      });
      orgIds.push(invitation.orgId);
      accepted++;
    }

    // Mark invitation as accepted
    await db
      .update(orgInvitations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(orgInvitations.id, invitation.id));
  }

  return { accepted, orgIds };
}

/**
 * Cancel an invitation
 */
export async function cancelInvitation(invitationId: string, orgId: string): Promise<boolean> {
  const result = await db
    .update(orgInvitations)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(orgInvitations.id, invitationId),
        eq(orgInvitations.orgId, orgId),
        eq(orgInvitations.status, 'pending')
      )
    )
    .returning();

  return result.length > 0;
}

/**
 * Resend an invitation (creates new token, extends expiry)
 */
export async function resendInvitation(
  invitationId: string,
  orgId: string
): Promise<Invitation | null> {
  const invitation = await db.query.orgInvitations.findFirst({
    where: and(
      eq(orgInvitations.id, invitationId),
      eq(orgInvitations.orgId, orgId),
      eq(orgInvitations.status, 'pending')
    ),
  });

  if (!invitation) {
    return null;
  }

  const newToken = nanoid(32);
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  const [updated] = await db
    .update(orgInvitations)
    .set({
      token: newToken,
      expiresAt: newExpiresAt,
    })
    .where(eq(orgInvitations.id, invitationId))
    .returning();

  return updated as Invitation;
}

/**
 * Cleanup expired invitations (can be called periodically)
 */
export async function cleanupExpiredInvitations(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(orgInvitations)
    .set({ status: 'expired' })
    .where(
      and(
        eq(orgInvitations.status, 'pending'),
        lt(orgInvitations.expiresAt, now)
      )
    )
    .returning();

  return result.length;
}
