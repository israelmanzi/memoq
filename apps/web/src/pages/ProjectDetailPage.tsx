import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { projectsApi, tmApi, tbApi } from '../api';
import { useOrgStore } from '../stores/org';

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/protected/projects/$projectId' });
  const queryClient = useQueryClient();
  const { currentOrg } = useOrgStore();
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  const { data: docsData } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => projectsApi.listDocuments(projectId),
    enabled: !!project,
  });

  const { data: resourcesData } = useQuery({
    queryKey: ['project-resources', projectId],
    queryFn: () => projectsApi.listResources(projectId),
    enabled: !!project,
  });

  const documents = docsData?.items ?? [];
  const resources = resourcesData?.items ?? [];

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
            Upload Document
          </button>
        </div>
        <div className="divide-y divide-gray-200">
          {documents.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No documents yet. Upload a document to start translating.
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

      {/* Resources */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Resources (TM/TB)</h2>
          <button
            onClick={() => setShowAddResourceModal(true)}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200"
          >
            Attach Resource
          </button>
        </div>
        <div className="divide-y divide-gray-200">
          {resources.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No resources attached. Attach a TM to enable "Save to TM" and get translation suggestions.
            </div>
          ) : (
            resources.map((resource) => (
              <ResourceRow
                key={resource.id}
                resource={resource}
                projectId={projectId}
                onRemove={() => {
                  queryClient.invalidateQueries({ queryKey: ['project-resources', projectId] });
                }}
              />
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

      {/* Add Resource Modal */}
      {showAddResourceModal && currentOrg && (
        <AddResourceModal
          projectId={projectId}
          orgId={currentOrg.id}
          existingResources={resources}
          onClose={() => setShowAddResourceModal(false)}
          onSuccess={() => {
            setShowAddResourceModal(false);
            queryClient.invalidateQueries({ queryKey: ['project-resources', projectId] });
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
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const uploadMutation = useMutation({
    mutationFn: (file: File) => projectsApi.uploadDocument(projectId, file),
    onSuccess,
    onError: (err: any) => {
      setError(err.data?.error || err.message || 'Upload failed');
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError('');

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    const supportedExts = ['txt', 'xliff', 'xlf', 'sdlxliff'];

    if (!ext || !supportedExts.includes(ext)) {
      setError(`Unsupported file type. Supported: ${supportedExts.join(', ')}`);
      return;
    }

    setFile(f);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Document</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : file
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            {file ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-600">
                  Drag and drop your file here, or{' '}
                  <label className="text-blue-600 hover:text-blue-700 cursor-pointer">
                    browse
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      accept=".txt,.xliff,.xlf,.sdlxliff"
                      className="hidden"
                    />
                  </label>
                </p>
                <p className="text-xs text-gray-500">
                  Supported: TXT, XLIFF, XLF, SDLXLIFF
                </p>
              </div>
            )}
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
              disabled={!file || uploadMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResourceRow({
  resource,
  projectId,
  onRemove,
}: {
  resource: { id: string; resourceType: string; resourceId: string; isWritable: boolean };
  projectId: string;
  onRemove: () => void;
}) {
  const { data: tmData } = useQuery({
    queryKey: ['tm', resource.resourceId],
    queryFn: () => tmApi.get(resource.resourceId),
    enabled: resource.resourceType === 'tm',
  });

  const { data: tbData } = useQuery({
    queryKey: ['tb', resource.resourceId],
    queryFn: () => tbApi.get(resource.resourceId),
    enabled: resource.resourceType === 'tb',
  });

  const removeMutation = useMutation({
    mutationFn: () => projectsApi.removeResource(projectId, resource.resourceId),
    onSuccess: onRemove,
  });

  const name = resource.resourceType === 'tm' ? tmData?.name : tbData?.name;
  const languages = resource.resourceType === 'tm'
    ? tmData ? `${tmData.sourceLanguage} → ${tmData.targetLanguage}` : ''
    : tbData ? `${tbData.sourceLanguage} → ${tbData.targetLanguage}` : '';

  return (
    <div className="px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
          resource.resourceType === 'tm' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
        }`}>
          {resource.resourceType.toUpperCase()}
        </span>
        <div>
          <div className="font-medium text-gray-900">{name || 'Loading...'}</div>
          <div className="text-sm text-gray-500">
            {languages}
            {resource.isWritable && resource.resourceType === 'tm' && (
              <span className="ml-2 text-green-600">(Writable)</span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={() => removeMutation.mutate()}
        disabled={removeMutation.isPending}
        className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}

function AddResourceModal({
  projectId,
  orgId,
  existingResources,
  onClose,
  onSuccess,
}: {
  projectId: string;
  orgId: string;
  existingResources: Array<{ resourceId: string }>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [resourceType, setResourceType] = useState<'tm' | 'tb'>('tm');
  const [selectedId, setSelectedId] = useState('');
  const [isWritable, setIsWritable] = useState(true);

  const { data: tmsData } = useQuery({
    queryKey: ['tms', orgId],
    queryFn: () => tmApi.list(orgId),
  });

  const { data: tbsData } = useQuery({
    queryKey: ['tbs', orgId],
    queryFn: () => tbApi.list(orgId),
  });

  const existingIds = new Set(existingResources.map((r) => r.resourceId));
  const availableTMs = (tmsData?.items ?? []).filter((tm) => !existingIds.has(tm.id));
  const availableTBs = (tbsData?.items ?? []).filter((tb) => !existingIds.has(tb.id));

  const addMutation = useMutation({
    mutationFn: () => projectsApi.addResource(projectId, resourceType, selectedId, isWritable),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedId) {
      addMutation.mutate();
    }
  };

  const availableResources = resourceType === 'tm' ? availableTMs : availableTBs;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Attach Resource</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resource Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={resourceType === 'tm'}
                  onChange={() => { setResourceType('tm'); setSelectedId(''); }}
                  className="text-blue-600"
                />
                <span className="text-sm">Translation Memory</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={resourceType === 'tb'}
                  onChange={() => { setResourceType('tb'); setSelectedId(''); }}
                  className="text-blue-600"
                />
                <span className="text-sm">Term Base</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select {resourceType === 'tm' ? 'Translation Memory' : 'Term Base'}
            </label>
            {availableResources.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                No available {resourceType === 'tm' ? 'TMs' : 'TBs'}. Create one first.
              </p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select...</option>
                {availableResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.sourceLanguage} → {r.targetLanguage})
                  </option>
                ))}
              </select>
            )}
          </div>

          {resourceType === 'tm' && selectedId && (
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isWritable}
                  onChange={(e) => setIsWritable(e.target.checked)}
                  className="text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">
                  Writable (allow "Save to TM" to add entries)
                </span>
              </label>
            </div>
          )}

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
              disabled={!selectedId || addMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addMutation.isPending ? 'Attaching...' : 'Attach'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
