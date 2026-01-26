import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgsApi, authApi, ApiError } from '../api';
import { useOrgStore } from '../stores/org';
import { useAuthStore } from '../stores/auth';
import { formatOrgRole } from '../utils/formatters';
import type { OrgRole } from '@oxy/shared';

export function SettingsPage() {
  const { currentOrg } = useOrgStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'members' | 'general' | 'security'>('members');

  return (
    <div className="p-4 bg-surface min-h-full space-y-4">
      <h1 className="text-lg font-semibold text-text">Settings</h1>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('members')}
            className={`py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'members'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'general'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'security'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            Security
          </button>
        </nav>
      </div>

      {activeTab === 'members' && currentOrg && (
        <MembersTab orgId={currentOrg.id} userRole={currentOrg.role} currentUserId={user?.id} />
      )}

      {activeTab === 'general' && currentOrg && (
        <GeneralTab org={currentOrg} />
      )}

      {activeTab === 'security' && <SecurityTab />}
    </div>
  );
}

function MembersTab({
  orgId,
  userRole,
  currentUserId,
}: {
  orgId: string;
  userRole: OrgRole;
  currentUserId?: string;
}) {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => orgsApi.listMembers(orgId),
  });

  const { data: invitationsData } = useQuery({
    queryKey: ['org-invitations', orgId],
    queryFn: () => orgsApi.listInvitations(orgId),
    enabled: ['admin', 'project_manager'].includes(userRole),
  });

  const members = membersData?.items ?? [];
  const invitations = invitationsData?.items ?? [];
  const pendingInvitations = invitations.filter(inv => !inv.isExpired);
  const canManage = ['admin', 'project_manager'].includes(userRole);

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => orgsApi.removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => orgsApi.cancelInvitation(orgId, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => orgsApi.resendInvitation(orgId, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
    },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Organization Members</h2>
        {canManage && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
          >
            Invite Member
          </button>
        )}
      </div>

      {/* Pending Invitations */}
      {canManage && pendingInvitations.length > 0 && (
        <div className="bg-warning-bg border border-warning/20">
          <div className="px-3 py-2 border-b border-warning/20">
            <h3 className="text-xs font-medium text-warning">
              Pending Invitations ({pendingInvitations.length})
            </h3>
          </div>
          <div className="divide-y divide-warning/10">
            {pendingInvitations.map((invitation) => (
              <div key={invitation.id} className="px-3 py-2 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-text">{invitation.email}</div>
                  <div className="text-2xs text-text-muted">
                    Invited as {formatOrgRole(invitation.role)} &bull; Expires{' '}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => resendInvitationMutation.mutate(invitation.id)}
                    disabled={resendInvitationMutation.isPending}
                    className="text-2xs text-accent hover:text-accent-hover disabled:opacity-50"
                  >
                    Resend
                  </button>
                  <button
                    onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                    disabled={cancelInvitationMutation.isPending}
                    className="text-2xs text-danger hover:text-danger-hover disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="bg-surface-alt border border-border">
        {membersLoading ? (
          <div className="px-4 py-6 text-center text-text-muted text-sm">Loading...</div>
        ) : members.length === 0 ? (
          <div className="px-4 py-6 text-center text-text-muted text-sm">No members yet</div>
        ) : (
          <div className="divide-y divide-border-light">
            {members.map((member) => (
              <div key={member.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text">{member.user.name}</div>
                  <div className="text-xs text-text-muted">{member.user.email}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 text-2xs font-medium bg-surface-panel text-text-secondary">
                    {formatOrgRole(member.role)}
                  </span>
                  {canManage && member.user.id !== currentUserId && (
                    <button
                      onClick={() => removeMutation.mutate(member.user.id)}
                      disabled={removeMutation.isPending}
                      className="text-xs text-danger hover:text-danger-hover disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInviteModal && (
        <InviteMemberModal
          orgId={orgId}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
          }}
        />
      )}
    </div>
  );
}

function InviteMemberModal({
  orgId,
  onClose,
  onSuccess,
}: {
  orgId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('translator');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: () => orgsApi.sendInvitation(orgId, { email, role }),
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    },
    onError: (err: any) => {
      const errorMsg = err.data?.error ?? 'Failed to send invitation';
      const details = err.data?.details ? `: ${err.data.details}` : '';
      setError(errorMsg + details);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    inviteMutation.mutate();
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md p-4 text-center">
          <div className="w-10 h-10 bg-success-bg flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-text mb-1">Invitation Sent!</h2>
          <p className="text-xs text-text-secondary">
            An invitation has been sent to <strong className="text-text">{email}</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md p-4">
        <h2 className="text-sm font-semibold text-text mb-2">Invite Member</h2>

        <p className="text-xs text-text-secondary mb-3">
          Send an invitation email to join your organization. If they don't have an account, they'll be prompted to create one.
        </p>

        {error && (
          <div className="mb-3 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
              className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
            >
              <option value="translator">Translator</option>
              <option value="reviewer">Reviewer</option>
              <option value="project_manager">Project Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GeneralTab({ org }: { org: { id: string; name: string; slug: string; role: OrgRole } }) {
  return (
    <div className="bg-surface-alt border border-border p-4">
      <h2 className="text-sm font-semibold text-text mb-3">Organization Details</h2>
      <dl className="space-y-3">
        <div>
          <dt className="text-xs font-medium text-text-muted">Name</dt>
          <dd className="mt-0.5 text-sm text-text">{org.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-muted">Slug</dt>
          <dd className="mt-0.5 text-sm text-text">{org.slug}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-muted">Your Role</dt>
          <dd className="mt-0.5 text-sm text-text">{formatOrgRole(org.role)}</dd>
        </div>
      </dl>
    </div>
  );
}

function SecurityTab() {
  const queryClient = useQueryClient();
  const [setupStep, setSetupStep] = useState<'idle' | 'setup' | 'verify' | 'backup'>('idle');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);

  const { data: mfaStatus, isLoading } = useQuery({
    queryKey: ['mfa-status'],
    queryFn: () => authApi.mfa.getStatus(),
  });

  const setupMutation = useMutation({
    mutationFn: () => authApi.mfa.setup(),
    onSuccess: (data) => {
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setSetupStep('setup');
      setError('');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Setup failed');
      } else {
        setError('An error occurred');
      }
    },
  });

  const verifySetupMutation = useMutation({
    mutationFn: () => authApi.mfa.verifySetup(verifyCode),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setSetupStep('backup');
      queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      setError('');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Verification failed');
      } else {
        setError('An error occurred');
      }
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => authApi.mfa.disable(password),
    onSuccess: () => {
      setShowDisableModal(false);
      setPassword('');
      queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      setError('');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Failed to disable MFA');
      } else {
        setError('An error occurred');
      }
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => authApi.mfa.regenerateBackupCodes(password),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setShowRegenerateModal(false);
      setSetupStep('backup');
      setPassword('');
      queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      setError('');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Failed to regenerate codes');
      } else {
        setError('An error occurred');
      }
    },
  });

  const handleStartSetup = () => {
    setError('');
    setupMutation.mutate();
  };

  const handleVerifySetup = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    verifySetupMutation.mutate();
  };

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    disableMutation.mutate();
  };

  const handleRegenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    regenerateMutation.mutate();
  };

  const handleDone = () => {
    setSetupStep('idle');
    setBackupCodes([]);
    setVerifyCode('');
    setQrCode('');
    setSecret('');
  };

  if (isLoading) {
    return <div className="animate-pulse bg-surface-panel h-40" />;
  }

  // Backup codes display
  if (setupStep === 'backup') {
    return (
      <div className="bg-surface-alt p-4 border border-border">
        <h2 className="text-sm font-semibold text-text mb-3">Save your backup codes</h2>
        <p className="text-xs text-text-secondary mb-3">
          Store these codes in a safe place. You can use them to access your account if you lose access to your authenticator app.
        </p>

        <div className="bg-surface-panel p-3 mb-3 font-mono text-xs">
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <div key={i} className="text-text">{code}</div>
            ))}
          </div>
        </div>

        <p className="text-xs text-danger mb-3">
          Each code can only be used once. Save them now - you won't be able to see them again.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(backupCodes.join('\n'))}
            className="px-3 py-1.5 text-xs border border-border hover:bg-surface-hover transition-colors"
          >
            Copy codes
          </button>
          <button
            onClick={handleDone}
            className="px-3 py-1.5 text-xs bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // MFA setup - QR code display
  if (setupStep === 'setup') {
    return (
      <div className="bg-surface-alt p-4 border border-border">
        <h2 className="text-sm font-semibold text-text mb-3">Set up two-factor authentication</h2>

        <div className="mb-4">
          <p className="text-xs text-text-secondary mb-3">
            Scan this QR code with your authenticator app (like Google Authenticator or Authy).
          </p>

          <div className="flex justify-center mb-3">
            <img src={qrCode} alt="MFA QR Code" className="w-40 h-40" />
          </div>

          <p className="text-2xs text-text-muted mb-1">Or enter this code manually:</p>
          <code className="block bg-surface-panel p-2 text-xs font-mono text-center select-all">
            {secret}
          </code>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleVerifySetup}>
          <div className="mb-3">
            <label htmlFor="verifyCode" className="block text-xs font-medium text-text-secondary mb-1">
              Enter the 6-digit code from your app
            </label>
            <input
              id="verifyCode"
              type="text"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              className="w-full max-w-xs px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none text-center tracking-widest"
              placeholder="000000"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSetupStep('idle')}
              className="px-3 py-1.5 text-xs border border-border hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifySetupMutation.isPending || verifyCode.length !== 6}
              className="px-3 py-1.5 text-xs bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {verifySetupMutation.isPending ? 'Verifying...' : 'Verify and enable'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Main security settings view
  return (
    <>
      <div className="bg-surface-alt p-4 border border-border">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-medium text-text">Two-factor authentication</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Add an extra layer of security to your account by requiring a code from your authenticator app when signing in.
            </p>
          </div>
          <div className="ml-4">
            {mfaStatus?.mfaEnabled ? (
              <span className="inline-flex items-center px-2 py-0.5 text-2xs font-medium bg-success-bg text-success">
                Enabled
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 text-2xs font-medium bg-surface-panel text-text-muted">
                Disabled
              </span>
            )}
          </div>
        </div>

        {error && setupStep === 'idle' && (
          <div className="mt-3 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border">
          {mfaStatus?.mfaEnabled ? (
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">
                You have {mfaStatus.backupCodesCount} backup codes remaining.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRegenerateModal(true)}
                  className="px-3 py-1.5 text-xs border border-border hover:bg-surface-hover transition-colors"
                >
                  Regenerate backup codes
                </button>
                <button
                  onClick={() => setShowDisableModal(true)}
                  className="px-3 py-1.5 text-xs text-danger border border-danger/30 hover:bg-danger-bg transition-colors"
                >
                  Disable MFA
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartSetup}
              disabled={setupMutation.isPending}
              className="px-3 py-1.5 text-xs bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {setupMutation.isPending ? 'Setting up...' : 'Enable two-factor authentication'}
            </button>
          )}
        </div>
      </div>

      {/* Disable MFA Modal */}
      {showDisableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-alt border border-border shadow-xl max-w-md w-full mx-4 p-4">
            <h3 className="text-sm font-semibold text-text mb-2">Disable two-factor authentication</h3>
            <p className="text-xs text-text-secondary mb-3">
              Enter your password to confirm. Your account will be less secure without MFA.
            </p>

            {error && (
              <div className="mb-3 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleDisable}>
              <div className="mb-3">
                <label htmlFor="disablePassword" className="block text-xs font-medium text-text-secondary mb-1">
                  Password
                </label>
                <input
                  id="disablePassword"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDisableModal(false);
                    setPassword('');
                    setError('');
                  }}
                  className="px-3 py-1.5 text-xs border border-border hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disableMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-danger text-white hover:bg-danger-hover disabled:opacity-50 transition-colors"
                >
                  {disableMutation.isPending ? 'Disabling...' : 'Disable MFA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Regenerate Backup Codes Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-alt border border-border shadow-xl max-w-md w-full mx-4 p-4">
            <h3 className="text-sm font-semibold text-text mb-2">Regenerate backup codes</h3>
            <p className="text-xs text-text-secondary mb-3">
              This will invalidate your existing backup codes. Enter your password to confirm.
            </p>

            {error && (
              <div className="mb-3 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleRegenerate}>
              <div className="mb-3">
                <label htmlFor="regeneratePassword" className="block text-xs font-medium text-text-secondary mb-1">
                  Password
                </label>
                <input
                  id="regeneratePassword"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRegenerateModal(false);
                    setPassword('');
                    setError('');
                  }}
                  className="px-3 py-1.5 text-xs border border-border hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={regenerateMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {regenerateMutation.isPending ? 'Regenerating...' : 'Regenerate codes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
