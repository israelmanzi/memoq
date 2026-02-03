import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { orgsApi } from '../api';
import { useOrgStore } from '../stores/org';
import { formatOrgRole } from '../utils/formatters';

export function OrgSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { currentOrg, setCurrentOrg } = useOrgStore();

  const { data: orgsData, refetch } = useQuery({
    queryKey: ['organizations'],
    queryFn: orgsApi.list,
  });

  const orgs = orgsData?.items ?? [];

  // Note: Auto-selection is handled in DashboardLayout useEffect

  const handleOrgCreated = async (newOrg: { id: string; name: string; slug: string }) => {
    await refetch();
    // Find the new org with role info and set as current
    const updatedOrgs = await orgsApi.list();
    const orgWithRole = updatedOrgs.items.find(o => o.id === newOrg.id);
    if (orgWithRole) {
      setCurrentOrg(orgWithRole);
    }
    setShowCreateModal(false);
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-text-secondary bg-surface-panel hover:bg-surface-hover transition-colors"
        >
          <span className="truncate max-w-[150px]">{currentOrg?.name ?? 'Select Organization'}</span>
          <svg
            className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 mt-1 w-64 bg-surface-alt border border-border shadow-lg z-20 overflow-hidden">
              {/* Organizations list */}
              <div className="max-h-64 overflow-y-auto">
                {orgs.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-text-muted">No organizations yet</div>
                ) : (
                  <div className="py-1">
                    {orgs.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          setCurrentOrg(org);
                          setIsOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs hover:bg-surface-hover flex items-center justify-between ${
                          currentOrg?.id === org.id ? 'bg-accent/5' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className={`font-medium truncate ${currentOrg?.id === org.id ? 'text-accent' : 'text-text'}`}>
                            {org.name}
                          </div>
                          <div className="text-2xs text-text-muted">{formatOrgRole(org.role)}</div>
                        </div>
                        {currentOrg?.id === org.id && (
                          <svg className="w-3.5 h-3.5 text-accent flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Create new org button */}
              <div className="border-t border-border p-1.5">
                <button
                  onClick={() => {
                    setShowCreateModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-accent hover:bg-accent/5 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Organization
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <CreateOrgModal
          onClose={() => {
            setShowCreateModal(false);
          }}
          onSuccess={handleOrgCreated}
        />
      )}
    </>
  );
}

function CreateOrgModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (org: { id: string; name: string; slug: string }) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => orgsApi.create({ name, slug }),
    onSuccess: (org) => {
      onSuccess(org);
    },
    onError: (err: any) => {
      setError(err.data?.error ?? 'Failed to create organization');
    },
  });

  // Auto-generate slug from name if user hasn't manually edited it
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) {
      const generatedSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setSlug(generatedSlug);
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    // Only allow lowercase, numbers, and dashes
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(sanitized);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }
    if (!slug.trim()) {
      setError('URL slug is required');
      return;
    }
    if (slug.length < 2) {
      setError('URL slug must be at least 2 characters');
      return;
    }

    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md p-4 mx-4">
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
              URL Slug
            </label>
            <div className="flex items-center">
              <span className="text-xs text-text-muted mr-1">org/</span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="my-company"
                className="flex-1 px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
              />
            </div>
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
