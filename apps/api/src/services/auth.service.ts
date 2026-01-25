import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db, users, organizations, orgMemberships } from '../db/index.js';
import type { AuthUser, User } from '@memoq/shared';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const passwordHash = await argon2.hash(input.password);

  const [user] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  if (!user) {
    throw new Error('Failed to create user');
  }

  return user as User;
}

export async function findUserByEmail(
  email: string
): Promise<(User & { passwordHash: string }) | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()));

  return user ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id));

  return user ?? null;
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export async function getUserWithOrgs(userId: string): Promise<AuthUser | null> {
  const user = await findUserById(userId);
  if (!user) {
    return null;
  }

  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: orgMemberships.role,
    })
    .from(organizations)
    .innerJoin(orgMemberships, eq(orgMemberships.orgId, organizations.id))
    .where(eq(orgMemberships.userId, userId))
    .orderBy(organizations.name);

  return {
    ...user,
    organizations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      role: o.role as AuthUser['organizations'][number]['role'],
    })),
  };
}

export async function emailExists(email: string): Promise<boolean> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  return !!user;
}
