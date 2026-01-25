import { eq, desc, sql } from 'drizzle-orm';
import { db, activityLogs, users } from '../db/index.js';

export type EntityType = 'project' | 'document' | 'segment' | 'tm' | 'tb' | 'tm_unit' | 'tb_term';
export type ActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'translate'
  | 'review'
  | 'confirm'
  | 'upload'
  | 'exported'
  | 'add_member'
  | 'remove_member'
  | 'add_resource'
  | 'remove_resource'
  | 'status_change';

export interface LogActivityInput {
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  action: ActionType;
  userId: string;
  orgId?: string;
  projectId?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      action: input.action,
      userId: input.userId,
      orgId: input.orgId,
      projectId: input.projectId,
      documentId: input.documentId,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error('Failed to log activity:', error);
  }
}

export interface ActivityLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  action: string;
  userId: string;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ListActivitiesOptions {
  limit?: number;
  offset?: number;
}

export async function listProjectActivities(
  projectId: string,
  options: ListActivitiesOptions = {}
): Promise<{ items: ActivityLogEntry[]; total: number }> {
  const { limit = 50, offset = 0 } = options;

  const activities = await db
    .select({
      id: activityLogs.id,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      entityName: activityLogs.entityName,
      action: activityLogs.action,
      userId: activityLogs.userId,
      userName: users.name,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.projectId, projectId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activityLogs)
    .where(eq(activityLogs.projectId, projectId));

  return {
    items: activities.map((a) => ({
      ...a,
      metadata: (a.metadata as Record<string, unknown>) ?? {},
    })),
    total: countResult?.count ?? 0,
  };
}

export async function listDocumentActivities(
  documentId: string,
  options: ListActivitiesOptions = {}
): Promise<{ items: ActivityLogEntry[]; total: number }> {
  const { limit = 50, offset = 0 } = options;

  const activities = await db
    .select({
      id: activityLogs.id,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      entityName: activityLogs.entityName,
      action: activityLogs.action,
      userId: activityLogs.userId,
      userName: users.name,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.documentId, documentId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activityLogs)
    .where(eq(activityLogs.documentId, documentId));

  return {
    items: activities.map((a) => ({
      ...a,
      metadata: (a.metadata as Record<string, unknown>) ?? {},
    })),
    total: countResult?.count ?? 0,
  };
}

export async function listOrgActivities(
  orgId: string,
  options: ListActivitiesOptions = {}
): Promise<{ items: ActivityLogEntry[]; total: number }> {
  const { limit = 50, offset = 0 } = options;

  const activities = await db
    .select({
      id: activityLogs.id,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      entityName: activityLogs.entityName,
      action: activityLogs.action,
      userId: activityLogs.userId,
      userName: users.name,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.orgId, orgId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activityLogs)
    .where(eq(activityLogs.orgId, orgId));

  return {
    items: activities.map((a) => ({
      ...a,
      metadata: (a.metadata as Record<string, unknown>) ?? {},
    })),
    total: countResult?.count ?? 0,
  };
}

// Helper to format activity for display
export function formatActivityMessage(activity: ActivityLogEntry): string {
  const { action, entityType, entityName } = activity;
  const name = entityName || entityType;

  switch (action) {
    case 'create':
      return `created ${entityType} "${name}"`;
    case 'update':
      return `updated ${entityType} "${name}"`;
    case 'delete':
      return `deleted ${entityType} "${name}"`;
    case 'translate':
      return `translated segment`;
    case 'review':
      return `reviewed segment`;
    case 'confirm':
      return `confirmed segment`;
    case 'upload':
      return `uploaded document "${name}"`;
    case 'exported':
      return `exported document "${name}"`;
    case 'add_member':
      return `added member to ${entityType}`;
    case 'remove_member':
      return `removed member from ${entityType}`;
    case 'add_resource':
      return `attached resource to project`;
    case 'remove_resource':
      return `removed resource from project`;
    case 'status_change':
      return `changed status of ${entityType}`;
    default:
      return `${action} ${entityType}`;
  }
}
