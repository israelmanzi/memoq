import { Outlet, Link, useLocation } from '@tanstack/react-router';
import { useAuthStore } from '../../stores/auth';
import { useOrgStore } from '../../stores/org';
import { OrgSwitcher } from '../OrgSwitcher';

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
  const { currentOrg } = useOrgStore();

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
              <OrgSwitcher />
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
        {currentOrg ? (
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
    </div>
  );
}
