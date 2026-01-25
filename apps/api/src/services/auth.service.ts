import argon2 from 'argon2';
import { sql } from '../db/index.js';
import { nanoid } from 'nanoid';
import type { AuthUser, User } from '@memoq/shared';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const passwordHash = await argon2.hash(input.password);
  const id = nanoid();

  const [user] = await sql<User[]>`
    INSERT INTO users (id, email, password_hash, name)
    VALUES (${id}, ${input.email.toLowerCase()}, ${passwordHash}, ${input.name})
    RETURNING id, email, name, created_at as "createdAt", updated_at as "updatedAt"
  `;

  if (!user) {
    throw new Error('Failed to create user');
  }

  return user;
}

export async function findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const [user] = await sql<(User & { passwordHash: string })[]>`
    SELECT
      id, email, name, password_hash as "passwordHash",
      created_at as "createdAt", updated_at as "updatedAt"
    FROM users
    WHERE email = ${email.toLowerCase()}
  `;

  return user ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const [user] = await sql<User[]>`
    SELECT id, email, name, created_at as "createdAt", updated_at as "updatedAt"
    FROM users
    WHERE id = ${id}
  `;

  return user ?? null;
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export async function getUserWithOrgs(userId: string): Promise<AuthUser | null> {
  const [user] = await sql<User[]>`
    SELECT id, email, name, created_at as "createdAt", updated_at as "updatedAt"
    FROM users
    WHERE id = ${userId}
  `;

  if (!user) {
    return null;
  }

  const orgs = await sql<{ id: string; name: string; slug: string; role: string }[]>`
    SELECT o.id, o.name, o.slug, om.role
    FROM organizations o
    JOIN org_memberships om ON om.org_id = o.id
    WHERE om.user_id = ${userId}
    ORDER BY o.name
  `;

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
  const [result] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM users WHERE email = ${email.toLowerCase()}) as exists
  `;

  return result?.exists ?? false;
}
