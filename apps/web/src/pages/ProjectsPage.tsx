import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { projectsApi } from '../api';
import { useOrgStore } from '../stores/org';
import type { ProjectStatus } from '@memoq/shared';

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const { currentOrg } = useOrgStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects', currentOrg?.id, statusFilter],
    queryFn: () => projectsApi.list(currentOrg!.id, statusFilter || undefined),
    enabled: !!currentOrg,
  });

  const projects = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | '')}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Projects list */}
      <div className="bg-white rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-gray-500">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No projects found. Create your first project to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {projects.map((project) => (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="block px-6 py-4 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{project.name}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {project.sourceLanguage} → {project.targetLanguage} • {project.workflowType}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateProjectModal
          orgId={currentOrg!.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        />
      )}
    </div>
  );
}

function CreateProjectModal({
  orgId,
  onClose,
  onSuccess,
}: {
  orgId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [workflowType, setWorkflowType] = useState<'simple' | 'single_review' | 'full_review'>('single_review');

  const createMutation = useMutation({
    mutationFn: () =>
      projectsApi.create(orgId, { name, description, sourceLanguage, targetLanguage, workflowType }),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Project</h2>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workflow Type</label>
            <select
              value={workflowType}
              onChange={(e) => setWorkflowType(e.target.value as typeof workflowType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="simple">Simple (Translation only)</option>
              <option value="single_review">Single Review</option>
              <option value="full_review">Full Review (2 reviewers)</option>
            </select>
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
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
