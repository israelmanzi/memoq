import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { projectsApi } from '../api';

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/protected/projects/$projectId' });
  const queryClient = useQueryClient();
  const [showAddDocModal, setShowAddDocModal] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  const { data: docsData } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => projectsApi.listDocuments(projectId),
    enabled: !!project,
  });

  const documents = docsData?.items ?? [];

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (!project) {
    return <div className="text-center py-8 text-gray-500">Project not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link to="/projects" className="text-gray-500 hover:text-gray-700">
              ← Projects
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{project.name}</h1>
          <p className="text-gray-600 mt-1">
            {project.sourceLanguage} → {project.targetLanguage} • {project.workflowType}
          </p>
        </div>
        <span
          className={`px-3 py-1 text-sm font-medium rounded-full ${
            project.status === 'active'
              ? 'bg-green-100 text-green-700'
              : project.status === 'completed'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700'
          }`}
        >
          {project.status}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Documents</div>
          <div className="text-2xl font-bold text-gray-900">{project.documentCount}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Segments</div>
          <div className="text-2xl font-bold text-gray-900">{project.totalSegments}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Translated</div>
          <div className="text-2xl font-bold text-gray-900">{project.translatedSegments}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Progress</div>
          <div className="text-2xl font-bold text-gray-900">{project.progress}%</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 rounded-full h-2 transition-all"
          style={{ width: `${project.progress}%` }}
        />
      </div>

      {/* Documents */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
          <button
            onClick={() => setShowAddDocModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            Add Document
          </button>
        </div>
        <div className="divide-y divide-gray-200">
          {documents.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No documents yet. Add a document to start translating.
            </div>
          ) : (
            documents.map((doc) => (
              <Link
                key={doc.id}
                to="/documents/$documentId"
                params={{ documentId: doc.id }}
                className="block px-6 py-4 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{doc.name}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {doc.totalSegments} segments • {doc.progress}% complete
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      doc.workflowStatus === 'complete'
                        ? 'bg-green-100 text-green-700'
                        : doc.workflowStatus === 'translation'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {doc.workflowStatus}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Add Document Modal */}
      {showAddDocModal && (
        <AddDocumentModal
          projectId={projectId}
          onClose={() => setShowAddDocModal(false)}
          onSuccess={() => {
            setShowAddDocModal(false);
            queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
            queryClient.invalidateQueries({ queryKey: ['project', projectId] });
          }}
        />
      )}
    </div>
  );
}

function AddDocumentModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [segmentsText, setSegmentsText] = useState('');

  const createMutation = useMutation({
    mutationFn: () => {
      const segments = segmentsText
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => ({ sourceText: line.trim() }));

      return projectsApi.createDocument(projectId, {
        name,
        fileType: 'txt',
        segments,
      });
    },
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Document</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Text (one segment per line)
            </label>
            <textarea
              required
              value={segmentsText}
              onChange={(e) => setSegmentsText(e.target.value)}
              rows={10}
              placeholder="Enter source text here...&#10;Each line becomes a segment."
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              {segmentsText.split('\n').filter((l) => l.trim()).length} segments
            </p>
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
              {createMutation.isPending ? 'Adding...' : 'Add Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
