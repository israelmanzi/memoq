import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from '@tanstack/react-router';
import { orgsApi } from '../api';
import { useAuthStore } from '../stores/auth';
import { useOrgStore } from '../stores/org';
import { formatOrgRole } from '../utils/formatters';

export function AcceptInvitationPage() {
  const { token } = useParams({ from: '/invitations/$token' });
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { setCurrentOrg } = useOrgStore();
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const { data: invitation, isLoading, error } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => orgsApi.getInvitation(token),
  });

  const acceptMutation = useMutation({
    mutationFn: () => orgsApi.acceptInvitation(token),
    onSuccess: async (data) => {
      // Navigate to dashboard with the new org
      if (data.orgId) {
        // Fetch the org details to set as current
        try {
          const org = await orgsApi.get(data.orgId);
          setCurrentOrg(org);
        } catch {
          // Org fetch failed, just navigate
        }
      }
      navigate({ to: '/dashboard' });
    },
    onError: (err: any) => {
      setAcceptError(err.data?.error ?? 'Failed to accept invitation');
    },
  });

  // Auto-accept if logged in with matching email
  useEffect(() => {
    if (
      isAuthenticated &&
      user &&
      invitation?.isValid &&
      invitation.email.toLowerCase() === user.email.toLowerCase() &&
      !acceptMutation.isPending &&
      !acceptMutation.isSuccess &&
      !acceptError
    ) {
      // Don't auto-accept, let user click the button
    }
  }, [isAuthenticated, user, invitation, acceptMutation.isPending, acceptMutation.isSuccess, acceptError]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-danger-bg flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-text mb-2">Invitation Not Found</h1>
          <p className="text-xs text-text-secondary mb-4">
            This invitation link is invalid or has been removed.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!invitation.isValid) {
    const isExpired = invitation.status === 'expired';
    const isAccepted = invitation.status === 'accepted';
    const isCancelled = invitation.status === 'cancelled';

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-md">
          <div className={`w-12 h-12 flex items-center justify-center mx-auto mb-3 ${
            isAccepted ? 'bg-success-bg' : 'bg-warning-bg'
          }`}>
            {isAccepted ? (
              <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
          <h1 className="text-lg font-semibold text-text mb-2">
            {isExpired && 'Invitation Expired'}
            {isAccepted && 'Invitation Already Accepted'}
            {isCancelled && 'Invitation Cancelled'}
          </h1>
          <p className="text-xs text-text-secondary mb-4">
            {isExpired && 'This invitation has expired. Please ask the organization admin to send a new invitation.'}
            {isAccepted && 'This invitation has already been used. You should already have access to the organization.'}
            {isCancelled && 'This invitation has been cancelled by the organization admin.'}
          </p>
          <Link
            to={isAuthenticated ? '/dashboard' : '/login'}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
          >
            {isAuthenticated ? 'Go to Dashboard' : 'Go to Login'}
          </Link>
        </div>
      </div>
    );
  }

  // Valid invitation
  const emailMatches = isAuthenticated && user && user.email.toLowerCase() === invitation.email.toLowerCase();
  const emailMismatch = isAuthenticated && user && user.email.toLowerCase() !== invitation.email.toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="bg-surface-alt border border-border p-6">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="w-12 h-12 bg-accent/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-text mb-1">You're Invited!</h1>
            {invitation.invitedBy && (
              <p className="text-xs text-text-secondary">
                <strong className="text-text">{invitation.invitedBy.name}</strong> invited you to join
              </p>
            )}
          </div>

          {/* Organization info */}
          <div className="bg-surface-panel border border-border p-3 mb-4">
            <div className="text-center">
              <h2 className="text-base font-semibold text-text mb-0.5">
                {invitation.organization?.name}
              </h2>
              <p className="text-2xs text-text-muted">
                as <span className="font-medium text-text-secondary">{formatOrgRole(invitation.role as any)}</span>
              </p>
            </div>
          </div>

          {/* Invitation details */}
          <div className="text-2xs text-text-muted mb-4 text-center">
            <p>Invitation sent to: <strong className="text-text-secondary">{invitation.email}</strong></p>
            <p className="mt-0.5">
              Expires: {new Date(invitation.expiresAt).toLocaleDateString()}
            </p>
          </div>

          {/* Error message */}
          {acceptError && (
            <div className="mb-4 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
              {acceptError}
            </div>
          )}

          {/* Action buttons */}
          {emailMatches ? (
            <button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              className="w-full py-2 bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {acceptMutation.isPending ? 'Accepting...' : 'Accept Invitation'}
            </button>
          ) : emailMismatch ? (
            <div className="space-y-3">
              <div className="p-2 bg-warning-bg border border-warning/20 text-xs text-warning">
                You're logged in as <strong>{user?.email}</strong>, but this invitation was sent to <strong>{invitation.email}</strong>.
              </div>
              <div className="flex gap-2">
                <Link
                  to="/login"
                  className="flex-1 py-2 text-center text-xs font-medium text-text-secondary bg-surface-panel hover:bg-surface-hover transition-colors"
                >
                  Switch Account
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Link
                to="/login"
                search={{ redirect: `/invitations/${token}` }}
                className="block w-full py-2 text-center bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Log in to Accept
              </Link>
              <p className="text-center text-2xs text-text-muted">
                Don't have an account?{' '}
                <Link
                  to="/register"
                  search={{ redirect: `/invitations/${token}`, email: invitation.email }}
                  className="text-accent hover:text-accent-hover font-medium"
                >
                  Sign up
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
