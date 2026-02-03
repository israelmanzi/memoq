import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from '@tanstack/react-router';
import { projectsApi, tbApi, tmApi, activityApi, type SegmentWithMatchInfo } from '../api';
import type { SegmentStatus, TermMatch } from '@oxy/shared';
import { HighlightedText } from '../components/HighlightedText';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { ActivityFeed } from '../components/ActivityFeed';
import { PdfViewer } from '../components/PdfViewer';
import { TranslationEditor, getEditorRef } from '../components/TranslationEditor';
import { DocumentAssignmentsModal } from '../components/DocumentAssignmentsModal';
import { formatWorkflowStatus, formatSegmentStatus } from '../utils/formatters';
import { useOrgStore } from '../stores/org';

type StatusFilter = 'all' | 'untranslated' | 'translated' | 'reviewed' | 'fuzzy';

// Status configuration - using neutral/utilitarian palette
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; tooltip: string }> = {
  untranslated: { label: 'New', color: 'text-text-secondary', bg: 'bg-surface-panel', border: 'border-l-border', tooltip: 'Not yet translated' },
  draft: { label: 'Draft', color: 'text-warning', bg: 'bg-warning-bg', border: 'border-l-warning', tooltip: 'Work in progress, not confirmed' },
  translated: { label: 'Translated', color: 'text-accent', bg: 'bg-accent/10', border: 'border-l-accent', tooltip: 'Translation confirmed, pending review' },
  reviewed_1: { label: 'Reviewed', color: 'text-success', bg: 'bg-success-bg', border: 'border-l-success', tooltip: 'Reviewed and approved (level 1)' },
  reviewed_2: { label: 'Reviewed 2', color: 'text-success', bg: 'bg-success-bg', border: 'border-l-success', tooltip: 'Reviewed and approved (level 2)' },
  locked: { label: 'Locked', color: 'text-text-muted', bg: 'bg-surface-panel', border: 'border-l-border-dark', tooltip: 'Final, no further edits allowed' },
};

