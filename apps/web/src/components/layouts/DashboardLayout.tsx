import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth';
import { useOrgStore } from '../../stores/org';
import { OrgSwitcher } from '../OrgSwitcher';
import { orgsApi } from '../../api';
import { MobileDrawer, HamburgerButton } from '../mobile';

const navItems = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
      </svg>
    ),
  },
  {
    path: '/projects',
    label: 'Projects',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    path: '/tm',
    label: 'Translation Memory',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm0 5h16M9 4v16" />
      </svg>
    ),
  },
  {
    path: '/tb',
    label: 'Term Base',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    path: '/analytics',
    label: 'Analytics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { currentOrg, setCurrentOrg } = useOrgStore();
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
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
    // Clear all cached data to prevent stale data when another user logs in
    queryClient.clear();
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
      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        navItems={navItems}
        user={user}
        onLogout={handleLogout}
        currentOrg={currentOrg}
        orgSwitcher={hasOrgs ? <OrgSwitcher /> : undefined}
      />

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-56 flex-col bg-surface-alt border-r border-border">
        {/* Logo */}
        <div className="flex items-center h-12 px-4 border-b border-border">
          <Link to="/dashboard" className="text-base font-bold text-text">
            OXY
          </Link>
        </div>

        {/* Org Switcher */}
        {hasOrgs && (
          <div className="px-3 py-3 border-b border-border">
            <div className="text-2xs text-text-muted uppercase tracking-wider mb-2">
              Organization
            </div>
            <OrgSwitcher />
          </div>
        )}

        {/* Navigation */}
        {currentOrg && (
          <nav className="flex-1 overflow-y-auto py-2">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-accent/10 text-accent border-l-2 border-accent'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text border-l-2 border-transparent'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* User section at bottom */}
        {user && (
          <div className="mt-auto border-t border-border">
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {user.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-text truncate">{user.name}</div>
                  <div className="text-2xs text-text-muted truncate">{user.email}</div>
                </div>
                <svg className={`w-3 h-3 text-text-muted flex-shrink-0 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute bottom-full left-2 right-2 mb-1 bg-surface-alt border border-border shadow-lg z-20">
                    <div className="py-1">
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
        )}
      </aside>

      {/* Mobile Header */}
      <header className="bg-surface-alt border-b border-border sticky top-0 z-30 md:hidden">
        <div className="px-4">
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center gap-2">
              <HamburgerButton onClick={() => setMobileMenuOpen(true)} />
              <Link to="/dashboard" className="text-base font-bold text-text">
                OXY
              </Link>
            </div>

            {currentOrg && (
              <button
                onClick={() => setShowMobileSearch(!showMobileSearch)}
                className="p-2 text-text-secondary hover:text-text min-h-touch min-w-touch flex items-center justify-center"
                aria-label="Search"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Search Bar - expandable */}
        {showMobileSearch && currentOrg && (
          <div className="px-4 pb-3 border-t border-border-light bg-surface-alt">
            <form onSubmit={(e) => { handleSearch(e); setShowMobileSearch(false); }}>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-surface border border-border text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
              </div>
            </form>
          </div>
        )}
      </header>

      {/* Content area offset for sidebar on desktop */}
      <div className="md:ml-56">
        {/* Desktop Search Bar */}
        {currentOrg && (
          <div className="hidden md:block sticky top-0 z-20 bg-surface border-b border-border px-4 py-2">
            <form onSubmit={handleSearch} className="max-w-xl">
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
                  className="w-full pl-8 pr-12 py-1.5 text-xs bg-surface-alt border border-border text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs text-text-muted border border-border-light px-1 py-0.5 bg-surface-panel">
                  /
                </span>
              </div>
            </form>
          </div>
        )}

        {/* Main content */}
        <main className="px-4">
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
      </div>

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md p-4 max-h-[90vh] overflow-y-auto">
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
