import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from '@tanstack/react-router';
import { projectsApi, tmApi, tbApi, activityApi, type ProjectDeleteInfo, type DocumentWithStats } from '../api';
import { DocumentAssignmentsModal } from '../components/DocumentAssignmentsModal';
import { useOrgStore } from '../stores/org';
import { useMultiUpload } from '../hooks/useMultiUpload';
import { Pagination } from '../components/Pagination';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { ActivityFeed } from '../components/ActivityFeed';
import { ProjectStatsDashboard } from '../components/ProjectStatsDashboard';
import { ProductivityMetrics } from '../components/ProductivityMetrics';
import { useToastActions } from '../components/Toast';
import { formatProjectStatus, formatWorkflowType, formatWorkflowStatus, formatRelativeTime, formatAbsoluteDateTime } from '../utils/formatters';
import type { ProjectStatus, WorkflowType, DocumentAssignmentFilter, DocumentRole, DocumentAssignmentInfo } from '@oxy/shared';

const DOCS_PAGE_SIZE = 10;

// Status badge configuration
const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { color: string; bg: string; tooltip: string }> = {
  active: { color: 'text-success', bg: 'bg-success-bg', tooltip: 'Project is in progress' },
  completed: { color: 'text-accent', bg: 'bg-accent/10', tooltip: 'All work has been completed' },
  archived: { color: 'text-text-muted', bg: 'bg-surface-panel', tooltip: 'Project is archived' },
};

const DOC_STATUS_CONFIG = {
  translation: { color: 'text-warning', bg: 'bg-warning-bg', tooltip: 'Document is being translated' },
  review_1: { color: 'text-accent', bg: 'bg-accent/10', tooltip: 'Awaiting first review' },
  review_2: { color: 'text-accent', bg: 'bg-accent/10', tooltip: 'Awaiting second review' },
  complete: { color: 'text-success', bg: 'bg-success-bg', tooltip: 'All segments complete' },
} as const;

const DEFAULT_DOC_STATUS = DOC_STATUS_CONFIG.translation;

