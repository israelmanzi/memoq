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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>

          {/* Warning for linked projects */}
          {hasLinkedProjects && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800 mb-2">
                This resource is linked to {linkedProjects.length} project{linkedProjects.length !== 1 ? 's' : ''}:
              </p>
              <ul className="text-sm text-amber-700 list-disc list-inside">
                {linkedProjects.slice(0, 5).map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
                {linkedProjects.length > 5 && (
                  <li className="text-amber-600">...and {linkedProjects.length - 5} more</li>
                )}
              </ul>
              <p className="text-xs text-amber-600 mt-2">
                Deleting will automatically unlink from these projects.
              </p>
            </div>
          )}

          {/* Impact display */}
          {impacts.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800 mb-2">
                This will permanently delete:
              </p>
              <ul className="text-sm text-red-700">
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
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{itemName}</strong>? This action cannot be undone.
            </p>
          )}

          {mode === 'impact' && (
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{itemName}</strong>?
            </p>
          )}

          {mode === 'type-confirm' && (
            <>
              <p className="text-gray-600 mb-4">
                This action <strong>cannot be undone</strong>. To confirm, type the name below:
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type "{itemName}" to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder={itemName}
                  autoFocus
                />
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || isDeleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
