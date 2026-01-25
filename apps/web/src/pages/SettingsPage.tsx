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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab('members')}
            className={`py-4 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'members'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`py-4 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-4 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
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
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: membersData, isLoading } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => orgsApi.listMembers(orgId),
  });

  const members = membersData?.items ?? [];
  const canManage = ['admin', 'project_manager'].includes(userRole);

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => orgsApi.removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Organization Members</h2>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            Add Member
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {members.map((member) => (
              <div key={member.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{member.user.name}</div>
                  <div className="text-sm text-gray-500">{member.user.email}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                    {formatOrgRole(member.role)}
                  </span>
                  {canManage && member.user.id !== currentUserId && (
                    <button
                      onClick={() => removeMutation.mutate(member.user.id)}
                      className="text-sm text-red-600 hover:text-red-700"
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

      {showAddModal && (
        <AddMemberModal
          orgId={orgId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
          }}
        />
      )}
    </div>
  );
}

function AddMemberModal({
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

  const addMutation = useMutation({
    mutationFn: () => orgsApi.addMember(orgId, { email, role }),
    onSuccess,
    onError: (err: any) => {
      setError(err.data?.error ?? 'Failed to add member');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    addMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Member</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="translator">Translator</option>
              <option value="reviewer">Reviewer</option>
              <option value="project_manager">Project Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {addMutation.isPending ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GeneralTab({ org }: { org: { id: string; name: string; slug: string; role: OrgRole } }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Organization Details</h2>
      <dl className="space-y-4">
        <div>
          <dt className="text-sm font-medium text-gray-500">Name</dt>
          <dd className="mt-1 text-gray-900">{org.name}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Slug</dt>
          <dd className="mt-1 text-gray-900">{org.slug}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Your Role</dt>
          <dd className="mt-1 text-gray-900">{formatOrgRole(org.role)}</dd>
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
    return <div className="animate-pulse bg-gray-100 h-48 rounded-lg" />;
  }

  // Backup codes display
  if (setupStep === 'backup') {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Save your backup codes</h2>
        <p className="text-sm text-gray-600 mb-4">
          Store these codes in a safe place. You can use them to access your account if you lose access to your authenticator app.
        </p>

        <div className="bg-gray-50 p-4 rounded-md mb-4 font-mono text-sm">
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <div key={i} className="text-gray-800">{code}</div>
            ))}
          </div>
        </div>

        <p className="text-sm text-red-600 mb-4">
          Each code can only be used once. Save them now - you won't be able to see them again.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => navigator.clipboard.writeText(backupCodes.join('\n'))}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Copy codes
          </button>
          <button
            onClick={handleDone}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Set up two-factor authentication</h2>

        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-4">
            Scan this QR code with your authenticator app (like Google Authenticator or Authy).
          </p>

          <div className="flex justify-center mb-4">
            <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
          </div>

          <p className="text-sm text-gray-500 mb-2">Or enter this code manually:</p>
          <code className="block bg-gray-50 p-2 rounded text-sm font-mono text-center select-all">
            {secret}
          </code>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleVerifySetup}>
          <div className="mb-4">
            <label htmlFor="verifyCode" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
              placeholder="000000"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSetupStep('idle')}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifySetupMutation.isPending || verifyCode.length !== 6}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Two-factor authentication</h2>
            <p className="text-sm text-gray-600 mt-1">
              Add an extra layer of security to your account by requiring a code from your authenticator app when signing in.
            </p>
          </div>
          <div className="ml-4">
            {mfaStatus?.mfaEnabled ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Enabled
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                Disabled
              </span>
            )}
          </div>
        </div>

        {error && setupStep === 'idle' && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200">
          {mfaStatus?.mfaEnabled ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                You have {mfaStatus.backupCodesCount} backup codes remaining.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRegenerateModal(true)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Regenerate backup codes
                </button>
                <button
                  onClick={() => setShowDisableModal(true)}
                  className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50"
                >
                  Disable MFA
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartSetup}
              disabled={setupMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {setupMutation.isPending ? 'Setting up...' : 'Enable two-factor authentication'}
            </button>
          )}
        </div>
      </div>

      {/* Disable MFA Modal */}
      {showDisableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Disable two-factor authentication</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter your password to confirm. Your account will be less secure without MFA.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleDisable}>
              <div className="mb-4">
                <label htmlFor="disablePassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="disablePassword"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDisableModal(false);
                    setPassword('');
                    setError('');
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disableMutation.isPending}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
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
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Regenerate backup codes</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will invalidate your existing backup codes. Enter your password to confirm.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleRegenerate}>
              <div className="mb-4">
                <label htmlFor="regeneratePassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="regeneratePassword"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRegenerateModal(false);
                    setPassword('');
                    setError('');
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={regenerateMutation.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