// Assignments display for document list - shows all relevant roles based on workflow type
function AssignmentsDisplay({
  assignments,
  activeRole,
  myRole,
  workflowType,
}: {
  assignments: DocumentAssignmentInfo | undefined;
  activeRole: DocumentRole | null;
  myRole: DocumentRole | null;
  workflowType: WorkflowType;
}) {
  if (!assignments) {
    return <span className="text-text-muted">—</span>;
  }

  // Determine which roles to show based on workflow type
  const rolesToShow: DocumentRole[] =
    workflowType === 'simple'
      ? ['translator']
      : workflowType === 'single_review'
        ? ['translator', 'reviewer_1']
        : ['translator', 'reviewer_1', 'reviewer_2'];

  const roleLabels: Record<DocumentRole, string> = {
    translator: 'Translator',
    reviewer_1: 'Reviewer 1',
    reviewer_2: 'Reviewer 2',
  };

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
      {rolesToShow.map((role) => {
        const assignment = assignments[role];
        const isActive = activeRole === role;
        const isMe = myRole === role;

        const assigneeName = assignment
          ? isMe
            ? 'You'
            : assignment.userName
          : 'Unassigned';

        const valueColorClasses = !assignment
          ? isActive
            ? 'text-warning'
            : 'text-text-muted'
          : isMe
            ? 'text-accent font-medium'
            : isActive
              ? 'text-text'
              : 'text-text-secondary';

        return (
          <React.Fragment key={role}>
            <span className={`text-text-secondary ${isActive ? 'font-medium' : ''}`}>
              {roleLabels[role]}:
            </span>
            <span className={`flex items-center gap-1 ${valueColorClasses}`}>
              {assigneeName}
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" title="Active stage" />
              )}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Sortable column header component
function SortHeader({
  label,
  sortKey,
  current,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: string;
  current: { key: string; dir: 'asc' | 'desc' };
  onSort: (sort: { key: string; dir: 'asc' | 'desc' }) => void;
  className?: string;
}) {
  const isActive = current.key === sortKey;
  return (
    <button
      onClick={() => onSort({
        key: sortKey,
        dir: isActive && current.dir === 'asc' ? 'desc' : 'asc',
      })}
      className={`flex items-center gap-0.5 hover:text-text transition-colors ${className} ${isActive ? 'text-text' : ''}`}
      title={`Sort by ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      {isActive && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {current.dir === 'asc' ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          )}
        </svg>
      )}
    </button>
  );
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/protected/projects/$projectId' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { currentOrg } = useOrgStore();
  const [activeTab, setActiveTab] = useState<'documents' | 'resources' | 'activity' | 'analytics' | 'settings'>('documents');
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [docsOffset, setDocsOffset] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<ProjectDeleteInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [docSort, setDocSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'createdAt', dir: 'desc' });
  const [docFilter, setDocFilter] = useState<DocumentAssignmentFilter>('all');
  const [assigningDocument, setAssigningDocument] = useState<DocumentWithStats | null>(null);

  const { data: project, isLoading, error: projectError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  // Permission: can user manage this project (upload, delete, archive, settings)?
  const canManageProject = currentOrg?.role === 'admin' || project?.userRole === 'project_manager';

  const { data: docsData } = useQuery({
    queryKey: ['documents', projectId, docsOffset, docFilter],
    queryFn: () => projectsApi.listDocuments(projectId, { limit: DOCS_PAGE_SIZE, offset: docsOffset, filter: docFilter }),
    enabled: !!project,
  });

  const { data: resourcesData } = useQuery({
    queryKey: ['project-resources', projectId],
    queryFn: () => projectsApi.listResources(projectId),
    enabled: !!project,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['project-activity', projectId],
    queryFn: () => activityApi.listForProject(projectId, { limit: 20 }),
    enabled: !!project,
  });

  const documents = docsData?.items ?? [];
  const docsTotal = docsData?.total ?? 0;
  const resources = resourcesData?.items ?? [];
  const activities = activityData?.items ?? [];

  const handleDeleteClick = async () => {
    try {
      const info = await projectsApi.getDeleteInfo(projectId);
      setDeleteInfo(info);
      setShowDeleteModal(true);
    } catch {
      setDeleteInfo({ documentCount: 0, segmentCount: 0 });
      setShowDeleteModal(true);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await projectsApi.delete(projectId);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate({ to: '/projects' });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="w-6 h-6 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (projectError || !project) {
    const is404 = projectError && 'status' in projectError && projectError.status === 404;
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
        <svg className="w-12 h-12 text-border mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <h2 className="text-sm font-semibold text-text mb-1">
          {is404 ? 'Project not found' : 'Failed to load project'}
        </h2>
        <p className="text-xs text-text-muted mb-4">
          {is404
            ? 'The project you are looking for does not exist or has been deleted.'
            : 'An error occurred while loading the project. Please try again.'}
        </p>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-inverse bg-accent hover:bg-accent-hover"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Projects
        </Link>
      </div>
    );
  }

  const statusStyle = PROJECT_STATUS_CONFIG[project.status] || PROJECT_STATUS_CONFIG.active;

  return (
    <div className="p-4 bg-surface min-h-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/projects"
          className="p-1.5 text-text-secondary hover:text-text hover:bg-surface-hover rounded focus:outline-none focus:ring-1 focus:ring-accent"
          title="Back to projects"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="h-5 w-px bg-border" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-text truncate">{project.name}</h1>
            <span
              className={`flex-shrink-0 px-1.5 py-0.5 text-2xs font-medium ${statusStyle.bg} ${statusStyle.color}`}
              title={statusStyle.tooltip}
            >
              {formatProjectStatus(project.status)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="px-1 py-0.5 bg-surface-panel">
              {project.sourceLanguage} → {project.targetLanguage}
            </span>
            <span className="text-border">•</span>
            <span title="Workflow type determines the review process">{formatWorkflowType(project.workflowType)}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div
          className="bg-surface-alt p-3 border border-border"
          title="Total number of documents in this project"
        >
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">Documents</div>
          <div className="mt-1 text-xl font-bold text-text">{project.documentCount}</div>
        </div>
        <div
          className="bg-surface-alt p-3 border border-border"
          title="Total translatable text units across all documents"
        >
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">Segments</div>
          <div className="mt-1 text-xl font-bold text-text">{project.totalSegments.toLocaleString()}</div>
        </div>
        <div
          className="bg-surface-alt p-3 border border-border"
          title="Number of segments that have been translated"
        >
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">Translated</div>
          <div className="mt-1 text-xl font-bold text-text">{project.translatedSegments.toLocaleString()}</div>
        </div>
        <div
          className="bg-surface-alt p-3 border border-border"
          title="Overall translation progress"
        >
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">Progress</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xl font-bold text-text">{project.progress}%</span>
            <div className="flex-1 h-1.5 bg-border rounded-sm overflow-hidden">
              <div
                className="h-full bg-success transition-all"
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-0">
          {[
            { key: 'documents', label: 'Documents', tooltip: 'View and manage project documents' },
            { key: 'resources', label: 'Resources', tooltip: 'Attached Translation Memories and Term Bases' },
            { key: 'activity', label: 'Activity', tooltip: 'Recent actions and changes' },
            { key: 'analytics', label: 'Analytics', tooltip: 'Project statistics and productivity metrics' },
            // Only show settings tab to admins and project managers
            ...(canManageProject ? [{ key: 'settings', label: 'Settings', tooltip: 'Project configuration and danger zone' }] : []),
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              title={tab.tooltip}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text hover:border-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="bg-surface-alt border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface-panel">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-sm font-semibold text-text">Documents</h2>
                <p className="text-xs text-text-muted">Upload files to translate</p>
              </div>
              {/* Assignment Filter */}
              <select
                value={docFilter}
                onChange={(e) => {
                  setDocFilter(e.target.value as DocumentAssignmentFilter);
                  setDocsOffset(0); // Reset pagination when filter changes
                }}
                className="px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none rounded-sm"
                title="Filter documents by assignment"
              >
                <option value="all">All documents</option>
                <option value="awaiting_action">Awaiting my action</option>
                <option value="assigned_to_me">Assigned to me</option>
                <option value="assigned_as_translator">Assigned as Translator</option>
                <option value="assigned_as_reviewer_1">Assigned as Reviewer 1</option>
                <option value="assigned_as_reviewer_2">Assigned as Reviewer 2</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>
            {canManageProject && (
              <button
                onClick={() => setShowAddDocModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-text-inverse text-sm font-medium hover:bg-accent-hover focus:outline-none focus:ring-1 focus:ring-accent rounded-sm"
                title="Upload a new document for translation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Upload
              </button>
            )}
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_48px_52px_70px_60px_72px_150px_32px] gap-2 px-4 py-2.5 bg-surface-panel border-b border-border text-xs font-medium text-text-secondary uppercase tracking-wide">
            <SortHeader label="Name" sortKey="name" current={docSort} onSort={setDocSort} />
            <SortHeader label="Type" sortKey="fileType" current={docSort} onSort={setDocSort} className="text-center justify-center" />
            <SortHeader label="Segs" sortKey="totalSegments" current={docSort} onSort={setDocSort} className="text-center justify-center" />
            <SortHeader label="Date" sortKey="createdAt" current={docSort} onSort={setDocSort} className="text-center justify-center" />
            <SortHeader label="Progress" sortKey="progress" current={docSort} onSort={setDocSort} className="text-center justify-center" />
            <SortHeader label="Status" sortKey="workflowStatus" current={docSort} onSort={setDocSort} className="text-center justify-center" />
            <span>Assignments</span>
            <span></span>
          </div>

          <div className="divide-y divide-border-light">
            {documents.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <svg className="w-12 h-12 mx-auto text-border mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-base text-text-muted mb-2">No documents yet</p>
                {canManageProject ? (
                  <button
                    onClick={() => setShowAddDocModal(true)}
                    className="text-sm text-accent hover:text-accent-hover font-medium"
                  >
                    Upload your first document
                  </button>
                ) : (
                  <p className="text-sm text-text-muted">
                    Ask a project manager to upload documents
                  </p>
                )}
              </div>
            ) : (
              <>
                {[...documents]
                  .sort((a, b) => {
                    const key = docSort.key as keyof typeof a;
                    const aVal = a[key];
                    const bVal = b[key];
                    if (aVal == null && bVal == null) return 0;
                    if (aVal == null) return 1;
                    if (bVal == null) return -1;
                    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                    return docSort.dir === 'asc' ? cmp : -cmp;
                  })
                  .map((doc) => {
                    const docStatus = DOC_STATUS_CONFIG[doc.workflowStatus as keyof typeof DOC_STATUS_CONFIG] ?? DEFAULT_DOC_STATUS;
                    // Determine active role based on workflow
                    const activeRole: DocumentRole | null =
                      doc.workflowStatus === 'translation' ? 'translator' :
                      doc.workflowStatus === 'review_1' ? 'reviewer_1' :
                      doc.workflowStatus === 'review_2' ? 'reviewer_2' : null;

                    return (
                      <div
                        key={doc.id}
                        className="grid grid-cols-[1fr_48px_52px_70px_60px_72px_150px_32px] gap-2 px-4 py-2.5 hover:bg-surface-hover items-center group"
                      >
                        {/* Name - clickable link */}
                        <Link
                          to="/documents/$documentId"
                          params={{ documentId: doc.id }}
                          className="min-w-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-text truncate group-hover:text-accent">{doc.name}</span>
                            {doc.isAwaitingMyAction && (
                              <span
                                className="flex-shrink-0 px-1.5 py-0.5 text-2xs font-medium bg-accent text-white rounded-sm"
                                title="This document is awaiting your action"
                              >
                                Action needed
                              </span>
                            )}
                          </div>
                          {doc.createdByName && (
                            <div className="text-xs text-text-muted truncate">by {doc.createdByName}</div>
                          )}
                        </Link>

                        {/* File Type */}
                        <div className="text-center">
                          <span className="px-1.5 py-0.5 text-xs font-medium bg-surface-panel text-text-secondary uppercase rounded-sm">
                            {doc.fileType}
                          </span>
                        </div>

                        {/* Segments */}
                        <div className="text-center text-sm text-text-secondary tabular-nums">
                          {doc.totalSegments}
                        </div>

                        {/* Upload Date */}
                        <div className="text-center text-xs text-text-muted" title={formatAbsoluteDateTime(doc.createdAt)}>
                          {formatRelativeTime(doc.createdAt)}
                        </div>

                        {/* Progress */}
                        <div
                          className="flex items-center gap-1.5"
                          title={`${doc.progress}% translated`}
                        >
                          <div className="flex-1 h-1.5 bg-border rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-success transition-all"
                              style={{ width: `${doc.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-text-secondary w-7 text-right tabular-nums">{doc.progress}%</span>
                        </div>

                        {/* Status */}
                        <div className="flex justify-center">
                          <span
                            className={`px-1.5 py-0.5 text-xs font-medium rounded-sm ${docStatus.bg} ${docStatus.color}`}
                            title={docStatus.tooltip}
                          >
                            {formatWorkflowStatus(doc.workflowStatus)}
                          </span>
                        </div>

                        {/* Assignments */}
                        <div className="text-xs min-w-0">
                          <AssignmentsDisplay
                            assignments={doc.assignments}
                            activeRole={activeRole}
                            myRole={doc.myRole ?? null}
                            workflowType={project.workflowType}
                          />
                        </div>

                        {/* Assign button - only for managers */}
                        <div className="flex justify-center">
                          {canManageProject && (
                            <button
                              onClick={() => setAssigningDocument(doc)}
                              className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-sm"
                              title="Manage assignments"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                <Pagination
                  total={docsTotal}
                  limit={DOCS_PAGE_SIZE}
                  offset={docsOffset}
                  onPageChange={setDocsOffset}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Resources Tab */}
      {activeTab === 'resources' && (
        <div className="bg-surface-alt border border-border">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-surface-panel">
            <div>
              <h2 className="text-sm font-medium text-text">Resources (TM/TB)</h2>
              <p className="text-2xs text-text-muted">Translation Memories and Term Bases for this project</p>
            </div>
            {canManageProject && (
              <button
                onClick={() => setShowAddResourceModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border border-border text-text-secondary text-xs font-medium hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-accent"
                title="Attach a Translation Memory or Term Base to this project"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Attach Resource
              </button>
            )}
          </div>
          <div className="divide-y divide-border-light">
            {resources.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <svg className="w-10 h-10 mx-auto text-border mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <p className="text-sm text-text-muted mb-1">No resources attached</p>
                <p className="text-xs text-text-muted mb-3">
                  Attach a TM to enable translation suggestions and "Save to TM"
                </p>
                {canManageProject ? (
                  <button
                    onClick={() => setShowAddResourceModal(true)}
                    className="text-sm text-accent hover:text-accent-hover"
                  >
                    Attach a resource
                  </button>
                ) : (
                  <p className="text-xs text-text-muted">
                    Ask a project manager to attach resources
                  </p>
                )}
              </div>
            ) : (
              resources.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  projectId={projectId}
                  canRemove={canManageProject}
                  onRemove={() => {
                    queryClient.invalidateQueries({ queryKey: ['project-resources', projectId] });
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div className="bg-surface-alt border border-border">
          <div className="px-3 py-2 border-b border-border bg-surface-panel">
            <h2 className="text-sm font-medium text-text">Recent Activity</h2>
            <p className="text-2xs text-text-muted">Actions and changes in this project</p>
          </div>
          <div className="p-3">
            <ActivityFeed
              activities={activities}
              isLoading={activityLoading}
              showEntityName={true}
            />
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-surface-alt border border-border p-6">
            <ProjectStatsDashboard projectId={projectId} />
          </div>
          <div className="bg-surface-alt border border-border p-6">
            <ProductivityMetrics projectId={projectId} />
          </div>
        </div>
      )}

      {/* Settings Tab - only for admins and project managers */}
      {activeTab === 'settings' && canManageProject && (
        <ProjectSettingsTab
          project={project}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['project', projectId] });
          }}
          onDelete={handleDeleteClick}
        />
      )}

      {/* Add Document Modal - only for admins and project managers */}
      {showAddDocModal && canManageProject && (
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

      {/* Add Resource Modal - only for admins and project managers */}
      {showAddResourceModal && currentOrg && canManageProject && (
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

      {/* Delete Confirmation Modal - only for admins and project managers */}
      {showDeleteModal && deleteInfo && canManageProject && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteInfo(null);
          }}
          onConfirm={handleDelete}
          mode="type-confirm"
          title="Delete Project"
          itemName={project.name}
          impacts={[
            ...(deleteInfo.documentCount > 0 ? [{ label: 'documents', count: deleteInfo.documentCount }] : []),
            ...(deleteInfo.segmentCount > 0 ? [{ label: 'segments', count: deleteInfo.segmentCount }] : []),
          ]}
          isDeleting={isDeleting}
        />
      )}

      {/* Document Assignments Modal */}
      {assigningDocument && currentOrg && (
        <DocumentAssignmentsModal
          documentId={assigningDocument.id}
          orgId={currentOrg.id}
          workflowStatus={assigningDocument.workflowStatus}
          workflowType={project.workflowType}
          onClose={() => setAssigningDocument(null)}
          onAssignmentChange={() => {
            queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    files,
    addFiles,
    removeFile,
    clearFiles,
    startUpload,
    cancelUpload,
    isUploading,
    currentStage,
    summary,
    validationError,
  } = useMultiUpload({
    projectId,
    maxFiles: 5,
    onComplete: (summary) => {
      if (summary.successful > 0) {
        onSuccess();
      }
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
    addFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startUpload();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={2} />
          </svg>
        );
      case 'uploading':
      case 'processing':
        return (
          <svg className="w-4 h-4 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        );
      case 'done':
        return (
          <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'uploading': return 'Uploading...';
      case 'processing': return 'Processing...';
      case 'done': return 'Done';
      case 'error': return 'Failed';
      default: return status;
    }
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const canAddMore = files.length < 5 && !isUploading && !summary;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-alt border border-border shadow-panel w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border bg-surface-panel">
          <h2 className="text-sm font-semibold text-text">Upload Documents</h2>
          <p className="text-xs text-text-muted mt-0.5">Add up to 5 files to translate in this project</p>
        </div>

        {validationError && (
          <div className="mx-4 mt-4 p-2.5 bg-warning-bg border border-warning/30 text-sm text-warning">
            {validationError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Drop zone - only show when can add more files */}
          {canAddMore && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed p-6 text-center transition-colors ${
                isDragging
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-border-dark'
              }`}
            >
              <div className="space-y-2">
                <svg className="w-10 h-10 mx-auto text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-text-secondary">
                  Drag and drop files here, or{' '}
                  <label className="text-accent hover:text-accent-hover cursor-pointer">
                    browse
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      accept=".txt,.xliff,.xlf,.sdlxliff,.docx,.pdf"
                      className="hidden"
                    />
                  </label>
                </p>
                <p className="text-xs text-text-muted">
                  Supported: TXT, XLIFF, XLF, SDLXLIFF, DOCX, PDF
                </p>
              </div>
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">
                  Files ({files.length}/5)
                </span>
                {!isUploading && !summary && (
                  <button
                    type="button"
                    onClick={clearFiles}
                    className="text-xs text-text-muted hover:text-danger"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="border border-border divide-y divide-border bg-surface">
                {files.map((item) => (
                  <div key={item.id} className="px-3 py-2 flex items-center gap-3">
                    {getStatusIcon(item.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text truncate">{item.file.name}</p>
                      <p className="text-xs text-text-muted">
                        {formatFileSize(item.file.size)}
                        {item.error && <span className="text-danger ml-2">{item.error}</span>}
                      </p>
                    </div>
                    <span className={`text-xs ${
                      item.status === 'done' ? 'text-success' :
                      item.status === 'error' ? 'text-danger' :
                      'text-text-muted'
                    }`}>
                      {item.status === 'uploading' ? `${item.progress}%` : getStatusText(item.status)}
                    </span>
                    {item.status === 'pending' && !isUploading && (
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="text-text-muted hover:text-danger"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload status */}
          {isUploading && (
            <div className="text-xs text-text-secondary">
              {currentStage}
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className={`p-3 border ${
              summary.failed === 0 ? 'bg-success-bg border-success/30' : 'bg-warning-bg border-warning/30'
            }`}>
              <p className="text-sm font-medium text-text">
                Upload Complete
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {summary.successful} of {summary.total} file{summary.total !== 1 ? 's' : ''} uploaded successfully
                {summary.failed > 0 && `, ${summary.failed} failed`}
              </p>
              {summary.failed > 0 && (
                <div className="mt-2 text-xs text-danger">
                  Failed files:
                  <ul className="mt-1 space-y-0.5">
                    {summary.results.filter(r => !r.success).map((r, i) => (
                      <li key={i}>{r.filename}: {r.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {isUploading ? (
              <button
                type="button"
                onClick={cancelUpload}
                className="px-3 py-1.5 text-sm text-danger hover:bg-danger-bg focus:outline-none focus:ring-1 focus:ring-danger"
              >
                Cancel
              </button>
            ) : summary ? (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-accent text-text-inverse text-sm font-medium hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pendingCount === 0}
                  className="px-3 py-1.5 bg-accent text-text-inverse text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
                >
                  Upload {pendingCount > 0 && `(${pendingCount})`}
                </button>
              </>
            )}
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
  canRemove,
}: {
  resource: { id: string; resourceType: string; resourceId: string; isWritable: boolean };
  projectId: string;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const toast = useToastActions();
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
    onError: (err: any) => {
      toast.error(err.data?.error || 'Failed to remove resource');
    },
  });

  const name = resource.resourceType === 'tm' ? tmData?.name : tbData?.name;
  const languages = resource.resourceType === 'tm'
    ? tmData ? `${tmData.sourceLanguage} → ${tmData.targetLanguage}` : ''
    : tbData ? `${tbData.sourceLanguage} → ${tbData.targetLanguage}` : '';

  return (
    <div className="px-3 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span
          className={`px-1.5 py-0.5 text-2xs font-medium ${
            resource.resourceType === 'tm' ? 'bg-accent/10 text-accent' : 'bg-warning/10 text-warning'
          }`}
          title={resource.resourceType === 'tm' ? 'Translation Memory' : 'Term Base'}
        >
          {resource.resourceType.toUpperCase()}
        </span>
        <div>
          <div className="text-sm font-medium text-text">{name || 'Loading...'}</div>
          <div className="text-xs text-text-muted flex items-center gap-2">
            <span>{languages}</span>
            {resource.isWritable && resource.resourceType === 'tm' && (
              <span
                className="text-success"
                title="New translations will be saved to this TM"
              >
                (Writable)
              </span>
            )}
          </div>
        </div>
      </div>
      {canRemove && (
        <button
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          className="text-xs text-danger hover:text-danger-hover disabled:opacity-50"
          title="Remove this resource from the project"
        >
          {removeMutation.isPending ? 'Removing...' : 'Remove'}
        </button>
      )}
    </div>
  );
}

function ProjectSettingsTab({
  project,
  onUpdate,
  onDelete,
}: {
  project: { id: string; name: string; description?: string | null; status: ProjectStatus; workflowType: WorkflowType };
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [workflowType, setWorkflowType] = useState(project.workflowType);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string; workflowType?: WorkflowType; status?: ProjectStatus }) =>
      projectsApi.update(project.id, data),
    onSuccess: () => {
      setSuccess('Project updated successfully');
      setError('');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => {
      setError(err.data?.error || 'Failed to update project');
      setSuccess('');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => projectsApi.update(project.id, { status: 'archived' as ProjectStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: any) => {
      setError(err.data?.error || 'Failed to archive project');
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => projectsApi.update(project.id, { status: 'active' as ProjectStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: any) => {
      setError(err.data?.error || 'Failed to restore project');
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const changes: { name?: string; description?: string; workflowType?: WorkflowType } = {};
    if (name !== project.name) changes.name = name;
    if (description !== (project.description || '')) changes.description = description;
    if (workflowType !== project.workflowType) changes.workflowType = workflowType;

    if (Object.keys(changes).length === 0) {
      setError('No changes to save');
      return;
    }

    updateMutation.mutate(changes);
  };

  const isArchived = project.status === 'archived';

  return (
    <div className="space-y-4">
      {/* Project Details */}
      <div className="bg-surface-alt border border-border">
        <div className="px-3 py-2 border-b border-border bg-surface-panel">
          <h2 className="text-sm font-medium text-text">Project Details</h2>
          <p className="text-2xs text-text-muted">Edit project name, description, and workflow</p>
        </div>
        <div className="p-4">
          {error && (
            <div className="mb-4 p-2.5 bg-danger-bg border border-danger/30 text-sm text-danger">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-2.5 bg-success-bg border border-success/30 text-sm text-success">
              {success}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none resize-none"
                placeholder="Optional project description..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Workflow Type</label>
              <select
                value={workflowType}
                onChange={(e) => setWorkflowType(e.target.value as WorkflowType)}
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
                title="Change the review process for this project"
              >
                <option value="simple">Simple (Translation only)</option>
                <option value="single_review">Single Review (Translation + Review)</option>
                <option value="full_review">Full Review (Translation + 2 Reviews)</option>
              </select>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="px-3 py-1.5 bg-accent text-text-inverse text-sm font-medium hover:bg-accent-hover disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Archive Section */}
      <div className="bg-surface-alt border border-border">
        <div className="px-3 py-2 border-b border-border bg-surface-panel">
          <h2 className="text-sm font-medium text-text">Archive Project</h2>
          <p className="text-2xs text-text-muted">Hide project from the main list</p>
        </div>
        <div className="p-4">
          <p className="text-sm text-text-secondary mb-3">
            {isArchived
              ? 'This project is currently archived. Archived projects are hidden from the main project list but can be restored at any time.'
              : 'Archiving a project hides it from the main project list. You can restore it at any time from the archived projects view.'}
          </p>
          {isArchived ? (
            <button
              onClick={() => unarchiveMutation.mutate()}
              disabled={unarchiveMutation.isPending}
              className="px-3 py-1.5 bg-success text-text-inverse text-sm font-medium hover:bg-success-hover disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-success focus:ring-offset-1"
              title="Make this project active again"
            >
              {unarchiveMutation.isPending ? 'Restoring...' : 'Restore Project'}
            </button>
          ) : (
            <button
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="px-3 py-1.5 bg-warning text-text-inverse text-sm font-medium hover:bg-warning-hover disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-1"
              title="Archive this project - it can be restored later"
            >
              {archiveMutation.isPending ? 'Archiving...' : 'Archive Project'}
            </button>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-surface-alt border border-danger/30">
        <div className="px-3 py-2 border-b border-danger/30 bg-danger-bg">
          <h2 className="text-sm font-medium text-danger">Danger Zone</h2>
          <p className="text-2xs text-danger/70">Irreversible actions</p>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-text">Delete this project</h3>
              <p className="text-xs text-text-muted mt-1">
                Once you delete a project, there is no going back. This will permanently delete the project and all its documents, segments, and translation data.
              </p>
            </div>
            <button
              onClick={onDelete}
              className="flex-shrink-0 px-3 py-1.5 bg-danger text-text-inverse text-sm font-medium hover:bg-danger-hover focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1"
              title="Permanently delete this project and all its data"
            >
              Delete Project
            </button>
          </div>
        </div>
      </div>
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
  const toast = useToastActions();
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
    onError: (err: any) => {
      toast.error(err.data?.error || 'Failed to add resource');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedId) {
      addMutation.mutate();
    }
  };

  const availableResources = resourceType === 'tm' ? availableTMs : availableTBs;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-alt border border-border shadow-panel w-full max-w-md">
        <div className="px-4 py-3 border-b border-border bg-surface-panel">
          <h2 className="text-sm font-semibold text-text">Attach Resource</h2>
          <p className="text-xs text-text-muted mt-0.5">Add a Translation Memory or Term Base to this project</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Resource Type</label>
            <div className="flex gap-4">
              <label
                className="flex items-center gap-2 cursor-pointer"
                title="Translation Memory - stores past translations for reuse"
              >
                <input
                  type="radio"
                  checked={resourceType === 'tm'}
                  onChange={() => { setResourceType('tm'); setSelectedId(''); }}
                  className="text-accent focus:ring-accent"
                />
                <span className="text-sm text-text">Translation Memory</span>
              </label>
              <label
                className="flex items-center gap-2 cursor-pointer"
                title="Term Base - approved terminology dictionary"
              >
                <input
                  type="radio"
                  checked={resourceType === 'tb'}
                  onChange={() => { setResourceType('tb'); setSelectedId(''); }}
                  className="text-accent focus:ring-accent"
                />
                <span className="text-sm text-text">Term Base</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Select {resourceType === 'tm' ? 'Translation Memory' : 'Term Base'}
            </label>
            {availableResources.length === 0 ? (
              <p className="text-sm text-text-muted py-2">
                No available {resourceType === 'tm' ? 'TMs' : 'TBs'}. Create one first in the{' '}
                <Link to={resourceType === 'tm' ? '/tm' : '/tb'} className="text-accent hover:text-accent-hover">
                  {resourceType === 'tm' ? 'TM' : 'TB'} management page
                </Link>.
              </p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
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
              <label
                className="flex items-center gap-2 cursor-pointer"
                title="If enabled, confirmed translations will be saved to this TM for future reuse"
              >
                <input
                  type="checkbox"
                  checked={isWritable}
                  onChange={(e) => setIsWritable(e.target.checked)}
                  className="text-accent focus:ring-accent rounded"
                />
                <span className="text-sm text-text">
                  Writable (allow "Save to TM" to add entries)
                </span>
              </label>
              <p className="mt-1 text-2xs text-text-muted ml-5">
                When enabled, confirmed translations will be saved to this TM.
              </p>
            </div>
          )}

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
              disabled={!selectedId || addMutation.isPending}
              className="px-3 py-1.5 bg-accent text-text-inverse text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
            >
              {addMutation.isPending ? 'Attaching...' : 'Attach'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
