import { sql } from '../db/index.js';
import { nanoid } from 'nanoid';
import type { Organization, OrgMembership, OrgRole } from '@memoq/shared';

export interface CreateOrgInput {
  name: string;
  slug: string;
  createdBy: string;
}

export async function createOrg(input: CreateOrgInput): Promise<Organization> {
  const id = nanoid();

  const [org] = await sql<Organization[]>`
    INSERT INTO organizations (id, name, slug)
    VALUES (${id}, ${input.name}, ${input.slug.toLowerCase()})
    RETURNING id, name, slug, created_at as "createdAt", updated_at as "updatedAt"
  `;

  if (!org) {
    throw new Error('Failed to create organization');
  }

  // Add creator as admin
  await addMember({
    orgId: org.id,
    userId: input.createdBy,
    role: 'admin',
  });

  return org;
}

export async function findOrgById(id: string): Promise<Organization | null> {
  const [org] = await sql<Organization[]>`
    SELECT id, name, slug, created_at as "createdAt", updated_at as "updatedAt"
    FROM organizations
    WHERE id = ${id}
  `;

  return org ?? null;
}

export async function findOrgBySlug(slug: string): Promise<Organization | null> {
  const [org] = await sql<Organization[]>`
    SELECT id, name, slug, created_at as "createdAt", updated_at as "updatedAt"
    FROM organizations
    WHERE slug = ${slug.toLowerCase()}
  `;

  return org ?? null;
}

export async function slugExists(slug: string): Promise<boolean> {
  const [result] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = ${slug.toLowerCase()}) as exists
  `;

  return result?.exists ?? false;
}

export async function listUserOrgs(userId: string): Promise<(Organization & { role: OrgRole })[]> {
  const orgs = await sql<(Organization & { role: OrgRole })[]>`
    SELECT
      o.id, o.name, o.slug,
      o.created_at as "createdAt", o.updated_at as "updatedAt",
      om.role
    FROM organizations o
    JOIN org_memberships om ON om.org_id = o.id
    WHERE om.user_id = ${userId}
    ORDER BY o.name
  `;

  return orgs;
}

export interface AddMemberInput {
  orgId: string;
  userId: string;
  role: OrgRole;
}

export async function addMember(input: AddMemberInput): Promise<OrgMembership> {
  const id = nanoid();

  const [membership] = await sql<OrgMembership[]>`
    INSERT INTO org_memberships (id, org_id, user_id, role)
    VALUES (${id}, ${input.orgId}, ${input.userId}, ${input.role})
    ON CONFLICT (user_id, org_id) DO UPDATE SET role = ${input.role}
    RETURNING
      id,
      user_id as "userId",
      org_id as "orgId",
      role,
      created_at as "createdAt"
  `;

  if (!membership) {
    throw new Error('Failed to add member');
  }

  return membership;
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  await sql`
    DELETE FROM org_memberships
    WHERE org_id = ${orgId} AND user_id = ${userId}
  `;
}

export async function getMembership(orgId: string, userId: string): Promise<OrgMembership | null> {
  const [membership] = await sql<OrgMembership[]>`
    SELECT
      id,
      user_id as "userId",
      org_id as "orgId",
      role,
      created_at as "createdAt"
    FROM org_memberships
    WHERE org_id = ${orgId} AND user_id = ${userId}
  `;

  return membership ?? null;
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
  const members = await sql<OrgMemberWithUser[]>`
    SELECT
      om.id,
      om.role,
      om.created_at as "createdAt",
      json_build_object(
        'id', u.id,
        'email', u.email,
        'name', u.name
      ) as user
    FROM org_memberships om
    JOIN users u ON u.id = om.user_id
    WHERE om.org_id = ${orgId}
    ORDER BY om.created_at
  `;

  return members;
}

export async function updateMemberRole(orgId: string, userId: string, role: OrgRole): Promise<OrgMembership | null> {
  const [membership] = await sql<OrgMembership[]>`
    UPDATE org_memberships
    SET role = ${role}
    WHERE org_id = ${orgId} AND user_id = ${userId}
    RETURNING
      id,
      user_id as "userId",
      org_id as "orgId",
      role,
      created_at as "createdAt"
  `;

  return membership ?? null;
}

export async function countOrgAdmins(orgId: string): Promise<number> {
  const [result] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int as count
    FROM org_memberships
    WHERE org_id = ${orgId} AND role = 'admin'
  `;

  return result?.count ?? 0;
}
