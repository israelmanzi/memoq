import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from '@tanstack/react-router';
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
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { currentOrg, setCurrentOrg } = useOrgStore();
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: "/" to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    logout();
    navigate({ to: '/login' });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      navigate({ to: '/search', search: { q: searchQuery.trim() } });
      setSearchQuery('');
    }
  };

  const { data: orgsData, isLoading: orgsLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: orgsApi.list,
  });

  const orgs = orgsData?.items ?? [];
  const hasOrgs = orgs.length > 0;

  // Auto-select org when orgs are loaded
  useEffect(() => {
    if (orgsLoading || orgs.length === 0) return;

    // If no org selected, select the first one
    if (!currentOrg) {
      setCurrentOrg(orgs[0]!);
      return;
    }

    // Validate that the persisted org still exists in user's org list
    const orgStillExists = orgs.some(org => org.id === currentOrg.id);
    if (!orgStillExists) {
      // Persisted org no longer valid, select first available
      setCurrentOrg(orgs[0]!);
    }
  }, [orgsLoading, orgs, currentOrg, setCurrentOrg]);

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-surface-alt border-b border-border">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-12">
            {/* Left: Logo + Org Switcher */}
            <div className="flex items-center gap-6">
              <Link to="/dashboard" className="text-base font-bold text-text">
                OXY
              </Link>
              {hasOrgs && <OrgSwitcher />}
            </div>

            {/* Center: Global Search */}
            {currentOrg && (
              <form onSubmit={handleSearch} className="flex-1 max-w-md mx-8">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search projects, documents, segments, TM, terms..."
                    className="w-full pl-8 pr-12 py-1.5 text-xs bg-surface border border-border text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs text-text-muted border border-border-light px-1 py-0.5 bg-surface-panel">
                    /
                  </span>
                </div>
              </form>
            )}

            {/* Right: User Menu */}
            <div className="flex items-center gap-3">
              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text"
                >
                  <span>{user?.name}</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute right-0 mt-1 w-44 bg-surface-alt border border-border shadow-lg z-20">
                      <div className="py-1">
                        <div className="px-3 py-2 text-2xs text-text-muted border-b border-border-light">
                          {user?.email}
                        </div>
                        <Link
                          to="/settings"
                          onClick={() => setShowUserMenu(false)}
                          className="block px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
                        >
                          Settings
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="block w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      {currentOrg && (
        <nav className="bg-surface-alt border-b border-border">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-6">
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      isActive
                        ? 'border-accent text-accent'
                        : 'border-transparent text-text-muted hover:text-text'
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
      <main className="max-w-7xl mx-auto">
        {orgsLoading ? (
          <div className="text-center py-12 text-text-muted text-sm">Loading...</div>
        ) : !hasOrgs ? (
          <div className="text-center py-12">
            <h2 className="text-lg font-semibold text-text mb-2">
              Welcome to OXY!
            </h2>
            <p className="text-sm text-text-secondary mb-4">
              Create your first organization to get started.
            </p>
            <button
              onClick={() => setShowCreateOrg(true)}
              className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
            >
              Create Organization
            </button>
          </div>
        ) : currentOrg ? (
          <Outlet />
        ) : (
          <div className="text-center py-12">
            <h2 className="text-lg font-semibold text-text mb-2">
              Select an Organization
            </h2>
            <p className="text-sm text-text-secondary">
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
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md p-4">
        <h2 className="text-sm font-semibold text-text mb-3">Create Organization</h2>

        {error && (
          <div className="mb-3 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Organization Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Company"
              className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Slug (URL identifier)
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-company"
              className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-2xs text-text-muted">
              Only lowercase letters, numbers, and dashes
            </p>
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
              disabled={createMutation.isPending}
              className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
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
