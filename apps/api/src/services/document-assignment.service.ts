import { eq, and, inArray } from 'drizzle-orm';
import { db, documentAssignments, users } from '../db/index.js';
import type { DocumentRole, DocumentAssignment, DocumentAssignmentWithUser } from '@oxy/shared';

export interface AssignUserInput {
  documentId: string;
  userId: string;
  role: DocumentRole;
  assignedBy: string;
}

/**
 * Assign a user to a document role
 */
export async function assignUserToDocument(
  input: AssignUserInput
): Promise<DocumentAssignment> {
  const [assignment] = await db
    .insert(documentAssignments)
    .values({
      documentId: input.documentId,
      userId: input.userId,
      role: input.role,
      assignedBy: input.assignedBy,
    })
    .onConflictDoUpdate({
      target: [documentAssignments.documentId, documentAssignments.role],
      set: {
        userId: input.userId,
        assignedBy: input.assignedBy,
        assignedAt: new Date(),
      },
    })
    .returning();

  if (!assignment) {
    throw new Error('Failed to create assignment');
  }

  return assignment as DocumentAssignment;
}

/**
 * Get assignment for a specific document and role
 */
export async function getDocumentAssignment(
  documentId: string,
  role: DocumentRole
): Promise<DocumentAssignment | null> {
  const [assignment] = await db
    .select()
    .from(documentAssignments)
    .where(
      and(
        eq(documentAssignments.documentId, documentId),
        eq(documentAssignments.role, role)
      )
    );

  return assignment ? (assignment as DocumentAssignment) : null;
}

/**
 * Get assignment for a specific user on a document
 */
export async function getUserDocumentAssignment(
  documentId: string,
  userId: string
): Promise<DocumentAssignment | null> {
  const [assignment] = await db
    .select()
    .from(documentAssignments)
    .where(
      and(
        eq(documentAssignments.documentId, documentId),
        eq(documentAssignments.userId, userId)
      )
    );

  return assignment ? (assignment as DocumentAssignment) : null;
}

/**
 * List all assignments for a document with user details
 */
export async function listDocumentAssignments(
  documentId: string
): Promise<DocumentAssignmentWithUser[]> {
  const assignments = await db
    .select({
      id: documentAssignments.id,
      documentId: documentAssignments.documentId,
      userId: documentAssignments.userId,
      role: documentAssignments.role,
      assignedAt: documentAssignments.assignedAt,
      assignedBy: documentAssignments.assignedBy,
      userName: users.name,
      userEmail: users.email,
    })
    .from(documentAssignments)
    .innerJoin(users, eq(users.id, documentAssignments.userId))
    .where(eq(documentAssignments.documentId, documentId));

  return assignments.map((a) => ({
    id: a.id,
    documentId: a.documentId,
    userId: a.userId,
    role: a.role as DocumentRole,
    assignedAt: a.assignedAt,
    assignedBy: a.assignedBy,
    user: {
      id: a.userId,
      name: a.userName,
      email: a.userEmail,
    },
  }));
}

/**
 * Remove assignment for a specific role on a document
 */
export async function removeDocumentAssignment(
  documentId: string,
  role: DocumentRole
): Promise<boolean> {
  const result = await db
    .delete(documentAssignments)
    .where(
      and(
        eq(documentAssignments.documentId, documentId),
        eq(documentAssignments.role, role)
      )
    )
    .returning();

  return result.length > 0;
}

/**
 * Check if a user can edit segments based on document workflow and assignment
 * Returns { allowed: boolean, reason?: string }
 *
 * STRICT MODE:
 * - Admins and PMs can always edit (including completed documents)
 * - Regular users can only edit if assigned to the current workflow stage
 * - Unassigned documents cannot be edited by regular users
 */
