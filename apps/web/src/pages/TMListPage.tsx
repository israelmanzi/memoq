import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tmApi, type TMDeleteInfo, type TMXUploadResult } from '../api';
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
    <div className="p-4 bg-surface min-h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-text">Translation Memories</h1>
          <p className="text-xs text-text-muted" title="Translation Memories store previously translated content for reuse">
            Reusable translation segment pairs
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
          title="Create a new Translation Memory"
        >
          New TM
        </button>
      </div>

      <div className="bg-surface-alt border border-border">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-text-muted text-sm">Loading...</div>
        ) : tms.length === 0 ? (
          <div className="px-4 py-8 text-center text-text-muted text-sm">
            No translation memories. Create one to start building your TM.
          </div>
        ) : (
          <>
            <div className="divide-y divide-border-light">
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
  const [showUploadModal, setShowUploadModal] = useState(false);

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

  // Escape key handler for delete modal
  useEffect(() => {
    if (!deleteUnitId) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDeleteUnitId(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [deleteUnitId]);

  const units = unitsData?.items ?? [];

  return (
    <div className="px-4 py-3">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-text">{tm.name}</span>
            <span className="px-1.5 py-0.5 text-2xs font-medium bg-surface-panel text-text-secondary">
              {tm.sourceLanguage}
            </span>
            <span className="text-text-muted">→</span>
            <span className="px-1.5 py-0.5 text-2xs font-medium bg-surface-panel text-text-secondary">
              {tm.targetLanguage}
            </span>
          </div>
          <div className="mt-0.5 text-2xs text-text-muted flex items-center gap-3">
            <span>Created {formatDate(tm.createdAt)}</span>
            {tm.createdByName && <span>by {tm.createdByName}</span>}
            {tm.updatedAt && tm.updatedAt !== tm.createdAt && (
              <span>• Modified {formatDate(tm.updatedAt)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowUploadModal(true);
            }}
            className="px-2 py-1 text-2xs font-medium text-text-secondary hover:text-accent hover:bg-surface-hover transition-colors"
            title="Import translation units from a TMX file"
          >
            Upload TMX
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete({ id: tm.id, name: tm.name });
            }}
            className="p-1 text-text-muted hover:text-danger transition-colors"
            title="Delete TM"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <svg
            className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isExpanded && tmDetail && (
        <div className="mt-3 pt-3 border-t border-border-light">
          <div className="flex items-center gap-4 text-xs mb-3">
            <div>
              <span className="text-text-muted">Units:</span>
              <span className="ml-1 text-text font-medium">{tmDetail.unitCount}</span>
            </div>
            <div>
              <span className="text-text-muted">Last entry:</span>
              <span className="ml-1 text-text">
                {tmDetail.lastUpdated ? formatDate(tmDetail.lastUpdated) : 'No entries'}
              </span>
            </div>
          </div>

          {units.length > 0 && (
            <div className="border border-border overflow-hidden">
              <table className="min-w-full divide-y divide-border text-xs">
                <thead className="bg-surface-panel">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-2xs font-medium text-text-muted uppercase w-5/12">
                      Source
                    </th>
                    <th className="px-2 py-1.5 text-left text-2xs font-medium text-text-muted uppercase w-5/12">
                      Target
                    </th>
                    <th className="px-2 py-1.5 text-right text-2xs font-medium text-text-muted uppercase w-2/12">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface-alt divide-y divide-border-light">
                  {units.map((unit) => (
                    <tr key={unit.id} className="hover:bg-surface-hover">
                      <td className="px-2 py-1.5 text-text break-words">{unit.sourceText}</td>
                      <td className="px-2 py-1.5 text-text-secondary break-words">{unit.targetText}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => setDeleteUnitId(unit.id)}
                          className="p-0.5 text-text-muted hover:text-danger transition-colors"
                          title="Delete entry"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tmDetail.unitCount > 50 && (
                <div className="px-2 py-1.5 bg-surface-panel text-2xs text-text-muted border-t border-border">
                  Showing 50 of {tmDetail.unitCount} entries
                </div>
              )}
            </div>
          )}

          {/* Delete Unit Confirmation */}
          {deleteUnitId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteUnitId(null)}>
              <div className="bg-surface-alt border border-border shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-text mb-2">Delete Entry</h3>
                <p className="text-xs text-text-secondary mb-4">
                  Are you sure you want to delete this translation memory entry? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteUnitId(null)}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteUnitMutation.mutate(deleteUnitId)}
                    disabled={deleteUnitMutation.isPending}
                    className="px-3 py-1.5 bg-danger text-white text-xs font-medium hover:bg-danger-hover disabled:opacity-50 transition-colors"
                  >
                    {deleteUnitMutation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {units.length === 0 && tmDetail.unitCount === 0 && (
            <div className="text-xs text-text-muted italic">No entries yet</div>
          )}
        </div>
      )}

      {showUploadModal && (
        <UploadTMXModal
          tmId={tm.id}
          tmName={tm.name}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            queryClient.invalidateQueries({ queryKey: ['tm', tm.id] });
            queryClient.invalidateQueries({ queryKey: ['tm', tm.id, 'units'] });
          }}
        />
      )}
    </div>
  );
}

