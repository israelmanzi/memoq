/**
 * Comments Panel Component
 * Shows threaded comments for a segment
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commentsApi, type Comment } from '../api';
import { useToastActions } from './Toast';

interface CommentsPanelProps {
  segmentId: string;
  documentId: string;
}

export function CommentsPanel({ segmentId, documentId }: CommentsPanelProps) {
  const queryClient = useQueryClient();
  const toast = useToastActions();
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['comments', segmentId],
    queryFn: () => commentsApi.getSegmentComments(segmentId),
    enabled: !!segmentId,
  });

  const comments = data?.comments ?? [];

  const createMutation = useMutation({
    mutationFn: (data: { content: string; parentId?: string }) =>
      commentsApi.createComment({ segmentId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', segmentId] });
      queryClient.invalidateQueries({ queryKey: ['comment-counts', documentId] });
      setNewComment('');
      setReplyingTo(null);
      setReplyText('');
    },
    onError: (err: any) => {
      toast.error(err.data?.error || 'Failed to add comment');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      commentsApi.updateComment(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', segmentId] });
      setEditingId(null);
      setEditText('');
    },
    onError: (err: any) => {
      toast.error(err.data?.error || 'Failed to update comment');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => commentsApi.deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', segmentId] });
      queryClient.invalidateQueries({ queryKey: ['comment-counts', documentId] });
    },
    onError: (err: any) => {
      toast.error(err.data?.error || 'Failed to delete comment');
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      commentsApi.resolveComment(id, resolved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', segmentId] });
      queryClient.invalidateQueries({ queryKey: ['comment-counts', documentId] });
    },
    onError: (err: any) => {
      toast.error(err.data?.error || 'Failed to resolve comment');
    },
  });

  const handleSubmit = (e: React.FormEvent, parentId?: string) => {
    e.preventDefault();
    const content = parentId ? replyText : newComment;
    if (!content.trim()) return;
    createMutation.mutate({ content: content.trim(), parentId });
  };

  const handleEdit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editText.trim()) return;
    updateMutation.mutate({ id, content: editText.trim() });
  };

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditText(comment.content);
    setReplyingTo(null);
  };

  const startReply = (commentId: string) => {
    setReplyingTo(commentId);
    setReplyText('');
    setEditingId(null);
  };

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-2 py-1.5 bg-surface-panel">
        <h3
          className="text-xs font-medium text-text-secondary uppercase tracking-wide cursor-help"
          title="Comments: Add notes, questions, or feedback for this segment. Comments can be threaded with replies."
        >
          Comments
        </h3>
        <span className="text-xs text-text-muted">{comments.length}</span>
      </div>

      <div className="bg-surface-alt">
        {isLoading ? (
          <div className="px-2 py-3 text-center text-xs text-text-muted">
            Loading comments...
          </div>
        ) : (
          <>
            {/* Comment list */}
            {comments.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-text-muted">
                No comments yet
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-border-light">
                {comments.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    editingId={editingId}
                    editText={editText}
                    setEditText={setEditText}
                    replyingTo={replyingTo}
                    replyText={replyText}
                    setReplyText={setReplyText}
                    onEdit={startEdit}
                    onReply={startReply}
                    onCancelEdit={() => { setEditingId(null); setEditText(''); }}
                    onCancelReply={() => { setReplyingTo(null); setReplyText(''); }}
                    onSubmitEdit={handleEdit}
                    onSubmitReply={handleSubmit}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onResolve={(id, resolved) => resolveMutation.mutate({ id, resolved })}
                    isPending={updateMutation.isPending || deleteMutation.isPending || resolveMutation.isPending}
                  />
                ))}
              </div>
            )}

            {/* New comment form */}
            <form onSubmit={(e) => handleSubmit(e)} className="p-2 border-t border-border-light">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-2 py-1 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || createMutation.isPending}
                  className="px-2 py-1 text-xs text-text-inverse bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

interface CommentThreadProps {
  comment: Comment;
  editingId: string | null;
  editText: string;
  setEditText: (text: string) => void;
  replyingTo: string | null;
  replyText: string;
  setReplyText: (text: string) => void;
  onEdit: (comment: Comment) => void;
  onReply: (commentId: string) => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onSubmitEdit: (e: React.FormEvent, id: string) => void;
  onSubmitReply: (e: React.FormEvent, parentId: string) => void;
  onDelete: (id: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  isPending: boolean;
  depth?: number;
}

function CommentThread({
  comment,
  editingId,
  editText,
  setEditText,
  replyingTo,
  replyText,
  setReplyText,
  onEdit,
  onReply,
  onCancelEdit,
  onCancelReply,
  onSubmitEdit,
  onSubmitReply,
  onDelete,
  onResolve,
  isPending,
  depth = 0,
}: CommentThreadProps) {
  const isEditing = editingId === comment.id;
  const isReplying = replyingTo === comment.id;
  const isRoot = depth === 0;

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l border-border-light pl-2' : ''}`}>
      <div className={`px-2 py-1.5 ${comment.resolved ? 'opacity-60' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-text">{comment.user.name}</span>
            <span className="text-2xs text-text-muted">
              {formatTimeAgo(comment.createdAt)}
            </span>
          </div>
          {isRoot && (
            <button
              onClick={() => onResolve(comment.id, !comment.resolved)}
              disabled={isPending}
              className={`text-2xs px-1.5 py-0.5 ${
                comment.resolved
                  ? 'text-success bg-success-bg'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
              title={comment.resolved ? 'Reopen thread' : 'Resolve thread'}
            >
              {comment.resolved ? 'Resolved' : 'Resolve'}
            </button>
          )}
        </div>

        {/* Content */}
        {isEditing ? (
          <form onSubmit={(e) => onSubmitEdit(e, comment.id)} className="mt-1">
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
              autoFocus
            />
            <div className="flex gap-1 mt-1">
              <button
                type="submit"
                disabled={!editText.trim() || isPending}
                className="px-2 py-0.5 text-2xs text-text-inverse bg-accent hover:bg-accent-hover disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-2 py-0.5 text-2xs text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-text">{comment.content}</p>
        )}

        {/* Actions */}
        {!isEditing && !comment.resolved && (
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => onReply(comment.id)}
              className="text-2xs text-text-muted hover:text-accent"
            >
              Reply
            </button>
            <button
              onClick={() => onEdit(comment)}
              className="text-2xs text-text-muted hover:text-accent"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(comment.id)}
              disabled={isPending}
              className="text-2xs text-text-muted hover:text-danger"
            >
              Delete
            </button>
          </div>
        )}

        {/* Reply form */}
        {isReplying && (
          <form onSubmit={(e) => onSubmitReply(e, comment.id)} className="mt-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              className="w-full px-2 py-1 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
              autoFocus
            />
            <div className="flex gap-1 mt-1">
              <button
                type="submit"
                disabled={!replyText.trim() || isPending}
                className="px-2 py-0.5 text-2xs text-text-inverse bg-accent hover:bg-accent-hover disabled:opacity-50"
              >
                Reply
              </button>
              <button
                type="button"
                onClick={onCancelReply}
                className="px-2 py-0.5 text-2xs text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              editingId={editingId}
              editText={editText}
              setEditText={setEditText}
              replyingTo={replyingTo}
              replyText={replyText}
              setReplyText={setReplyText}
              onEdit={onEdit}
              onReply={onReply}
              onCancelEdit={onCancelEdit}
              onCancelReply={onCancelReply}
              onSubmitEdit={onSubmitEdit}
              onSubmitReply={onSubmitReply}
              onDelete={onDelete}
              onResolve={onResolve}
              isPending={isPending}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
