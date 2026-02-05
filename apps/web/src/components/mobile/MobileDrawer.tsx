import { useEffect, useRef } from 'react';
import { Link, useLocation } from '@tanstack/react-router';

interface NavItem {
  path: string;
  label: string;
  icon?: React.ReactNode;
}

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavItem[];
  user?: { name: string; email: string } | null;
  onLogout: () => void;
  orgSwitcher?: React.ReactNode;
  currentOrg?: { name: string } | null;
}

export function MobileDrawer({
  isOpen,
  onClose,
  navItems,
  user,
  onLogout,
  orgSwitcher,
  currentOrg,
}: MobileDrawerProps) {
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Close on navigation (when pathname changes)
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
  }, [location.pathname]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="mobile-drawer-overlay animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className="mobile-drawer animate-slide-in-left safe-top safe-bottom flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Link to="/dashboard" className="text-lg font-bold text-text" onClick={onClose}>
            OXY
          </Link>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-text-secondary hover:text-text min-h-touch min-w-touch flex items-center justify-center"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Org Switcher */}
        {currentOrg && (
          <div className="px-4 py-3 border-b border-border bg-surface-panel">
            <div className="text-2xs text-text-muted uppercase tracking-wider mb-2">
              Organization
            </div>
            {orgSwitcher}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 min-h-touch text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent border-l-3 border-accent'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                }`}
              >
                {item.icon && <span className="w-5 h-5">{item.icon}</span>}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        {user && (
          <div className="border-t border-border bg-surface-panel">
            <div className="px-4 py-3">
              <div className="text-sm font-medium text-text">{user.name}</div>
              <div className="text-xs text-text-muted truncate">{user.email}</div>
            </div>
            <div className="px-2 pb-2 flex gap-2">
              <Link
                to="/settings"
                onClick={onClose}
                className="flex-1 px-3 py-2.5 text-xs font-medium text-center text-text-secondary bg-surface border border-border hover:bg-surface-hover transition-colors"
              >
                Settings
              </Link>
              <button
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="flex-1 px-3 py-2.5 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-hover transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// Hamburger button component
export function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 -ml-2 text-text-secondary hover:text-text min-h-touch min-w-touch flex items-center justify-center md:hidden"
      aria-label="Open menu"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
