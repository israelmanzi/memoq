import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgsApi } from '../api';
import { useOrgStore } from '../stores/org';
import { useAuthStore } from '../stores/auth';
import type { OrgRole } from '@memoq/shared';

export function SettingsPage() {
  const { currentOrg } = useOrgStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'members' | 'general'>('members');

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
        </nav>
      </div>

      {activeTab === 'members' && currentOrg && (
        <MembersTab orgId={currentOrg.id} userRole={currentOrg.role} currentUserId={user?.id} />
      )}

      {activeTab === 'general' && currentOrg && (
        <GeneralTab org={currentOrg} />
      )}
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
                    {member.role}
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
          <dd className="mt-1 text-gray-900 capitalize">{org.role.replace('_', ' ')}</dd>
        </div>
      </dl>
    </div>
  );
}
