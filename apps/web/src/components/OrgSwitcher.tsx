import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { orgsApi } from '../api';
import { useOrgStore } from '../stores/org';
import { formatOrgRole } from '../utils/formatters';

export function OrgSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const { currentOrg, setCurrentOrg } = useOrgStore();

  const { data: orgsData } = useQuery({
    queryKey: ['organizations'],
    queryFn: orgsApi.list,
  });

  const orgs = orgsData?.items ?? [];

  // Auto-select first org if none selected
  if (!currentOrg && orgs.length > 0 && orgs[0]) {
    setCurrentOrg(orgs[0]);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
      >
        <span>{currentOrg?.name ?? 'Select Organization'}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
          <div className="absolute left-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-20">
            <div className="py-1">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => {
                    setCurrentOrg(org);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                    currentOrg?.id === org.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                  }`}
                >
                  <div className="font-medium">{org.name}</div>
                  <div className="text-xs text-gray-500">{formatOrgRole(org.role)}</div>
                </button>
              ))}
              {orgs.length === 0 && (
                <div className="px-4 py-2 text-sm text-gray-500">No organizations</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
