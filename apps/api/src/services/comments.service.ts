/**
 * Segment Comments Service
 *
 * Provides threaded comments functionality for translation segments.
 */

import { db } from '../db/index.js';
import { segmentComments, segments } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '../config/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface CommentWithUser {
  id: string;
  segmentId: string;
  parentId: string | null;
  content: string;
  resolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
  };
  resolvedBy?: {
    id: string;
    name: string;
  } | null;
  replies?: CommentWithUser[];
}

export interface CreateCommentInput {
  segmentId: string;
  userId: string;
  content: string;
  parentId?: string;
}

export interface UpdateCommentInput {
  content: string;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new comment on a segment
 */
export async function createComment(input: CreateCommentInput): Promise<CommentWithUser> {
  const { segmentId, userId, content, parentId } = input;

  // Verify segment exists
  const segment = await db.query.segments.findFirst({
    where: eq(segments.id, segmentId),
  });

  if (!segment) {
    throw new Error('Segment not found');
  }

  // If parentId provided, verify it exists and belongs to same segment
  if (parentId) {
    const parentComment = await db.query.segmentComments.findFirst({
      where: and(
        eq(segmentComments.id, parentId),
        eq(segmentComments.segmentId, segmentId)
      ),
    });

    if (!parentComment) {
      throw new Error('Parent comment not found');
    }
  }

  const [comment] = await db
    .insert(segmentComments)
    .values({
      segmentId,
      userId,
      content,
      parentId: parentId || null,
    })
    .returning();

  if (!comment) {
    throw new Error('Failed to create comment');
  }

  logger.info({ commentId: comment.id, segmentId, userId }, 'Comment created');

  return getCommentById(comment.id);
}

/**
 * Get a comment by ID with user info
 */
export async function getCommentById(commentId: string): Promise<CommentWithUser> {
  const comment = await db.query.segmentComments.findFirst({
    where: eq(segmentComments.id, commentId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      resolvedByUser: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!comment) {
    throw new Error('Comment not found');
  }

  return {
    id: comment.id,
    segmentId: comment.segmentId,
    parentId: comment.parentId,
    content: comment.content,
    resolved: comment.resolved,
    resolvedAt: comment.resolvedAt,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    user: comment.user,
    resolvedBy: comment.resolvedByUser,
  };
}

/**
 * Get all comments for a segment (threaded)
 */
export async function getSegmentComments(segmentId: string): Promise<CommentWithUser[]> {
  // Get all comments for the segment
  const allComments = await db.query.segmentComments.findMany({
    where: eq(segmentComments.segmentId, segmentId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      resolvedByUser: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [desc(segmentComments.createdAt)],
  });

  // Build threaded structure
  const commentMap = new Map<string, CommentWithUser>();
  const topLevelComments: CommentWithUser[] = [];

  // First pass: create all comment objects
  for (const comment of allComments) {
    const commentObj: CommentWithUser = {
      id: comment.id,
      segmentId: comment.segmentId,
      parentId: comment.parentId,
      content: comment.content,
      resolved: comment.resolved,
      resolvedAt: comment.resolvedAt,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: comment.user,
      resolvedBy: comment.resolvedByUser,
      replies: [],
    };
    commentMap.set(comment.id, commentObj);
  }

  // Second pass: build tree structure
  for (const comment of allComments) {
    const commentObj = commentMap.get(comment.id)!;

    if (comment.parentId && commentMap.has(comment.parentId)) {
      commentMap.get(comment.parentId)!.replies!.push(commentObj);
    } else {
      topLevelComments.push(commentObj);
    }
  }

  // Sort replies by creation date (oldest first for conversation flow)
  for (const comment of commentMap.values()) {
    if (comment.replies) {
      comment.replies.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
  }

  return topLevelComments;
}

/**
 * Get comment count for a segment
 */
export async function getSegmentCommentCount(segmentId: string): Promise<number> {
  const comments = await db.query.segmentComments.findMany({
    where: eq(segmentComments.segmentId, segmentId),
    columns: { id: true },
  });

  return comments.length;
}

/**
 * Get comments for multiple segments (for document view)
 */
export async function getCommentsForSegments(
  segmentIds: string[]
): Promise<Map<string, { count: number; hasUnresolved: boolean }>> {
  if (segmentIds.length === 0) {
    return new Map();
  }

  const comments = await db.query.segmentComments.findMany({
    where: (c, { inArray }) => inArray(c.segmentId, segmentIds),
    columns: {
      segmentId: true,
      resolved: true,
    },
  });

  const result = new Map<string, { count: number; hasUnresolved: boolean }>();

  for (const comment of comments) {
    const existing = result.get(comment.segmentId) || { count: 0, hasUnresolved: false };
    existing.count++;
    if (!comment.resolved) {
      existing.hasUnresolved = true;
    }
    result.set(comment.segmentId, existing);
  }

  return result;
}

/**
 * Update a comment
 */
export async function updateComment(
  commentId: string,
  userId: string,
  input: UpdateCommentInput
): Promise<CommentWithUser> {
  // Verify ownership
  const comment = await db.query.segmentComments.findFirst({
    where: eq(segmentComments.id, commentId),
  });

  if (!comment) {
    throw new Error('Comment not found');
  }

  if (comment.userId !== userId) {
    throw new Error('Not authorized to edit this comment');
  }

  await db
    .update(segmentComments)
    .set({
      content: input.content,
      updatedAt: new Date(),
    })
    .where(eq(segmentComments.id, commentId));

  logger.info({ commentId, userId }, 'Comment updated');

  return getCommentById(commentId);
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId: string, userId: string): Promise<void> {
  // Verify ownership
  const comment = await db.query.segmentComments.findFirst({
    where: eq(segmentComments.id, commentId),
  });

  if (!comment) {
    throw new Error('Comment not found');
  }

  if (comment.userId !== userId) {
    throw new Error('Not authorized to delete this comment');
  }

  // Delete comment and all replies (cascade)
  await db.delete(segmentComments).where(eq(segmentComments.id, commentId));

  logger.info({ commentId, userId }, 'Comment deleted');
}

/**
 * Resolve/unresolve a comment thread
 */
export async function resolveComment(
  commentId: string,
  userId: string,
  resolved: boolean
): Promise<CommentWithUser> {
  const comment = await db.query.segmentComments.findFirst({
    where: eq(segmentComments.id, commentId),
  });

  if (!comment) {
    throw new Error('Comment not found');
  }

  // Only top-level comments can be resolved
  if (comment.parentId) {
    throw new Error('Only top-level comments can be resolved');
  }

  await db
    .update(segmentComments)
    .set({
      resolved,
      resolvedBy: resolved ? userId : null,
      resolvedAt: resolved ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(segmentComments.id, commentId));

  logger.info({ commentId, userId, resolved }, 'Comment resolution updated');

  return getCommentById(commentId);
}