function UploadTMXModal({
  tmId,
  tmName,
  onClose,
  onSuccess,
}: {
  tmId: string;
  tmName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState<TMXUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => tmApi.uploadTMX(tmId, file),
    onSuccess: (result) => {
      setUploadResult(result);
      if (result.warnings.length === 0) {
        onSuccess();
      }
    },
    onError: (err: any) => {
      setError(err.data?.error || 'Failed to upload file');
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.toLowerCase().endsWith('.tmx')) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('Please drop a .tmx file');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = () => {
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-text mb-1">Upload TMX File</h2>
        <p className="text-xs text-text-secondary mb-4">Import translation units into "{tmName}"</p>

        {!uploadResult ? (
          <>
            <div
              className={`border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-accent bg-accent/5'
                  : 'border-border hover:border-accent/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".tmx"
                onChange={handleFileSelect}
                className="hidden"
              />
              <svg
                className="mx-auto h-8 w-8 text-text-muted mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              {file ? (
                <p className="text-xs text-text font-medium">{file.name}</p>
              ) : (
                <>
                  <p className="text-xs text-text-secondary">Drop a TMX file here, or click to select</p>
                  <p className="text-2xs text-text-muted mt-1">Only .tmx files are supported</p>
                </>
              )}
            </div>

            {error && (
              <p className="mt-3 text-xs text-danger">{error}</p>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploadMutation.isPending}
                className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </>
        ) : (
          <div>
            <div className="bg-success-bg border border-success/20 p-3 mb-4">
              <div className="flex items-center gap-2 text-success">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-medium">Imported {uploadResult.imported} translation unit(s)</span>
              </div>
              {uploadResult.sourceLanguage && uploadResult.targetLanguage && (
                <p className="text-2xs text-success mt-1">
                  Languages: {uploadResult.sourceLanguage} → {uploadResult.targetLanguage}
                </p>
              )}
            </div>

            {uploadResult.warnings.length > 0 && (
              <div className="bg-warning-bg border border-warning/20 p-3 mb-4">
                <p className="text-xs font-medium text-warning mb-1">Warnings:</p>
                <ul className="text-2xs text-warning list-disc list-inside">
                  {uploadResult.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={onSuccess}
                className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
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

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-text mb-4">Create Translation Memory</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
              placeholder="e.g., Product Documentation TM"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Source Language</label>
              <input
                type="text"
                required
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                placeholder="e.g., en"
                className="w-full px-2 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Target Language</label>
              <input
                type="text"
                required
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                placeholder="e.g., de"
                className="w-full px-2 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
              />
            </div>
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
              {createMutation.isPending ? 'Creating...' : 'Create TM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
