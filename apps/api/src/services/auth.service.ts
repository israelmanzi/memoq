import argon2 from 'argon2';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db, users, organizations, orgMemberships } from '../db/index.js';
import type { AuthUser, User } from '@oxy/shared';

export interface UserWithAuth {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaBackupCodes: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

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

export async function findUserByEmail(email: string): Promise<UserWithAuth | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      emailVerified: users.emailVerified,
      mfaEnabled: users.mfaEnabled,
      mfaSecret: users.mfaSecret,
      mfaBackupCodes: users.mfaBackupCodes,
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

/**
 * Generate a random token for email verification or password reset
 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Mark user's email as verified (used when email service is disabled)
 */
export async function setEmailVerified(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      emailVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Set email verification token for a user
 */
export async function setEmailVerificationToken(
  userId: string,
  token: string,
  expiresIn: number = 24 * 60 * 60 * 1000 // 24 hours
): Promise<void> {
  await db
    .update(users)
    .set({
      emailVerificationToken: token,
      emailVerificationExpires: new Date(Date.now() + expiresIn),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Verify email with token
 */
export async function verifyEmailToken(
  token: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const [user] = await db
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(
      and(
        eq(users.emailVerificationToken, token),
        gt(users.emailVerificationExpires, new Date())
      )
    );

  if (!user) {
    return { success: false, error: 'Invalid or expired verification token' };
  }

  if (user.emailVerified) {
    return { success: false, error: 'Email already verified' };
  }

  await db
    .update(users)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return { success: true, userId: user.id };
}

/**
 * Set password reset token for a user
 */
export async function setPasswordResetToken(
  userId: string,
  token: string,
  expiresIn: number = 60 * 60 * 1000 // 1 hour
): Promise<void> {
  await db
    .update(users)
    .set({
      passwordResetToken: token,
      passwordResetExpires: new Date(Date.now() + expiresIn),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Reset password with token
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.passwordResetToken, token),
        gt(users.passwordResetExpires, new Date())
      )
    );

  if (!user) {
    return { success: false, error: 'Invalid or expired reset token' };
  }

  const passwordHash = await argon2.hash(newPassword);

  await db
    .update(users)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return { success: true };
}

/**
 * Get user by ID with auth fields
 */
export async function findUserByIdWithAuth(id: string): Promise<UserWithAuth | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      emailVerified: users.emailVerified,
      mfaEnabled: users.mfaEnabled,
      mfaSecret: users.mfaSecret,
      mfaBackupCodes: users.mfaBackupCodes,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id));

  return user ?? null;
}

/**
 * Update MFA secret for a user (during setup, before enabling)
 */
export async function updateMFASecret(userId: string, secret: string): Promise<void> {
  await db
    .update(users)
    .set({
      mfaSecret: secret,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Enable MFA for a user
 */
export async function enableMFA(userId: string, backupCodes: string[]): Promise<void> {
  await db
    .update(users)
    .set({
      mfaEnabled: true,
      mfaBackupCodes: backupCodes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Disable MFA for a user
 */
export async function disableMFA(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Update MFA backup codes after one is used
 */
export async function updateMFABackupCodes(userId: string, codes: string[]): Promise<void> {
  await db
    .update(users)
    .set({
      mfaBackupCodes: codes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
