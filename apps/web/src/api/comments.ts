/**
 * Segment Comments API
 */

import { api } from './client';

export interface CommentUser {
  id: string;
  name: string;
  email: string;
}

export interface Comment {
  id: string;
  segmentId: string;
  parentId: string | null;
  content: string;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: CommentUser;
  resolvedBy?: {
    id: string;
    name: string;
  } | null;
  replies?: Comment[];
}

export interface CommentCounts {
  [segmentId: string]: {
    count: number;
    hasUnresolved: boolean;
  };
}

export const commentsApi = {
  /**
   * Get comments for a segment (threaded)
   */
  async getSegmentComments(segmentId: string): Promise<{ comments: Comment[] }> {
    return api.get(`/comments/segment/${segmentId}`);
  },

  /**
   * Get comment counts for all segments in a document
   */
  async getDocumentCommentCounts(documentId: string): Promise<{ counts: CommentCounts }> {
    return api.get(`/comments/document/${documentId}/counts`);
  },

  /**
   * Create a new comment
   */
  async createComment(data: {
    segmentId: string;
    content: string;
    parentId?: string;
  }): Promise<{ comment: Comment }> {
    return api.post('/comments', data);
  },

  /**
   * Update a comment
   */
  async updateComment(
    commentId: string,
    content: string
  ): Promise<{ comment: Comment }> {
    return api.patch(`/comments/${commentId}`, { content });
  },

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<void> {
    return api.delete(`/comments/${commentId}`);
  },

  /**
   * Resolve/unresolve a comment thread
   */
  async resolveComment(
    commentId: string,
    resolved: boolean
  ): Promise<{ comment: Comment }> {
    return api.post(`/comments/${commentId}/resolve`, { resolved });
  },
};
