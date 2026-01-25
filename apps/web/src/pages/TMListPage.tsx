import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tmApi, type TMDeleteInfo } from '../api';
import { useOrgStore } from '../stores/org';
import { Pagination } from '../components/Pagination';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';

const PAGE_SIZE = 10;

export function TMListPage() {
  const queryClient = useQueryClient();
  const { currentOrg } = useOrgStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [offset, setOffset] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<TMDeleteInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tms', currentOrg?.id, offset],
    queryFn: () => tmApi.list(currentOrg!.id, { limit: PAGE_SIZE, offset }),
    enabled: !!currentOrg,
  });

  const tms = data?.items ?? [];
  const total = data?.total ?? 0;

  const handleDeleteClick = async (tm: { id: string; name: string }) => {
    setDeleteTarget(tm);
    try {
      const info = await tmApi.getDeleteInfo(tm.id);
      setDeleteInfo(info);
    } catch {
      setDeleteInfo({ unitCount: 0, linkedProjects: [] });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await tmApi.delete(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ['tms'] });
      setDeleteTarget(null);
      setDeleteInfo(null);
    } finally {
      setIsDeleting(false);
    }
  };

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
          <>
            <div className="divide-y divide-gray-200">
              {tms.map((tm) => (
                <TMRow key={tm.id} tm={tm} onDelete={handleDeleteClick} />
              ))}
            </div>
            <Pagination
              total={total}
              limit={PAGE_SIZE}
              offset={offset}
              onPageChange={setOffset}
            />
          </>
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

      {deleteTarget && deleteInfo && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => {
            setDeleteTarget(null);
            setDeleteInfo(null);
          }}
          onConfirm={handleDelete}
          mode="type-confirm"
          title="Delete Translation Memory"
          itemName={deleteTarget.name}
          impacts={deleteInfo.unitCount > 0 ? [{ label: 'translation units', count: deleteInfo.unitCount }] : []}
          linkedProjects={deleteInfo.linkedProjects}
          isDeleting={isDeleting}
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

function TMRow({ tm, onDelete }: { tm: { id: string; name: string; sourceLanguage: string; targetLanguage: string; createdAt?: Date | string; updatedAt?: Date | string; createdByName?: string | null }; onDelete: (tm: { id: string; name: string }) => void }) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [deleteUnitId, setDeleteUnitId] = useState<string | null>(null);

  const { data: tmDetail } = useQuery({
    queryKey: ['tm', tm.id],
    queryFn: () => tmApi.get(tm.id),
    enabled: isExpanded,
  });

  const { data: unitsData } = useQuery({
    queryKey: ['tm', tm.id, 'units'],
    queryFn: () => tmApi.listUnits(tm.id, 50, 0),
    enabled: isExpanded,
  });

  const deleteUnitMutation = useMutation({
    mutationFn: (unitId: string) => tmApi.deleteUnit(tm.id, unitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tm', tm.id] });
      queryClient.invalidateQueries({ queryKey: ['tm', tm.id, 'units'] });
      setDeleteUnitId(null);
    },
  });

  const units = unitsData?.items ?? [];

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
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete({ id: tm.id, name: tm.name });
            }}
            className="p-1 text-gray-400 hover:text-red-600 rounded"
            title="Delete TM"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isExpanded && tmDetail && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-6 text-sm mb-4">
            <div>
              <span className="text-gray-500">Units:</span>
              <span className="ml-2 text-gray-900 font-medium">{tmDetail.unitCount}</span>
            </div>
            <div>
              <span className="text-gray-500">Last entry:</span>
              <span className="ml-2 text-gray-900">
                {tmDetail.lastUpdated ? formatDate(tmDetail.lastUpdated) : 'No entries'}
              </span>
            </div>
          </div>

          {units.length > 0 && (
            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-5/12">
                      Source
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-5/12">
                      Target
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-2/12">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {units.map((unit) => (
                    <tr key={unit.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900 break-words">{unit.sourceText}</td>
                      <td className="px-3 py-2 text-gray-700 break-words">{unit.targetText}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setDeleteUnitId(unit.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Delete entry"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tmDetail.unitCount > 50 && (
                <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 border-t">
                  Showing 50 of {tmDetail.unitCount} entries
                </div>
              )}
            </div>
          )}

          {/* Delete Unit Confirmation */}
          {deleteUnitId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteUnitId(null)}>
              <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Entry</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Are you sure you want to delete this translation memory entry? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDeleteUnitId(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteUnitMutation.mutate(deleteUnitId)}
                    disabled={deleteUnitMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteUnitMutation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {units.length === 0 && tmDetail.unitCount === 0 && (
            <div className="text-sm text-gray-500 italic">No entries yet</div>
          )}
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
