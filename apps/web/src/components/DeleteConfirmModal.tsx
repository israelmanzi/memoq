import { useState, useEffect } from 'react';

export type DeleteConfirmMode = 'simple' | 'impact' | 'type-confirm';

export interface DeleteImpact {
  label: string;
  count: number;
}

export interface LinkedProject {
  id: string;
  name: string;
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  mode: DeleteConfirmMode;
  title: string;
  itemName: string;
  impacts?: DeleteImpact[];
  linkedProjects?: LinkedProject[];
  isDeleting?: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  mode,
  title,
  itemName,
  impacts = [],
  linkedProjects = [],
  isDeleting = false,
}: DeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setError(null);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || isDeleting) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  const canConfirm =
    mode === 'type-confirm' ? confirmText === itemName : true;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
  };

  const hasLinkedProjects = linkedProjects.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md mx-4">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-text mb-3">{title}</h2>

          {/* Warning for linked projects */}
          {hasLinkedProjects && (
            <div className="mb-3 p-3 bg-warning-bg border border-warning/20">
              <p className="text-xs font-medium text-warning mb-1.5">
                This resource is linked to {linkedProjects.length} project{linkedProjects.length !== 1 ? 's' : ''}:
              </p>
              <ul className="text-xs text-warning list-disc list-inside">
                {linkedProjects.slice(0, 5).map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
                {linkedProjects.length > 5 && (
                  <li className="opacity-75">...and {linkedProjects.length - 5} more</li>
                )}
              </ul>
              <p className="text-2xs text-warning/80 mt-1.5">
                Deleting will automatically unlink from these projects.
              </p>
            </div>
          )}

          {/* Impact display */}
          {impacts.length > 0 && (
            <div className="mb-3 p-3 bg-danger-bg border border-danger/20">
              <p className="text-xs font-medium text-danger mb-1.5">
                This will permanently delete:
              </p>
              <ul className="text-xs text-danger">
                {impacts.map((impact, idx) => (
                  <li key={idx}>
                    {impact.count.toLocaleString()} {impact.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Confirmation message */}
          {mode === 'simple' && (
            <p className="text-xs text-text-secondary mb-3">
              Are you sure you want to delete <strong className="text-text">{itemName}</strong>? This action cannot be undone.
            </p>
          )}

          {mode === 'impact' && (
            <p className="text-xs text-text-secondary mb-3">
              Are you sure you want to delete <strong className="text-text">{itemName}</strong>?
            </p>
          )}

          {mode === 'type-confirm' && (
            <>
              <p className="text-xs text-text-secondary mb-3">
                This action <strong className="text-text">cannot be undone</strong>. To confirm, type the name below:
              </p>
              <div className="mb-3">
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Type "{itemName}" to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-surface border border-border text-text focus:border-danger focus:outline-none"
                  placeholder={itemName}
                  autoFocus
                />
              </div>
            </>
          )}

          {error && (
            <div className="mb-3 p-2 bg-danger-bg border border-danger/20 text-danger text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || isDeleting}
              className="px-3 py-1.5 bg-danger text-white text-xs font-medium hover:bg-danger-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
