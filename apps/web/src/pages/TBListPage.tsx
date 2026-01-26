import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tbApi, type TBDeleteInfo, type TBXUploadResult } from '../api';
import { useOrgStore } from '../stores/org';
import { Pagination } from '../components/Pagination';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';

const PAGE_SIZE = 10;

export function TBListPage() {
  const queryClient = useQueryClient();
  const { currentOrg } = useOrgStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [offset, setOffset] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<TBDeleteInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tbs', currentOrg?.id, offset],
    queryFn: () => tbApi.list(currentOrg!.id, { limit: PAGE_SIZE, offset }),
    enabled: !!currentOrg,
  });

  const tbs = data?.items ?? [];
  const total = data?.total ?? 0;

  const handleDeleteClick = async (tb: { id: string; name: string }) => {
    setDeleteTarget(tb);
    try {
      const info = await tbApi.getDeleteInfo(tb.id);
      setDeleteInfo(info);
    } catch {
      setDeleteInfo({ termCount: 0, linkedProjects: [] });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await tbApi.delete(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ['tbs'] });
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
          <h1 className="text-lg font-semibold text-text">Term Bases</h1>
          <p className="text-xs text-text-muted" title="Term Bases contain approved terminology for consistent translations">
            Terminology dictionaries for translation consistency
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
          title="Create a new Term Base"
        >
          New Term Base
        </button>
      </div>

      <div className="bg-surface-alt border border-border">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-text-muted text-sm">Loading...</div>
        ) : tbs.length === 0 ? (
          <div className="px-4 py-8 text-center text-text-muted text-sm">
            No term bases. Create one to manage your terminology.
          </div>
        ) : (
          <>
            <div className="divide-y divide-border-light">
              {tbs.map((tb) => (
                <TBRow key={tb.id} tb={tb} onDelete={handleDeleteClick} />
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
        <CreateTBModal
          orgId={currentOrg!.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['tbs'] });
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
          title="Delete Term Base"
          itemName={deleteTarget.name}
          impacts={deleteInfo.termCount > 0 ? [{ label: 'terms', count: deleteInfo.termCount }] : []}
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

function TBRow({ tb, onDelete }: { tb: { id: string; name: string; sourceLanguage: string; targetLanguage: string; createdAt?: Date | string; createdByName?: string | null }; onDelete: (tb: { id: string; name: string }) => void }) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [deleteTermId, setDeleteTermId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const { data: tbDetail } = useQuery({
    queryKey: ['tb', tb.id],
    queryFn: () => tbApi.get(tb.id),
    enabled: isExpanded,
  });

  const { data: termsData } = useQuery({
    queryKey: ['tb', tb.id, 'terms'],
    queryFn: () => tbApi.listTerms(tb.id, 50, 0),
    enabled: isExpanded,
  });

  const deleteTermMutation = useMutation({
    mutationFn: (termId: string) => tbApi.deleteTerm(tb.id, termId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tb', tb.id] });
      queryClient.invalidateQueries({ queryKey: ['tb', tb.id, 'terms'] });
      setDeleteTermId(null);
    },
  });

  // Escape key handler for delete modal
  useEffect(() => {
    if (!deleteTermId) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDeleteTermId(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [deleteTermId]);

  const terms = termsData?.items ?? [];

  return (
    <div className="px-4 py-3">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-text">{tb.name}</span>
            <span className="px-1.5 py-0.5 text-2xs font-medium bg-surface-panel text-text-secondary">
              {tb.sourceLanguage}
            </span>
            <span className="text-text-muted">→</span>
            <span className="px-1.5 py-0.5 text-2xs font-medium bg-surface-panel text-text-secondary">
              {tb.targetLanguage}
            </span>
          </div>
          <div className="mt-0.5 text-2xs text-text-muted flex items-center gap-3">
            <span>Created {formatDate(tb.createdAt)}</span>
            {tb.createdByName && <span>by {tb.createdByName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowUploadModal(true);
            }}
            className="px-2 py-1 text-2xs font-medium text-text-secondary hover:text-accent hover:bg-surface-hover transition-colors"
            title="Import terms from a TBX file"
          >
            Upload TBX
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete({ id: tb.id, name: tb.name });
            }}
            className="p-1 text-text-muted hover:text-danger transition-colors"
            title="Delete Term Base"
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

      {isExpanded && tbDetail && (
        <div className="mt-3 pt-3 border-t border-border-light">
          <div className="text-xs mb-3">
            <span className="text-text-muted">Terms:</span>
            <span className="ml-1 text-text font-medium">{tbDetail.termCount}</span>
          </div>

          {terms.length > 0 && (
            <div className="border border-border overflow-hidden">
              <table className="min-w-full divide-y divide-border text-xs">
                <thead className="bg-surface-panel">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-2xs font-medium text-text-muted uppercase w-3/12">
                      Source Term
                    </th>
                    <th className="px-2 py-1.5 text-left text-2xs font-medium text-text-muted uppercase w-3/12">
                      Target Term
                    </th>
                    <th className="px-2 py-1.5 text-left text-2xs font-medium text-text-muted uppercase w-4/12">
                      Definition
                    </th>
                    <th className="px-2 py-1.5 text-right text-2xs font-medium text-text-muted uppercase w-2/12">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface-alt divide-y divide-border-light">
                  {terms.map((term) => (
                    <tr key={term.id} className="hover:bg-surface-hover">
                      <td className="px-2 py-1.5 text-text font-medium">{term.sourceTerm}</td>
                      <td className="px-2 py-1.5 text-text-secondary">{term.targetTerm}</td>
                      <td className="px-2 py-1.5 text-text-muted text-2xs">{term.definition || '—'}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => setDeleteTermId(term.id)}
                          className="p-0.5 text-text-muted hover:text-danger transition-colors"
                          title="Delete term"
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
              {tbDetail.termCount > 50 && (
                <div className="px-2 py-1.5 bg-surface-panel text-2xs text-text-muted border-t border-border">
                  Showing 50 of {tbDetail.termCount} terms
                </div>
              )}
            </div>
          )}

          {/* Delete Term Confirmation */}
          {deleteTermId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteTermId(null)}>
              <div className="bg-surface-alt border border-border shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-text mb-2">Delete Term</h3>
                <p className="text-xs text-text-secondary mb-4">
                  Are you sure you want to delete this term? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteTermId(null)}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteTermMutation.mutate(deleteTermId)}
                    disabled={deleteTermMutation.isPending}
                    className="px-3 py-1.5 bg-danger text-white text-xs font-medium hover:bg-danger-hover disabled:opacity-50 transition-colors"
                  >
                    {deleteTermMutation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {terms.length === 0 && tbDetail.termCount === 0 && (
            <div className="text-xs text-text-muted italic">No terms yet</div>
          )}
        </div>
      )}

      {showUploadModal && (
        <UploadTBXModal
          tbId={tb.id}
          tbName={tb.name}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            queryClient.invalidateQueries({ queryKey: ['tb', tb.id] });
            queryClient.invalidateQueries({ queryKey: ['tb', tb.id, 'terms'] });
          }}
        />
      )}
    </div>
  );
}

function UploadTBXModal({
  tbId,
  tbName,
  onClose,
  onSuccess,
}: {
  tbId: string;
  tbName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState<TBXUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => tbApi.uploadTBX(tbId, file),
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
    if (droppedFile?.name.toLowerCase().endsWith('.tbx')) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('Please drop a .tbx file');
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
        <h2 className="text-base font-semibold text-text mb-1">Upload TBX File</h2>
        <p className="text-xs text-text-secondary mb-4">Import terms into "{tbName}"</p>

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
                accept=".tbx"
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
                  <p className="text-xs text-text-secondary">Drop a TBX file here, or click to select</p>
                  <p className="text-2xs text-text-muted mt-1">Only .tbx files are supported</p>
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
                <span className="text-xs font-medium">Imported {uploadResult.imported} term(s)</span>
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

function CreateTBModal({
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
    mutationFn: () => tbApi.create(orgId, { name, sourceLanguage, targetLanguage }),
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
        <h2 className="text-base font-semibold text-text mb-4">Create Term Base</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
              placeholder="e.g., Legal Terminology"
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
              {createMutation.isPending ? 'Creating...' : 'Create Term Base'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