export async function canUserEditDocument(
  documentId: string,
  userId: string,
  workflowStatus: string,
  isAdminOrPM: boolean
): Promise<{ allowed: boolean; reason?: string }> {
  // Admins and PMs can always edit, including completed documents
  if (isAdminOrPM) {
    return { allowed: true };
  }

  // Document is complete - only admin/PM can edit (handled above)
  if (workflowStatus === 'complete') {
    return { allowed: false, reason: 'Document is complete. Only admins and project managers can reopen it.' };
  }

  // Map workflow status to required role
  const roleForStatus: Record<string, DocumentRole> = {
    translation: 'translator',
    review_1: 'reviewer_1',
    review_2: 'reviewer_2',
  };

  const requiredRole = roleForStatus[workflowStatus];
  if (!requiredRole) {
    return { allowed: false, reason: 'Invalid workflow status' };
  }

  // Check if there's an assignment for this role
  const assignment = await getDocumentAssignment(documentId, requiredRole);

  // STRICT MODE: If no assignment exists, no one can edit (must be assigned first)
  if (!assignment) {
    return {
      allowed: false,
      reason: `No ${requiredRole.replace('_', ' ')} is assigned to this document. Ask a project manager to assign someone.`,
    };
  }

  // If assigned, only the assigned user can edit
  if (assignment.userId === userId) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Only the assigned ${requiredRole.replace('_', ' ')} can edit during this stage`,
  };
}

/**
 * Get the allowed segment statuses for a user based on their role/assignment
 */
export function getAllowedSegmentStatuses(
  workflowStatus: string,
  isAdminOrPM: boolean
): string[] {
  // Admins/PMs can set any status
  if (isAdminOrPM) {
    return ['untranslated', 'draft', 'translated', 'reviewed_1', 'reviewed_2', 'locked'];
  }

  // Based on current workflow stage, limit what statuses can be set
  switch (workflowStatus) {
    case 'translation':
      return ['untranslated', 'draft', 'translated'];
    case 'review_1':
      return ['translated', 'reviewed_1'];
    case 'review_2':
      return ['reviewed_1', 'reviewed_2'];
    case 'complete':
      return []; // Can't edit when complete
    default:
      return [];
  }
}

/**
 * List all documents assigned to a user
 */
export async function listUserAssignedDocuments(
  userId: string
): Promise<DocumentAssignment[]> {
  const assignments = await db
    .select()
    .from(documentAssignments)
    .where(eq(documentAssignments.userId, userId));

  return assignments as DocumentAssignment[];
}

/**
 * Get assignments for multiple documents at once (for list views)
 * Returns a map of documentId -> assignments with user names
 */
export async function getAssignmentsForDocuments(
  documentIds: string[]
): Promise<
  Map<
    string,
    {
      translator: { userId: string; userName: string } | null;
      reviewer_1: { userId: string; userName: string } | null;
      reviewer_2: { userId: string; userName: string } | null;
    }
  >
> {
  // Build map with empty assignments for all documents
  const result = new Map<
    string,
    {
      translator: { userId: string; userName: string } | null;
      reviewer_1: { userId: string; userName: string } | null;
      reviewer_2: { userId: string; userName: string } | null;
    }
  >();

  for (const docId of documentIds) {
    result.set(docId, {
      translator: null,
      reviewer_1: null,
      reviewer_2: null,
    });
  }

  if (documentIds.length === 0) {
    return result;
  }

  const assignments = await db
    .select({
      documentId: documentAssignments.documentId,
      userId: documentAssignments.userId,
      role: documentAssignments.role,
      userName: users.name,
    })
    .from(documentAssignments)
    .innerJoin(users, eq(users.id, documentAssignments.userId))
    .where(inArray(documentAssignments.documentId, documentIds));

  // Fill in actual assignments
  for (const a of assignments) {
    const docAssignments = result.get(a.documentId);
    if (docAssignments && (a.role === 'translator' || a.role === 'reviewer_1' || a.role === 'reviewer_2')) {
      docAssignments[a.role] = { userId: a.userId, userName: a.userName };
    }
  }

  return result;
}

/**
 * Get the required roles for a given workflow type
 */
function getRequiredRolesForWorkflow(workflowType: string): Array<'translator' | 'reviewer_1' | 'reviewer_2'> {
  switch (workflowType) {
    case 'simple':
      return ['translator'];
    case 'single_review':
      return ['translator', 'reviewer_1'];
    case 'full_review':
    default:
      return ['translator', 'reviewer_1', 'reviewer_2'];
  }
}

/**
 * Get document IDs that match an assignment filter for a user
 */
export async function filterDocumentsByAssignment(
  documentIds: string[],
  userId: string,
  filter: string,
  documentWorkflowStatuses: Map<string, string>,
  documentWorkflowTypes: Map<string, string>
): Promise<Set<string>> {
  if (filter === 'all' || documentIds.length === 0) {
    return new Set(documentIds);
  }

  const assignmentsMap = await getAssignmentsForDocuments(documentIds);
  const result = new Set<string>();

  for (const docId of documentIds) {
    const assignments = assignmentsMap.get(docId);
    const workflowStatus = documentWorkflowStatuses.get(docId) ?? 'translation';
    const workflowType = documentWorkflowTypes.get(docId) ?? 'full_review';

    if (!assignments) continue;

    // Get role for current workflow stage
    const activeRole =
      workflowStatus === 'translation'
        ? 'translator'
        : workflowStatus === 'review_1'
          ? 'reviewer_1'
          : workflowStatus === 'review_2'
            ? 'reviewer_2'
            : null;

    // Get required roles based on workflow type
    const requiredRoles = getRequiredRolesForWorkflow(workflowType);

    // Check if user is assigned to any relevant role on this document
    const userAssignedRole = requiredRoles.find((role) => assignments[role]?.userId === userId) ?? null;

    switch (filter) {
      case 'awaiting_action':
        // Assigned to me AND at my workflow stage
        if (userAssignedRole && activeRole === userAssignedRole) {
          result.add(docId);
        }
        break;

      case 'assigned_to_me':
        // Any assignment to me (only checking relevant roles for this workflow)
        if (userAssignedRole) {
          result.add(docId);
        }
        break;

      case 'assigned_as_translator':
        if (assignments.translator?.userId === userId) {
          result.add(docId);
        }
        break;

      case 'assigned_as_reviewer_1':
        // Only include if workflow type uses reviewer_1
        if (requiredRoles.includes('reviewer_1') && assignments.reviewer_1?.userId === userId) {
          result.add(docId);
        }
        break;

      case 'assigned_as_reviewer_2':
        // Only include if workflow type uses reviewer_2
        if (requiredRoles.includes('reviewer_2') && assignments.reviewer_2?.userId === userId) {
          result.add(docId);
        }
        break;

      case 'unassigned':
        // Check if any required role for this workflow type is unassigned
        const hasUnassignedRole = requiredRoles.some((role) => !assignments[role]);
        if (hasUnassignedRole) {
          result.add(docId);
        }
        break;
    }
  }

  return result;
}
