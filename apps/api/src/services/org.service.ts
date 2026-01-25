import { eq, and, count } from 'drizzle-orm';
import { db, organizations, orgMemberships, users } from '../db/index.js';
import type { Organization, OrgMembership, OrgRole } from '@memoq/shared';

export interface CreateOrgInput {
  name: string;
  slug: string;
  createdBy: string;
}

export async function createOrg(input: CreateOrgInput): Promise<Organization> {
  const [org] = await db
    .insert(organizations)
    .values({
      name: input.name,
      slug: input.slug.toLowerCase(),
    })
    .returning({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    });

  if (!org) {
    throw new Error('Failed to create organization');
  }

  // Add creator as admin
  await addMember({
    orgId: org.id,
    userId: input.createdBy,
    role: 'admin',
  });

  return org as Organization;
}

export async function findOrgById(id: string): Promise<Organization | null> {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, id));

  return org ?? null;
}

export async function findOrgBySlug(slug: string): Promise<Organization | null> {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug.toLowerCase()));

  return org ?? null;
}

export async function slugExists(slug: string): Promise<boolean> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug.toLowerCase()))
    .limit(1);

  return !!org;
}

export async function listUserOrgs(
  userId: string
): Promise<(Organization & { role: OrgRole })[]> {
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      role: orgMemberships.role,
    })
    .from(organizations)
    .innerJoin(orgMemberships, eq(orgMemberships.orgId, organizations.id))
    .where(eq(orgMemberships.userId, userId))
    .orderBy(organizations.name);

  return orgs as (Organization & { role: OrgRole })[];
}

export interface AddMemberInput {
  orgId: string;
  userId: string;
  role: OrgRole;
}

export async function addMember(input: AddMemberInput): Promise<OrgMembership> {
  const [membership] = await db
    .insert(orgMemberships)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      role: input.role,
    })
    .onConflictDoUpdate({
      target: [orgMemberships.userId, orgMemberships.orgId],
      set: { role: input.role },
    })
    .returning({
      id: orgMemberships.id,
      userId: orgMemberships.userId,
      orgId: orgMemberships.orgId,
      role: orgMemberships.role,
      createdAt: orgMemberships.createdAt,
    });

  if (!membership) {
    throw new Error('Failed to add member');
  }

  return membership as OrgMembership;
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  await db
    .delete(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)));
}

export async function getMembership(
  orgId: string,
  userId: string
): Promise<OrgMembership | null> {
  const [membership] = await db
    .select({
      id: orgMemberships.id,
      userId: orgMemberships.userId,
      orgId: orgMemberships.orgId,
      role: orgMemberships.role,
      createdAt: orgMemberships.createdAt,
    })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)));

  if (!membership) return null;
  return { ...membership, role: membership.role as OrgRole };
}

export interface OrgMemberWithUser {
  id: string;
  role: OrgRole;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export async function listOrgMembers(orgId: string): Promise<OrgMemberWithUser[]> {
  const members = await db
    .select({
      id: orgMemberships.id,
      role: orgMemberships.role,
      createdAt: orgMemberships.createdAt,
      userId: users.id,
      userEmail: users.email,
      userName: users.name,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(users.id, orgMemberships.userId))
    .where(eq(orgMemberships.orgId, orgId))
    .orderBy(orgMemberships.createdAt);

  return members.map((m) => ({
    id: m.id,
    role: m.role as OrgRole,
    createdAt: m.createdAt!,
    user: {
      id: m.userId,
      email: m.userEmail,
      name: m.userName,
    },
  }));
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole
): Promise<OrgMembership | null> {
  const [membership] = await db
    .update(orgMemberships)
    .set({ role })
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)))
    .returning({
      id: orgMemberships.id,
      userId: orgMemberships.userId,
      orgId: orgMemberships.orgId,
      role: orgMemberships.role,
      createdAt: orgMemberships.createdAt,
    });

  if (!membership) return null;
  return { ...membership, role: membership.role as OrgRole };
}

export async function countOrgAdmins(orgId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.role, 'admin')));

  return result?.count ?? 0;
}
