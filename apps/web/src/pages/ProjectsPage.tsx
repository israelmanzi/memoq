import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { projectsApi } from '../api';
import { useOrgStore } from '../stores/org';
import { Pagination } from '../components/Pagination';
import { formatProjectStatus, formatWorkflowType } from '../utils/formatters';
import type { ProjectStatus } from '@oxy/shared';

const PAGE_SIZE = 10;

// Status badge configuration
const STATUS_CONFIG: Record<ProjectStatus, { color: string; bg: string; tooltip: string }> = {
  active: { color: 'text-success', bg: 'bg-success-bg', tooltip: 'Project is in progress' },
  completed: { color: 'text-accent', bg: 'bg-accent/10', tooltip: 'All work has been completed' },
  archived: { color: 'text-text-muted', bg: 'bg-surface-panel', tooltip: 'Project is archived and hidden from main list' },
};

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const { currentOrg } = useOrgStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['projects', currentOrg?.id, statusFilter, offset],
    queryFn: () => projectsApi.list(currentOrg!.id, {
      status: statusFilter || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    enabled: !!currentOrg,
  });

  const projects = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-4 bg-surface min-h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text">Projects</h1>
          <p className="text-sm text-text-secondary">Manage translation projects</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-text-inverse text-sm font-medium hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          title="Create a new translation project"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-text-secondary">Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ProjectStatus | '');
            setOffset(0);
          }}
          className="px-2 py-1 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
          title="Filter projects by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        {statusFilter && (
          <button
            onClick={() => { setStatusFilter(''); setOffset(0); }}
            className="text-xs text-text-muted hover:text-text"
            title="Clear filter"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-text-muted ml-auto">
          {total} project{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Projects list */}
      <div className="bg-surface-alt border border-border">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 bg-surface-panel border-b border-border text-xs font-medium text-text-secondary uppercase tracking-wide">
          <div>Project</div>
          <div className="w-24 text-center">Languages</div>
          <div className="w-20 text-center">Status</div>
        </div>

        {isLoading ? (
          <div className="px-3 py-8 text-center text-text-muted">
            <svg className="w-5 h-5 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <svg className="w-12 h-12 mx-auto text-border mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-sm text-text-muted mb-2">No projects found</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-sm text-accent hover:text-accent-hover"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border-light">
              {projects.map((project) => {
                const statusStyle = STATUS_CONFIG[project.status] || STATUS_CONFIG.active;
                return (
                  <Link
                    key={project.id}
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2.5 hover:bg-surface-hover items-center"
                  >
                    {/* Project info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-text truncate">{project.name}</span>
                        <span className="text-xs text-text-muted flex-shrink-0">
                          {formatWorkflowType(project.workflowType)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-text-muted flex items-center gap-2 flex-wrap">
                        <span>
                          {new Date(project.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {project.createdByName && (
                          <>
                            <span className="text-border">•</span>
                            <span>{project.createdByName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Languages */}
                    <div className="w-24 flex items-center justify-center gap-1">
                      <span className="px-1.5 py-0.5 text-2xs font-medium bg-surface-panel text-text-secondary">
                        {project.sourceLanguage}
                      </span>
                      <span className="text-text-muted">→</span>
                      <span className="px-1.5 py-0.5 text-2xs font-medium bg-surface-panel text-text-secondary">
                        {project.targetLanguage}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="w-20 flex justify-center">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.color}`}
                        title={statusStyle.tooltip}
                      >
                        {formatProjectStatus(project.status)}
                      </span>
                    </div>
                  </Link>
                );
              })}
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
  const [deadline, setDeadline] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      projectsApi.create(orgId, {
        name,
        description,
        sourceLanguage,
        targetLanguage,
        workflowType,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      }),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-alt border border-border shadow-panel w-full max-w-md">
        <div className="px-4 py-3 border-b border-border bg-surface-panel">
          <h2 className="text-sm font-semibold text-text">Create Project</h2>
          <p className="text-xs text-text-muted mt-0.5">Set up a new translation project</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Project Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Website Localization Q1"
              className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional project description..."
              className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Source Language <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                placeholder="e.g., en"
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
                title="ISO language code of the source language (e.g., en, de, fr)"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Target Language <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                placeholder="e.g., de"
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
                title="ISO language code of the target language (e.g., en, de, fr)"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Workflow Type
            </label>
            <select
              value={workflowType}
              onChange={(e) => setWorkflowType(e.target.value as typeof workflowType)}
              className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
              title="Choose the review process for this project"
            >
              <option value="simple">Simple (Translation only)</option>
              <option value="single_review">Single Review (Translation + 1 Review)</option>
              <option value="full_review">Full Review (Translation + 2 Reviews)</option>
            </select>
            <p className="mt-1 text-2xs text-text-muted">
              {workflowType === 'simple' && 'Translator confirms segments directly without review.'}
              {workflowType === 'single_review' && 'Translator submits, then one reviewer approves.'}
              {workflowType === 'full_review' && 'Translator submits, then two reviewers approve in sequence.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Deadline
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
              title="Optional project deadline"
            />
            <p className="mt-1 text-2xs text-text-muted">
              Optional deadline for the project
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim() || !targetLanguage.trim()}
              className="px-3 py-1.5 bg-accent text-text-inverse text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
