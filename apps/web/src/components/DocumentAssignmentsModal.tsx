import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, orgsApi } from '../api';
import type { DocumentRole, DocumentAssignmentWithUser, WorkflowType } from '@oxy/shared';
import { formatDocumentRole } from '../utils/formatters';
import { useToastActions } from './Toast';

interface Props {
  documentId: string;
  orgId: string;
  workflowStatus: string;
  workflowType: WorkflowType;
  onClose: () => void;
  onAssignmentChange?: () => void;
}

/**
 * Get the required roles for a given workflow type
 */
function getRolesForWorkflow(workflowType: WorkflowType): DocumentRole[] {
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

export function DocumentAssignmentsModal({
  documentId,
  orgId,
  workflowStatus,
  workflowType,
  onClose,
  onAssignmentChange,
}: Props) {
  const queryClient = useQueryClient();
  const toast = useToastActions();
  const [selectedRole, setSelectedRole] = useState<DocumentRole>('translator');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Get roles relevant to this workflow type
  const relevantRoles = getRolesForWorkflow(workflowType);

  // Fetch current assignments
  const { data: assignmentsData } = useQuery({
    queryKey: ['document-assignments', documentId],
    queryFn: () => projectsApi.listAssignments(documentId),
  });

  // Fetch org members for user picker
  const { data: membersData } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => orgsApi.listMembers(orgId),
  });

  const assignments = assignmentsData?.items ?? [];
  const members = membersData?.items ?? [];

  // Get assignment for a role
  const getAssignment = (role: DocumentRole): DocumentAssignmentWithUser | undefined => {
    return assignments.find((a) => a.role === role);
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['document-assignments', documentId] });
    queryClient.invalidateQueries({ queryKey: ['document', documentId] });
    setSelectedUserId('');
    setError(null);
    onAssignmentChange?.();
  };

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: DocumentRole }) =>
      projectsApi.assignUser(documentId, userId, role),
    onSuccess: handleSuccess,
    onError: (err: any) => {
      const message = err.data?.error ?? 'Failed to assign user';
      setError(message);
      toast.error(message);
    },
  });

  // Claim mutation (self-assign)
  const claimMutation = useMutation({
    mutationFn: (role: DocumentRole) => projectsApi.claimRole(documentId, role),
    onSuccess: handleSuccess,
    onError: (err: any) => {
      const message = err.data?.error ?? 'Failed to claim role';
      setError(message);
      toast.error(message);
    },
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: (role: DocumentRole) => projectsApi.removeAssignment(documentId, role),
    onSuccess: handleSuccess,
    onError: (err: any) => {
      const message = err.data?.error ?? 'Failed to remove assignment';
      setError(message);
      toast.error(message);
    },
  });

  const handleAssign = () => {
    if (!selectedUserId) return;
    assignMutation.mutate({ userId: selectedUserId, role: selectedRole });
  };

  // Determine which role is active based on workflow status
  const activeRole =
    workflowStatus === 'translation'
      ? 'translator'
      : workflowStatus === 'review_1'
        ? 'reviewer_1'
        : workflowStatus === 'review_2'
          ? 'reviewer_2'
          : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-lg mx-4 rounded-sm">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Document Assignments</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text hover:bg-surface-hover rounded-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-2.5 bg-danger-bg border border-danger/20 text-sm text-danger rounded-sm">
              {error}
            </div>
          )}

          {/* Current Assignments */}
          <div>
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
              Current Assignments
            </h3>
            <div className="space-y-2">
              {relevantRoles.map((role) => {
                const assignment = getAssignment(role);
                const isActive = activeRole === role;

                return (
                  <div
                    key={role}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border rounded-sm ${
                      isActive ? 'border-accent bg-accent/5' : 'border-border bg-surface-panel'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm font-medium ${isActive ? 'text-accent' : 'text-text'}`}>
                        {formatDocumentRole(role)}
                      </span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-accent text-white rounded-sm shrink-0">
                          Active
                        </span>
                      )}
                    </div>

                    {assignment ? (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-left sm:text-right min-w-0 flex-1">
                          <div className="text-sm text-text truncate">{assignment.user.name}</div>
                          <div className="text-xs text-text-muted truncate">{assignment.user.email}</div>
                        </div>
                        <button
                          onClick={() => removeMutation.mutate(role)}
                          disabled={removeMutation.isPending}
                          className="p-1.5 text-text-muted hover:text-danger hover:bg-danger-bg rounded-sm disabled:opacity-50 shrink-0"
                          title="Remove assignment"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-muted">Unassigned</span>
                        <button
                          onClick={() => claimMutation.mutate(role)}
                          disabled={claimMutation.isPending}
                          className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-sm disabled:opacity-50"
                        >
                          Claim
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Assign User Form */}
          <div className="pt-3 border-t border-border">
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
              Assign User
            </h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as DocumentRole)}
                className="w-full sm:w-auto px-2.5 py-2 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none rounded-sm"
              >
                {relevantRoles.map((role) => (
                  <option key={role} value={role}>
                    {formatDocumentRole(role)}
                  </option>
                ))}
              </select>

              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full sm:flex-1 px-2.5 py-2 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none rounded-sm"
              >
                <option value="">Select user...</option>
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name} ({member.user.email})
                  </option>
                ))}
              </select>

              <button
                onClick={handleAssign}
                disabled={!selectedUserId || assignMutation.isPending}
                className="w-full sm:w-auto px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent-hover rounded-sm disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
