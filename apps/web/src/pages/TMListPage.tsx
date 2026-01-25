import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tmApi } from '../api';
import { useOrgStore } from '../stores/org';

export function TMListPage() {
  const queryClient = useQueryClient();
  const { currentOrg } = useOrgStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tms', currentOrg?.id],
    queryFn: () => tmApi.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const tms = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Translation Memories</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          New TM
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-gray-500">Loading...</div>
        ) : tms.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No translation memories. Create one to start building your TM.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {tms.map((tm) => (
              <TMRow key={tm.id} tm={tm} />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateTMModal
          orgId={currentOrg!.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['tms'] });
          }}
        />
      )}
    </div>
  );
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TMRow({ tm }: { tm: { id: string; name: string; sourceLanguage: string; targetLanguage: string; createdAt?: Date | string; updatedAt?: Date | string; createdByName?: string } }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: tmDetail } = useQuery({
    queryKey: ['tm', tm.id],
    queryFn: () => tmApi.get(tm.id),
    enabled: isExpanded,
  });

  return (
    <div className="px-6 py-4">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-900">{tm.name}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              {tm.sourceLanguage}
            </span>
            <span className="text-gray-400">→</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              {tm.targetLanguage}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500 flex items-center gap-4">
            <span>Created {formatDate(tm.createdAt)}</span>
            {tm.createdByName && <span>by {tm.createdByName}</span>}
            {tm.updatedAt && tm.updatedAt !== tm.createdAt && (
              <span>• Modified {formatDate(tm.updatedAt)}</span>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isExpanded && tmDetail && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Units:</span>
              <span className="ml-2 text-gray-900">{tmDetail.unitCount}</span>
            </div>
            <div>
              <span className="text-gray-500">Last entry:</span>
              <span className="ml-2 text-gray-900">
                {tmDetail.lastUpdated
                  ? formatDate(tmDetail.lastUpdated)
                  : 'No entries'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTMModal({
  orgId,
  onClose,
  onSuccess,
}: {
  orgId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('');

  const createMutation = useMutation({
    mutationFn: () => tmApi.create(orgId, { name, sourceLanguage, targetLanguage }),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Translation Memory</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Language</label>
              <input
                type="text"
                required
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                placeholder="e.g., en"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Language</label>
              <input
                type="text"
                required
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                placeholder="e.g., de"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
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
              {createMutation.isPending ? 'Creating...' : 'Create TM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
