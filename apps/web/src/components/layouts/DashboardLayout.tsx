import { useState } from 'react';
import { Outlet, Link, useLocation } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth';
import { useOrgStore } from '../../stores/org';
import { OrgSwitcher } from '../OrgSwitcher';
import { orgsApi } from '../../api';

const navItems = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/projects', label: 'Projects' },
  { path: '/tm', label: 'Translation Memory' },
  { path: '/tb', label: 'Term Base' },
  { path: '/settings', label: 'Settings' },
];

export function DashboardLayout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { currentOrg, setCurrentOrg } = useOrgStore();
  const [showCreateOrg, setShowCreateOrg] = useState(false);

  const { data: orgsData, isLoading: orgsLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: orgsApi.list,
  });

  const orgs = orgsData?.items ?? [];
  const hasOrgs = orgs.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/dashboard" className="text-xl font-bold text-gray-900">
                MemoQ
              </Link>
              {hasOrgs && <OrgSwitcher />}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user?.name}</span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      {currentOrg && (
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-8">
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`py-4 text-sm font-medium border-b-2 -mb-px ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {orgsLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : !hasOrgs ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Welcome to MemoQ!
            </h2>
            <p className="text-gray-600 mb-6">
              Create your first organization to get started.
            </p>
            <button
              onClick={() => setShowCreateOrg(true)}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
            >
              Create Organization
            </button>
          </div>
        ) : currentOrg ? (
          <Outlet />
        ) : (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Select an Organization
            </h2>
            <p className="text-gray-600">
              Choose an organization from the dropdown above to get started.
            </p>
          </div>
        )}
      </main>

      {/* Create Org Modal */}
      {showCreateOrg && (
        <CreateOrgModal
          onClose={() => setShowCreateOrg(false)}
          onSuccess={(org) => {
            setShowCreateOrg(false);
            setCurrentOrg(org);
          }}
        />
      )}
    </div>
  );
}

function CreateOrgModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (org: any) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: () => orgsApi.create({ name, slug }),
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onSuccess({ ...org, role: 'admin' as const });
    },
    onError: (err: any) => {
      setError(err.data?.error ?? 'Failed to create organization');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    createMutation.mutate();
  };

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Organization</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Company"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug (URL identifier)
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-company"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">
              Only lowercase letters, numbers, and dashes
            </p>
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
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}