// Match percentage badge - utilitarian
function MatchBadge({ percent, isContext }: { percent: number; isContext?: boolean }) {
  const getMatchStyle = () => {
    if (percent === 100) return { bg: 'bg-success', text: 'text-text-inverse', desc: 'Exact match - identical source text' };
    if (percent >= 95) return { bg: 'bg-success-bg', text: 'text-success', desc: 'Very high match - minor differences' };
    if (percent >= 75) return { bg: 'bg-warning-bg', text: 'text-warning', desc: 'Good match - some differences' };
    if (percent >= 50) return { bg: 'bg-surface-panel', text: 'text-text-secondary', desc: 'Partial match - review carefully' };
    return { bg: 'bg-surface-panel', text: 'text-text-muted', desc: 'Low match - significant differences' };
  };

  const style = getMatchStyle();
  const tooltip = isContext
    ? `${percent}% match with context (same surrounding segments). ${style.desc}`
    : `${percent}% similarity to source text. ${style.desc}`;

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium cursor-help ${style.bg} ${style.text}`}
      title={tooltip}
    >
      {percent}%{isContext && <span>*</span>}
    </span>
  );
}

// Helper component to highlight selected text within context
function HighlightedSelection({ text, selection }: { text: string; selection: string }) {
  if (!text) return <span className="text-text-muted">—</span>;
  if (!selection) return <span>{text}</span>;

  const lowerText = text.toLowerCase();
  const lowerSelection = selection.toLowerCase();
  const index = lowerText.indexOf(lowerSelection);

  if (index === -1) return <span>{text}</span>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + selection.length);
  const after = text.slice(index + selection.length);

  return (
    <span>
      {before}
      <mark className="bg-warning-bg text-text px-0.5">{match}</mark>
      {after}
    </span>
  );
}

export function DocumentPage() {
  const { documentId } = useParams({ from: '/protected/documents/$documentId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentOrg } = useOrgStore();
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [pendingInsert, setPendingInsert] = useState<{ text: string; mode: 'replace' | 'insert' } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignmentsModal, setShowAssignmentsModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [concordanceQuery, setConcordanceQuery] = useState('');
  const [concordanceSearchIn, setConcordanceSearchIn] = useState<'source' | 'target' | 'both'>('both');

  // Global Escape key handler for modals and menus
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showExportMenu) {
          setShowExportMenu(false);
        } else if (showDeleteModal) {
          setShowDeleteModal(false);
        } else if (selectedSegmentId) {
          setSelectedSegmentId(null);
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showExportMenu, showDeleteModal, selectedSegmentId]);

  const { data: document, isLoading: documentLoading, error: documentError } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => projectsApi.getDocument(documentId),
  });

  const { data: resourcesData } = useQuery({
    queryKey: ['project-resources', document?.projectId],
    queryFn: () => projectsApi.listResources(document!.projectId),
    enabled: !!document?.projectId,
  });

  const writableTMId = resourcesData?.items?.find(
    (r) => r.resourceType === 'tm' && r.isWritable
  )?.resourceId ?? null;

  const writableTBId = resourcesData?.items?.find(
    (r) => r.resourceType === 'tb' && r.isWritable
  )?.resourceId ?? null;

  const { data: writableTM } = useQuery({
    queryKey: ['tm', writableTMId],
    queryFn: () => tmApi.get(writableTMId!),
    enabled: !!writableTMId,
  });

  const { data: writableTB } = useQuery({
    queryKey: ['tb', writableTBId],
    queryFn: () => tbApi.get(writableTBId!),
    enabled: !!writableTBId,
  });

  const { data: segmentsData } = useQuery({
    queryKey: ['segments', documentId],
    queryFn: () => projectsApi.listSegments(documentId, true),
    enabled: !!document,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['document-activity', documentId],
    queryFn: () => activityApi.listForDocument(documentId, { limit: 15 }),
    enabled: !!document,
  });

  const allSegments = segmentsData?.items ?? [];
  const activities = activityData?.items ?? [];

  const segments = allSegments.filter((seg) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'untranslated') return !seg.status || seg.status === 'untranslated';
    if (statusFilter === 'translated') return seg.status === 'translated' || seg.status === 'draft';
    if (statusFilter === 'reviewed') return seg.status === 'reviewed_1' || seg.status === 'reviewed_2' || seg.status === 'locked';
    if (statusFilter === 'fuzzy') return seg.bestMatchPercent !== null && seg.bestMatchPercent >= 50 && seg.bestMatchPercent < 100;
    return true;
  });

  const goToNextSegment = () => {
    if (!selectedSegmentId) return;
    const currentIndex = segments.findIndex((s) => s.id === selectedSegmentId);
    const nextSegment = segments[currentIndex + 1];
    if (currentIndex < segments.length - 1 && nextSegment) {
      setSelectedSegmentId(nextSegment.id);
    }
  };

  const goToNextUntranslated = () => {
    const currentIndex = selectedSegmentId
      ? segments.findIndex((s) => s.id === selectedSegmentId)
      : -1;
    const nextUntranslated = segments.find((s, i) =>
      i > currentIndex && (!s.status || s.status === 'untranslated')
    );
    if (nextUntranslated) {
      setSelectedSegmentId(nextUntranslated.id);
    }
  };

  const { data: selectedSegment } = useQuery({
    queryKey: ['segment', documentId, selectedSegmentId],
    queryFn: () => projectsApi.getSegment(documentId, selectedSegmentId!),
    enabled: !!selectedSegmentId,
  });

  // Concordance search query
  const { data: concordanceResults, isLoading: concordanceLoading } = useQuery({
    queryKey: ['concordance', documentId, concordanceQuery, concordanceSearchIn],
    queryFn: () => projectsApi.concordanceSearch(documentId, concordanceQuery, concordanceSearchIn),
    enabled: concordanceQuery.trim().length >= 2,
  });

  const handleInsertMatch = (targetText: string) => {
    if (!selectedSegmentId) return;
    setPendingInsert({ text: targetText, mode: 'replace' });
  };

  const handleDeleteDocument = async () => {
    setIsDeleting(true);
    try {
      await projectsApi.deleteDocument(documentId);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      navigate({ to: '/projects/$projectId', params: { projectId: document!.projectId } });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async (format: 'txt' | 'xliff' | 'docx' | 'pdf') => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      await projectsApi.exportDocument(documentId, format);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Check if document is a PDF (for showing viewer)
  const isPdf = document?.fileType === 'pdf';
  const isDocx = document?.fileType === 'docx';
  // Check if PDF has a converted DOCX (for export options)
  const structureMetadata = document?.structureMetadata as { convertedDocxStorageKey?: string } | null;
  const pdfHasConvertedDocx = isPdf && !!structureMetadata?.convertedDocxStorageKey;
  // PDF viewer only shows if we have the file stored
  const showPdfViewer = isPdf && !!document?.fileStorageKey;

  if (documentLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (documentError || !document) {
    const is404 = documentError && 'status' in documentError && documentError.status === 404;
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <svg className="w-16 h-16 text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h2 className="text-lg font-semibold text-text mb-2">
          {is404 ? 'Document not found' : 'Failed to load document'}
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          {is404
            ? 'The document you are looking for does not exist or has been deleted.'
            : 'An error occurred while loading the document. Please try again.'}
        </p>
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Projects
        </Link>
      </div>
    );
  }

  // Calculate progress stats
  const stats = {
    total: allSegments.length,
    untranslated: allSegments.filter((s) => !s.status || s.status === 'untranslated').length,
    translated: allSegments.filter((s) => s.status === 'translated' || s.status === 'draft').length,
    reviewed: allSegments.filter((s) => s.status === 'reviewed_1' || s.status === 'reviewed_2' || s.status === 'locked').length,
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-surface">
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-surface-panel border-b border-border">
        {/* Left: Navigation + Title */}
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/projects/$projectId"
            params={{ projectId: document.projectId }}
            className="p-1 text-text-secondary hover:text-text hover:bg-surface-hover rounded focus:outline-none focus:ring-1 focus:ring-accent"
            title="Back to project"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-sm font-medium text-text truncate">{document.name}</h1>
          <span className={`px-1.5 py-0.5 text-2xs font-medium ${
            document.workflowStatus === 'complete' ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
          }`}>
            {formatWorkflowStatus(document.workflowStatus)}
          </span>
        </div>

        {/* Center: Progress */}
        <div
          className="hidden sm:flex items-center gap-2 cursor-help"
          title={`${stats.total - stats.untranslated} of ${stats.total} segments translated (${stats.translated} in progress, ${stats.reviewed} reviewed)`}
        >
          <div className="flex items-center gap-1 text-2xs text-text-secondary">
            <span>{stats.total - stats.untranslated}/{stats.total}</span>
          </div>
          <div className="w-24 h-1 bg-border rounded-sm overflow-hidden">
            <div className="h-full bg-success transition-all" style={{ width: `${document.progress}%` }} />
          </div>
          <span className="text-2xs font-medium text-text-secondary">{document.progress}%</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center">
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExporting}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text hover:bg-surface-hover disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-accent"
              title="Export document"
            >
              {isExporting ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              Export
            </button>

            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-0.5 w-36 bg-surface-alt border border-border shadow-panel py-0.5 z-20">
                  <button onClick={() => handleExport('xliff')} className="w-full px-2 py-1 text-left text-xs text-text hover:bg-surface-hover">XLIFF</button>
                  <button onClick={() => handleExport('txt')} className="w-full px-2 py-1 text-left text-xs text-text hover:bg-surface-hover">Plain Text</button>
                  {/* For PDF with converted DOCX, show DOCX export (PDF export loses quality) */}
                  {pdfHasConvertedDocx ? (
                    <button onClick={() => handleExport('docx')} className="w-full px-2 py-1 text-left text-xs text-text hover:bg-surface-hover">Word (DOCX)</button>
                  ) : (
                    <button onClick={() => handleExport('pdf')} className="w-full px-2 py-1 text-left text-xs text-text hover:bg-surface-hover">PDF</button>
                  )}
                  {isDocx && <button onClick={() => handleExport('docx')} className="w-full px-2 py-1 text-left text-xs text-text hover:bg-surface-hover">Word (DOCX)</button>}
                </div>
              </>
            )}
          </div>

          {/* Assignments button */}
          <button
            onClick={() => setShowAssignmentsModal(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-accent"
            title="Manage document assignments"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Assign
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          <button
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-danger hover:bg-danger-bg focus:outline-none focus:ring-1 focus:ring-danger"
            title="Delete document"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Edit restriction banner */}
      {document.canEdit === false && document.editRestrictionReason && (
        <div className="px-3 py-2 bg-warning-bg border-b border-warning/30 flex items-center gap-2">
          <svg className="w-4 h-4 text-warning flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-xs text-warning">{document.editRestrictionReason}</span>
          {document.assignments && (
            <div className="ml-auto flex items-center gap-3 text-2xs text-text-secondary">
              <span>
                <span className="font-medium">T:</span>{' '}
                {document.assignments.translator?.userName || 'Unassigned'}
              </span>
              <span>
                <span className="font-medium">R1:</span>{' '}
                {document.assignments.reviewer_1?.userName || 'Unassigned'}
              </span>
              <span>
                <span className="font-medium">R2:</span>{' '}
                {document.assignments.reviewer_2?.userName || 'Unassigned'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1 px-2 py-1 bg-surface-alt border-b border-border">
        {/* Filter tabs */}
        <div className="flex items-center gap-px">
          {[
            { key: 'all', label: 'All', count: stats.total, tooltip: 'Show all segments' },
            { key: 'untranslated', label: 'New', count: stats.untranslated, tooltip: 'Segments needing translation' },
            { key: 'translated', label: 'Translated', count: stats.translated, tooltip: 'Translated but not reviewed' },
            { key: 'reviewed', label: 'Reviewed', count: stats.reviewed, tooltip: 'Reviewed and approved' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key as StatusFilter)}
              title={tab.tooltip}
              className={`flex items-center gap-1 px-2 py-1 text-xs whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-accent ${
                statusFilter === tab.key
                  ? 'bg-surface text-text font-medium border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text hover:bg-surface-hover'
              }`}
            >
              {tab.label}
              <span className={`px-1 py-px text-xs ${
                statusFilter === tab.key ? 'text-accent' : 'text-text-muted'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center gap-px">
          <button
            onClick={goToNextUntranslated}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-accent"
            title="Jump to next untranslated segment"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            <span className="hidden sm:inline">Next New</span>
          </button>

          <div className="h-4 w-px bg-border mx-0.5" />

          <button
            onClick={() => {
              const idx = segments.findIndex((s) => s.id === selectedSegmentId);
              const prevSegment = segments[idx - 1];
              if (idx > 0 && prevSegment) setSelectedSegmentId(prevSegment.id);
            }}
            disabled={!selectedSegmentId || segments.findIndex((s) => s.id === selectedSegmentId) <= 0}
            className="p-1 text-text-secondary hover:text-text hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-accent"
            title="Go to previous segment (Up arrow)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={goToNextSegment}
            disabled={!selectedSegmentId || segments.findIndex((s) => s.id === selectedSegmentId) >= segments.length - 1}
            className="p-1 text-text-secondary hover:text-text hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-accent"
            title="Go to next segment (Down arrow)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className="h-4 w-px bg-border mx-0.5" />

          <button
            onClick={() => setShowSidePanel(!showSidePanel)}
            className={`p-1 focus:outline-none focus:ring-1 focus:ring-accent lg:hidden ${
              showSidePanel ? 'text-accent bg-surface' : 'text-text-secondary hover:text-text hover:bg-surface-hover'
            }`}
            title="Toggle side panel (TM matches, terms, concordance)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex min-h-0">
        {/* PDF Viewer (for PDF documents) */}
        {showPdfViewer && (
          <div className="hidden lg:flex w-1/2 border-r border-border overflow-hidden flex-col bg-surface-alt">
            <PdfViewer
              url={projectsApi.getOriginalFileUrl(documentId)}
              className="flex-1"
            />
          </div>
        )}

        {/* Segments list */}
        <div className={`${showPdfViewer ? 'w-full lg:w-1/2' : showSidePanel ? 'w-full lg:w-2/3' : 'w-full'} flex flex-col transition-all`}>
          {/* Table header - compact */}
          <div className="grid grid-cols-[3rem_1fr_1fr] gap-0 bg-surface-panel border-b border-border text-2xs font-medium text-text-secondary uppercase tracking-wide">
            <div className="px-1 py-1 text-center">#</div>
            <div className="px-2 py-1 border-l border-border">Source</div>
            <div className="px-2 py-1 border-l border-border">Target</div>
          </div>

          {/* Segments - dense list */}
          <div className="flex-1 overflow-y-auto bg-surface-alt">
            {segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                <p className="text-xs">No segments match filter</p>
              </div>
            ) : (
              segments.map((segment, index) => (
                <SegmentRow
                  key={segment.id}
                  segment={segment}
                  index={index}
                  isSelected={segment.id === selectedSegmentId}
                  isLastSegment={index === segments.length - 1}
                  onClick={() => setSelectedSegmentId(segment.id)}
                  onDeselect={() => setSelectedSegmentId(null)}
                  documentId={documentId}
                  projectId={document.projectId}
                  termMatches={segment.id === selectedSegmentId ? selectedSegment?.termMatches : undefined}
                  pendingInsert={segment.id === selectedSegmentId ? pendingInsert : null}
                  onInsertHandled={() => setPendingInsert(null)}
                  writableTMName={writableTM?.name ?? null}
                  writableTBId={writableTBId}
                  writableTBName={writableTB?.name ?? null}
                  onConfirmComplete={goToNextSegment}
                  canEdit={document.canEdit !== false}
                />
              ))
            )}
          </div>
        </div>

        {/* Side panel - compact, organized */}
        {showSidePanel && !showPdfViewer && (
          <div className="hidden lg:flex w-1/3 flex-col border-l border-border bg-surface-panel overflow-y-auto">
            {selectedSegmentId && selectedSegment ? (
              <>
                {/* TM Matches */}
                <div className="border-b border-border">
                  <div className="flex items-center justify-between px-2 py-1.5 bg-surface-panel">
                    <h3
                      className="text-xs font-medium text-text-secondary uppercase tracking-wide cursor-help"
                      title="Translation Memory: Previously translated segments that match the current source text. Click to insert."
                    >
                      TM Matches
                    </h3>
                    <span className="text-xs text-text-muted">{selectedSegment.matches.length}</span>
                  </div>
                  <div className="bg-surface-alt">
                    {selectedSegment.matches.length === 0 ? (
                      <div className="px-2 py-3 text-center text-xs text-text-muted">
                        No matching translations found in memory
                      </div>
                    ) : (
                      <div className="divide-y divide-border-light">
                        {selectedSegment.matches.map((match) => (
                          <button
                            key={match.id}
                            onClick={() => handleInsertMatch(match.targetText)}
                            className="w-full text-left px-2 py-2 hover:bg-surface-hover focus:outline-none focus:bg-surface-hover"
                            title="Click to use this translation"
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              <MatchBadge percent={match.matchPercent} isContext={match.isContextMatch} />
                            </div>
                            <p className="text-xs text-text-secondary line-clamp-1">{match.sourceText}</p>
                            <p className="text-sm text-text line-clamp-1">{match.targetText}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Concordance Search */}
                <div className="border-b border-border">
                  <div className="px-2 py-1.5 bg-surface-panel">
                    <h3
                      className="text-xs font-medium text-text-secondary uppercase tracking-wide cursor-help"
                      title="Concordance Search: Find how specific words or phrases were translated previously across the entire translation memory."
                    >
                      Concordance
                    </h3>
                  </div>
                  <div className="p-2 bg-surface-alt">
                    <p className="text-2xs text-text-muted mb-1.5">Search translation memory for specific words or phrases</p>
                    <div className="flex gap-1 mb-2">
                      <input
                        type="text"
                        value={concordanceQuery}
                        onChange={(e) => setConcordanceQuery(e.target.value)}
                        placeholder="Enter word or phrase..."
                        className="flex-1 px-2 py-1 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
                        title="Type a word or phrase to search for in the translation memory"
                      />
                      <select
                        value={concordanceSearchIn}
                        onChange={(e) => setConcordanceSearchIn(e.target.value as 'source' | 'target' | 'both')}
                        className="px-2 py-1 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
                        title="Choose where to search: source text, target text, or both"
                      >
                        <option value="both">Both</option>
                        <option value="source">Source</option>
                        <option value="target">Target</option>
                      </select>
                    </div>
                    {concordanceQuery.trim().length < 2 ? (
                      <p className="text-xs text-text-muted py-1">Type at least 2 characters to search</p>
                    ) : concordanceLoading ? (
                      <p className="text-xs text-text-muted py-1">Searching...</p>
                    ) : !concordanceResults?.items?.length ? (
                      <p className="text-xs text-text-muted py-1">No results</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto divide-y divide-border-light">
                        {concordanceResults.items.slice(0, 5).map((match) => (
                          <button
                            key={match.id}
                            onClick={() => handleInsertMatch(match.targetText)}
                            className="w-full text-left py-1.5 hover:bg-surface-hover"
                            title="Click to use this translation"
                          >
                            <p className="text-xs text-text-secondary line-clamp-1">
                              <HighlightedSelection text={match.sourceText} selection={concordanceQuery} />
                            </p>
                            <p className="text-sm text-text line-clamp-1">
                              <HighlightedSelection text={match.targetText} selection={concordanceQuery} />
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* TB Terms */}
                <div className="border-b border-border">
                  <div className="flex items-center justify-between px-2 py-1.5 bg-surface-panel">
                    <h3
                      className="text-xs font-medium text-text-secondary uppercase tracking-wide cursor-help"
                      title="Term Base: Approved terminology for this project. Click a term to insert its translation at the cursor position."
                    >
                      Terms
                    </h3>
                    <span className="text-xs text-text-muted">{selectedSegment.termMatches?.length || 0}</span>
                  </div>
                  <div className="p-2 bg-surface-alt">
                    {!selectedSegment.termMatches || selectedSegment.termMatches.length === 0 ? (
                      <p className="text-xs text-text-muted">No terminology matches in this segment</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSegment.termMatches.map((term, idx) => (
                          <button
                            key={`${term.id}-${idx}`}
                            onClick={() => setPendingInsert({ text: term.targetTerm, mode: 'insert' })}
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-warning-bg text-warning hover:bg-surface-hover border border-warning/30 focus:outline-none focus:ring-1 focus:ring-warning"
                            title={`Click to insert "${term.targetTerm}" at cursor position`}
                          >
                            <span>{term.sourceTerm}</span>
                            <span className="text-text-muted">→</span>
                            <span className="font-medium">{term.targetTerm}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Segment info */}
                <div className="border-b border-border">
                  <div className="px-2 py-1.5 bg-surface-panel">
                    <h3
                      className="text-xs font-medium text-text-secondary uppercase tracking-wide cursor-help"
                      title="Segment Information: Details about the selected segment including status, character count, and who worked on it."
                    >
                      Segment Info
                    </h3>
                  </div>
                  <div className="px-2 py-2 bg-surface-alt text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-text-muted">Status:</span>
                      <span className="text-text">{formatSegmentStatus(selectedSegment.status)}</span>
                      <span className="text-text-muted">Chars:</span>
                      <span className="text-text">{selectedSegment.sourceText.length}</span>
                    </div>
                    {(selectedSegment.translatedByName || selectedSegment.reviewedByName) && (
                      <div className="flex items-center gap-3 mt-1">
                        {selectedSegment.translatedByName && (
                          <>
                            <span className="text-text-muted">By:</span>
                            <span className="text-text truncate">{selectedSegment.translatedByName}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-3 bg-surface-alt">
                <p className="text-xs text-text-secondary mb-2">Select a segment to translate</p>
                <div className="text-xs space-y-1">
                  <div className="flex gap-2">
                    <kbd className="px-1.5 py-0.5 bg-surface border border-border text-text-muted text-xs">Ctrl+S</kbd>
                    <span className="text-text-muted">Save draft</span>
                  </div>
                  <div className="flex gap-2">
                    <kbd className="px-1.5 py-0.5 bg-surface border border-border text-text-muted text-xs">Ctrl+Enter</kbd>
                    <span className="text-text-muted">Confirm</span>
                  </div>
                  <div className="flex gap-2">
                    <kbd className="px-1.5 py-0.5 bg-surface border border-border text-text-muted text-xs">Esc</kbd>
                    <span className="text-text-muted">Cancel</span>
                  </div>
                </div>
              </div>
            )}

            {/* Activity */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-2 py-1.5 bg-surface-panel border-b border-border">
                <h3
                  className="text-xs font-medium text-text-secondary uppercase tracking-wide cursor-help"
                  title="Activity Log: Recent actions performed on this document, including translations, reviews, and edits."
                >
                  Activity
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto bg-surface-alt p-2">
                <ActivityFeed
                  activities={activities}
                  isLoading={activityLoading}
                  showEntityName={false}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Document Modal */}
      {showDeleteModal && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteDocument}
          mode="impact"
          title="Delete Document"
          itemName={document.name}
          impacts={document.totalSegments > 0 ? [{ label: 'segments', count: document.totalSegments }] : []}
          isDeleting={isDeleting}
        />
      )}

      {/* Assignments Modal */}
      {showAssignmentsModal && currentOrg && document.workflowType && (
        <DocumentAssignmentsModal
          documentId={documentId}
          orgId={currentOrg.id}
          workflowStatus={document.workflowStatus}
          workflowType={document.workflowType}
          onClose={() => setShowAssignmentsModal(false)}
          onAssignmentChange={() => {
            queryClient.invalidateQueries({ queryKey: ['document', documentId] });
          }}
        />
      )}
    </div>
  );
}

function SegmentRow({
  segment,
  index,
  isSelected,
  isLastSegment,
  onClick,
  onDeselect,
  documentId,
  projectId,
  termMatches,
  pendingInsert,
  onInsertHandled,
  writableTMName,
  writableTBId,
  writableTBName,
  onConfirmComplete,
  canEdit = true,
}: {
  segment: SegmentWithMatchInfo;
  index: number;
  isSelected: boolean;
  isLastSegment: boolean;
  onClick: () => void;
  onDeselect: () => void;
  documentId: string;
  projectId: string;
  termMatches?: TermMatch[];
  pendingInsert?: { text: string; mode: 'replace' | 'insert' } | null;
  onInsertHandled?: () => void;
  writableTMName: string | null;
  writableTBId: string | null;
  writableTBName: string | null;
  onConfirmComplete?: () => void;
  canEdit?: boolean;
}) {
  const queryClient = useQueryClient();
  const [targetText, setTargetText] = useState(segment.targetText ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Scroll into view when selected
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSelected]);

  const insertTerm = (term: string) => {
    const editorRef = getEditorRef(editorContainerRef.current);
    if (isEditing && editorRef) {
      editorRef.insertText(term, false); // Insert at cursor
    } else {
      setTargetText(term);
      setIsEditing(true);
      setTimeout(() => {
        editorRef?.focus();
      }, 0);
    }
  };

  const replaceTarget = (text: string) => {
    setTargetText(text);
    setIsEditing(true);
    setTimeout(() => {
      const editorRef = getEditorRef(editorContainerRef.current);
      editorRef?.focus();
    }, 0);
  };

  useEffect(() => {
    if (pendingInsert) {
      if (pendingInsert.mode === 'replace') {
        replaceTarget(pendingInsert.text);
      } else {
        insertTerm(pendingInsert.text);
      }
      onInsertHandled?.();
    }
  }, [pendingInsert]);

  const [lastPropagation, setLastPropagation] = useState<{ count: number } | null>(null);

  const updateMutation = useMutation({
    mutationFn: (data: { targetText: string; status?: SegmentStatus; confirm?: boolean; propagate?: boolean }) =>
      projectsApi.updateSegment(documentId, segment.id, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['segments', documentId] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
      setIsEditing(false);
      if (result.propagation && result.propagation.propagatedCount > 0) {
        setLastPropagation({ count: result.propagation.propagatedCount });
        setTimeout(() => setLastPropagation(null), 3000);
      }
    },
  });

  const [termSelection, setTermSelection] = useState({ source: '', target: '' });
  const sourceRef = useRef<HTMLDivElement>(null);

  const handleSourceMouseUp = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';
    if (selectedText && sourceRef.current?.contains(selection?.anchorNode ?? null)) {
      setTermSelection((prev) => ({ ...prev, source: selectedText }));
    }
  };

  const handleTargetSelectionChange = (selectedText: string) => {
    if (selectedText.trim()) {
      setTermSelection((prev) => ({ ...prev, target: selectedText.trim() }));
    }
  };

  const [showAddTermModal, setShowAddTermModal] = useState(false);
  const [termForm, setTermForm] = useState({
    source: '',
    target: '',
    definition: '',
    sourceContext: '',
    targetContext: '',
  });
  const [termAddSuccess, setTermAddSuccess] = useState(false);

  const addToTBMutation = useMutation({
    mutationFn: ({ sourceTerm, targetTerm, definition }: { sourceTerm: string; targetTerm: string; definition?: string }) =>
      tbApi.addTerm(writableTBId!, { sourceTerm, targetTerm, definition }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segment', documentId] });
      queryClient.invalidateQueries({ queryKey: ['tb'] });
      setTermAddSuccess(true);
      setTimeout(() => {
        setShowAddTermModal(false);
        setTermForm({ source: '', target: '', definition: '', sourceContext: '', targetContext: '' });
        setTermAddSuccess(false);
        clearTermSelection();
      }, 1000);
    },
  });

  const openAddTermModal = () => {
    setTermForm({
      source: termSelection.source,
      target: termSelection.target,
      definition: '',
      sourceContext: segment.sourceText,
      targetContext: targetText,
    });
    setShowAddTermModal(true);
  };

  const clearTermSelection = () => {
    setTermSelection({ source: '', target: '' });
  };

  // Escape key handler for this segment row
  useEffect(() => {
    if (!isSelected) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showAddTermModal) {
          setShowAddTermModal(false);
          clearTermSelection();
        } else {
          setTargetText(segment.targetText ?? '');
          setIsEditing(false);
          onDeselect();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isSelected, showAddTermModal, segment.targetText, onDeselect]);

  const [showSameAsSourceWarning, setShowSameAsSourceWarning] = useState(false);

  const handleSave = () => {
    if (!targetText.trim()) return;
    updateMutation.mutate({ targetText, status: 'draft' });
  };

  const handleConfirm = (force = false) => {
    if (!targetText.trim()) return;

    // Warn if target is identical to source (but allow override)
    if (!force && targetText.trim() === segment.sourceText.trim()) {
      setShowSameAsSourceWarning(true);
      return;
    }

    setShowSameAsSourceWarning(false);
    updateMutation.mutate(
      { targetText, status: 'translated', confirm: true, propagate: true },
      {
        onSuccess: () => {
          if (isLastSegment) {
            onDeselect();
          } else {
            onConfirmComplete?.();
          }
        },
      }
    );
  };

  const handleCopySource = () => {
    setTargetText(segment.sourceText);
    if (!isEditing) setIsEditing(true);
  };

  const handleAddToTB = () => {
    if (!writableTBId || !termForm.source.trim() || !termForm.target.trim()) return;
    addToTBMutation.mutate({
      sourceTerm: termForm.source.trim(),
      targetTerm: termForm.target.trim(),
      definition: termForm.definition.trim() || undefined,
    });
  };

  const status = segment.status ?? 'untranslated';
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.untranslated!;

  return (
    <div
      ref={rowRef}
      className={`grid grid-cols-[3rem_1fr_1fr] gap-0 border-b border-border-light cursor-pointer ${
        isSelected
          ? 'bg-surface ring-1 ring-inset ring-accent/30'
          : `hover:bg-surface-hover border-l-2 ${statusConfig.border}`
      }`}
      onClick={onClick}
    >
      {/* Segment number column */}
      <div className={`flex flex-col items-center justify-center py-2 gap-0.5 ${
        isSelected ? `border-l-2 ${statusConfig.border}` : ''
      }`}>
        <span className="text-xs font-medium text-text-muted">{index + 1}</span>
        {segment.bestMatchPercent !== null && segment.bestMatchPercent !== undefined && (
          <MatchBadge percent={segment.bestMatchPercent} isContext={segment.hasContextMatch} />
        )}
        <span
          className={`text-2xs ${statusConfig.color} cursor-help`}
          title={statusConfig.tooltip}
        >
          {statusConfig.label}
        </span>
      </div>

      {/* Source panel */}
      <div
        ref={sourceRef}
        className="px-2 py-2 border-l border-border-light bg-surface-panel select-text"
        onMouseUp={handleSourceMouseUp}
      >
        <div className="text-sm text-text leading-relaxed">
          {termSelection.source ? (
            <HighlightedSelection text={segment.sourceText} selection={termSelection.source} />
          ) : (
            <HighlightedText
              text={segment.sourceText}
              termMatches={termMatches ?? []}
              onTermClick={(term) => insertTerm(term.targetTerm)}
            />
          )}
        </div>
        {termSelection.source && (
          <div className="mt-1 flex items-center gap-1">
            <span className="text-xs text-warning bg-warning-bg px-1.5 py-0.5">
              "{termSelection.source}"
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setTermSelection((prev) => ({ ...prev, source: '' })); }}
              className="text-xs text-text-muted hover:text-text p-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Target panel */}
      <div className="px-2 py-2 border-l border-border-light bg-surface-alt">
        {isSelected && !canEdit ? (
          // Read-only view when user can't edit
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className={`text-sm leading-relaxed ${segment.targetText ? 'text-text' : 'text-text-muted'}`}>
              {segment.targetText || '(No translation)'}
            </div>
            <div className="text-2xs text-text-muted italic">
              View only - you don't have permission to edit this segment
            </div>
          </div>
        ) : isSelected ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            {termSelection.target && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-warning bg-warning-bg px-1.5 py-0.5">
                  "{termSelection.target}"
                </span>
                <button
                  onClick={() => setTermSelection((prev) => ({ ...prev, target: '' }))}
                  className="text-xs text-text-muted hover:text-text p-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div ref={editorContainerRef}>
              <TranslationEditor
                value={targetText}
                onChange={(val) => {
                  setTargetText(val);
                  setShowSameAsSourceWarning(false);
                }}
                onFocus={() => setIsEditing(true)}
                onSelectionChange={handleTargetSelectionChange}
                onConfirm={() => handleConfirm()}
                onSave={handleSave}
                placeholder="Enter translation..."
                sourceText={segment.sourceText}
                terms={termMatches}
                disabled={updateMutation.isPending}
                className={termSelection.target ? 'border-warning' : 'border-border'}
                minHeight={Math.max(40, Math.ceil(segment.sourceText.length / 60) * 20)}
              />
            </div>

            {/* Warning: Same as source */}
            {showSameAsSourceWarning && (
              <div className="flex items-center gap-2 px-2 py-1.5 bg-warning-bg border border-warning/30 text-xs">
                <span className="text-warning">Same as source.</span>
                <button
                  onClick={() => handleConfirm(true)}
                  className="px-2 py-1 text-xs font-medium text-warning hover:bg-warning/10 focus:outline-none focus:ring-1 focus:ring-warning"
                >
                  Confirm anyway
                </button>
                <button
                  onClick={() => setShowSameAsSourceWarning(false)}
                  className="px-2 py-1 text-xs text-text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Action buttons - compact toolbar style */}
            <div className="flex items-center gap-1.5 pt-1">
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending || !targetText.trim()}
                className="px-2.5 py-1 text-xs text-text-secondary bg-surface border border-border hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-accent"
                title="Save as draft without confirming - work in progress (Ctrl+S)"
              >
                Save Draft
              </button>

              <button
                onClick={() => handleConfirm()}
                disabled={updateMutation.isPending || !targetText.trim()}
                className="px-2.5 py-1 text-xs text-text-inverse bg-success hover:bg-success-hover disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-success"
                title={writableTMName
                  ? `Confirm translation and save to Translation Memory "${writableTMName}" (Ctrl+Enter)`
                  : 'Confirm translation as complete (Ctrl+Enter)'
                }
              >
                Confirm{writableTMName && ' + TM'}
              </button>

              <div className="h-4 w-px bg-border mx-0.5" />

              <button
                onClick={handleCopySource}
                className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-accent"
                title="Copy source text to target field"
              >
                Copy Source
              </button>

              {writableTBId && (
                <button
                  onClick={openAddTermModal}
                  className="px-2 py-1 text-xs text-warning hover:bg-warning-bg focus:outline-none focus:ring-1 focus:ring-warning"
                  title="Add selected text as a new term to the terminology database"
                >
                  + Add Term
                </button>
              )}

              {/* Propagation indicator */}
              {lastPropagation && (
                <span className="px-2 py-0.5 text-xs text-accent-muted bg-accent/10 animate-pulse">
                  +{lastPropagation.count}
                </span>
              )}

              {/* Cancel - pushed to end */}
              <button
                onClick={() => {
                  setTargetText(segment.targetText ?? '');
                  setIsEditing(false);
                  onDeselect();
                }}
                className="ml-auto px-2 py-1 text-xs text-text-muted hover:text-text hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-accent"
                title="Discard changes and close editor (Escape)"
              >
                Cancel
              </button>
            </div>

            {/* Add Term Modal */}
            {showAddTermModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}>
                <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div>
                      <h3 className="text-base font-semibold text-text">Add to Terminology</h3>
                      {writableTBName && (
                        <p className="text-xs text-warning">{writableTBName}</p>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}
                      className="p-1 text-text-muted hover:text-text"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-4">
                    {termAddSuccess ? (
                      <div className="py-8 text-center">
                        <div className="w-12 h-12 bg-success-bg flex items-center justify-center mx-auto mb-3">
                          <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-success font-medium">Term added successfully!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Context preview */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 bg-surface-panel border border-border">
                            <p className="text-[10px] font-medium text-text-muted uppercase mb-1">Source</p>
                            <p className="text-xs text-text-secondary line-clamp-2">
                              <HighlightedSelection text={termForm.sourceContext} selection={termForm.source} />
                            </p>
                          </div>
                          <div className="p-2 bg-surface-panel border border-border">
                            <p className="text-[10px] font-medium text-text-muted uppercase mb-1">Target</p>
                            <p className="text-xs text-text-secondary line-clamp-2">
                              <HighlightedSelection text={termForm.targetContext} selection={termForm.target} />
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">
                              Source Term <span className="text-danger">*</span>
                            </label>
                            <input
                              type="text"
                              value={termForm.source}
                              onChange={(e) => setTermForm({ ...termForm, source: e.target.value })}
                              placeholder="Enter source term"
                              className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:outline-none focus:border-accent"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">
                              Target Term <span className="text-danger">*</span>
                            </label>
                            <input
                              type="text"
                              value={termForm.target}
                              onChange={(e) => setTermForm({ ...termForm, target: e.target.value })}
                              placeholder="Enter translation"
                              className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:outline-none focus:border-accent"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">
                            Definition <span className="text-text-muted">(optional)</span>
                          </label>
                          <textarea
                            value={termForm.definition}
                            onChange={(e) => setTermForm({ ...termForm, definition: e.target.value })}
                            placeholder="Add context or notes..."
                            rows={2}
                            className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:outline-none focus:border-accent resize-none"
                          />
                        </div>

                        {termForm.source && termForm.target && (
                          <div className="flex items-center gap-2 p-2 bg-warning-bg border border-warning/20">
                            <span className="text-xs font-medium text-warning">{termForm.source}</span>
                            <svg className="w-4 h-4 text-warning/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className="text-xs font-medium text-warning">{termForm.target}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {!termAddSuccess && (
                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-surface-panel">
                      <button
                        onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}
                        className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddToTB}
                        disabled={!termForm.source.trim() || !termForm.target.trim() || addToTBMutation.isPending}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-warning hover:bg-warning-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {addToTBMutation.isPending ? 'Adding...' : 'Add Term'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`text-sm leading-relaxed ${segment.targetText ? 'text-text' : 'text-text-muted'}`}>
            {segment.targetText || '—'}
          </div>
        )}
      </div>
    </div>
  );
}
