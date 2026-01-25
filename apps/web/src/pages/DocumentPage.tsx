import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from '@tanstack/react-router';
import { projectsApi, tbApi, tmApi, activityApi, type SegmentWithMatchInfo } from '../api';
import type { SegmentStatus, TermMatch } from '@oxy/shared';
import { HighlightedText } from '../components/HighlightedText';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { ActivityFeed } from '../components/ActivityFeed';
import { formatWorkflowStatus, formatSegmentStatus } from '../utils/formatters';

type StatusFilter = 'all' | 'untranslated' | 'translated' | 'reviewed' | 'fuzzy';

// Status configuration
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  untranslated: { label: 'New', color: 'text-slate-500', bg: 'bg-slate-100', border: 'border-l-slate-300' },
  draft: { label: 'Draft', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-l-amber-400' },
  translated: { label: 'Translated', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-l-blue-500' },
  reviewed_1: { label: 'Reviewed', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-l-emerald-500' },
  reviewed_2: { label: 'Reviewed 2', color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-l-teal-500' },
  locked: { label: 'Locked', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-l-purple-500' },
};

// Match percentage badge component
function MatchBadge({ percent, isContext }: { percent: number; isContext?: boolean }) {
  const getMatchStyle = () => {
    if (percent === 100) return { bg: 'bg-emerald-500', text: 'text-white' };
    if (percent >= 95) return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
    if (percent >= 75) return { bg: 'bg-amber-100', text: 'text-amber-700' };
    if (percent >= 50) return { bg: 'bg-orange-100', text: 'text-orange-700' };
    return { bg: 'bg-slate-100', text: 'text-slate-600' };
  };

  const style = getMatchStyle();

  return (
    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${style.bg} ${style.text}`}>
      <span>{percent}%</span>
      {isContext && (
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </div>
  );
}

// Helper component to highlight selected text within context
function HighlightedSelection({ text, selection }: { text: string; selection: string }) {
  if (!text) return <span className="text-gray-400 italic">No text</span>;
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
      <mark className="bg-yellow-200 text-gray-900 px-0.5 rounded">{match}</mark>
      {after}
    </span>
  );
}

export function DocumentPage() {
  const { documentId } = useParams({ from: '/protected/documents/$documentId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [pendingInsert, setPendingInsert] = useState<{ text: string; mode: 'replace' | 'insert' } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  const { data: document } = useQuery({
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

  const handleExport = async (format: 'txt' | 'xliff') => {
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

  if (!document) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <Link
            to="/projects/$projectId"
            params={{ projectId: document.projectId }}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm mb-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to project
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 truncate">{document.name}</h1>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Status & Progress */}
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                document.workflowStatus === 'complete'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {formatWorkflowStatus(document.workflowStatus)}
            </span>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${document.progress}%` }}
                />
              </div>
              <span className="text-slate-600 font-medium">{document.progress}%</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Link
              to="/projects/$projectId"
              params={{ projectId: document.projectId }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Done
            </Link>

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors disabled:opacity-50"
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
                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Export Format
                    </div>
                    <button
                      onClick={() => handleExport('xliff')}
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      XLIFF
                    </button>
                    <button
                      onClick={() => handleExport('txt')}
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Plain Text
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 bg-white rounded-lg border border-slate-200 p-2 sm:p-3">
        {/* Filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {[
            { key: 'all', label: 'All', count: stats.total },
            { key: 'untranslated', label: 'New', count: stats.untranslated },
            { key: 'translated', label: 'Translated', count: stats.translated },
            { key: 'reviewed', label: 'Reviewed', count: stats.reviewed },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key as StatusFilter)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                statusFilter === tab.key ? 'bg-blue-200' : 'bg-slate-200'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={goToNextUntranslated}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
            title="Jump to next untranslated (Ctrl+U)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            <span className="hidden sm:inline">Next new</span>
          </button>

          <div className="flex items-center border border-slate-200 rounded-md">
            <button
              onClick={() => {
                const idx = segments.findIndex((s) => s.id === selectedSegmentId);
                const prevSegment = segments[idx - 1];
                if (idx > 0 && prevSegment) setSelectedSegmentId(prevSegment.id);
              }}
              disabled={!selectedSegmentId || segments.findIndex((s) => s.id === selectedSegmentId) <= 0}
              className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-l-md transition-colors"
              title="Previous segment"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <button
              onClick={goToNextSegment}
              disabled={!selectedSegmentId || segments.findIndex((s) => s.id === selectedSegmentId) >= segments.length - 1}
              className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-r-md transition-colors"
              title="Next segment"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => setShowSidePanel(!showSidePanel)}
            className={`p-1.5 rounded-md transition-colors lg:hidden ${
              showSidePanel ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Toggle side panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Segments list */}
        <div className={`${showSidePanel ? 'w-full lg:w-2/3' : 'w-full'} bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col transition-all`}>
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_1fr] gap-0 border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wider">
            <div className="w-14 sm:w-20 px-2 py-2.5 text-center">#</div>
            <div className="px-3 py-2.5 border-l border-slate-200">Source</div>
            <div className="px-3 py-2.5 border-l border-slate-200">Target</div>
          </div>

          {/* Segments */}
          <div className="flex-1 overflow-y-auto">
            {segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <svg className="w-12 h-12 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">No segments match the current filter</p>
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
                />
              ))
            )}
          </div>
        </div>

        {/* Side panel */}
        {showSidePanel && (
          <div className="hidden lg:flex w-1/3 flex-col gap-3 overflow-y-auto">
            {selectedSegmentId && selectedSegment ? (
              <>
                {/* TM Matches */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">TM Matches</h3>
                  </div>
                  <div className="p-3">
                    {selectedSegment.matches.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No matches found</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedSegment.matches.map((match) => (
                          <button
                            key={match.id}
                            onClick={() => handleInsertMatch(match.targetText)}
                            className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <MatchBadge percent={match.matchPercent} isContext={match.isContextMatch} />
                              <span className="text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                Click to use
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mb-1 line-clamp-2">{match.sourceText}</p>
                            <p className="text-sm text-slate-800 line-clamp-2">{match.targetText}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* TB Terms */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Terminology</h3>
                  </div>
                  <div className="p-3">
                    {!selectedSegment.termMatches || selectedSegment.termMatches.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No terms found</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSegment.termMatches.map((term, idx) => (
                          <button
                            key={`${term.id}-${idx}`}
                            onClick={() => setPendingInsert({ text: term.targetTerm, mode: 'replace' })}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors text-xs"
                            title={`Insert: ${term.targetTerm}`}
                          >
                            <span className="text-orange-700 font-medium">{term.sourceTerm}</span>
                            <svg className="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className="text-orange-600">{term.targetTerm}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Segment info */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Segment Info</h3>
                  </div>
                  <div className="p-3">
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-slate-400">Status</dt>
                        <dd className="text-slate-700 font-medium">{formatSegmentStatus(selectedSegment.status)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Characters</dt>
                        <dd className="text-slate-700 font-medium">{selectedSegment.sourceText.length}</dd>
                      </div>
                      {selectedSegment.translatedByName && (
                        <div className="col-span-2">
                          <dt className="text-slate-400">Translated by</dt>
                          <dd className="text-slate-700 truncate">{selectedSegment.translatedByName}</dd>
                        </div>
                      )}
                      {selectedSegment.reviewedByName && (
                        <div className="col-span-2">
                          <dt className="text-slate-400">Reviewed by</dt>
                          <dd className="text-slate-700 truncate">{selectedSegment.reviewedByName}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-400">
                <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p className="text-sm">Select a segment to see details</p>
              </div>
            )}

            {/* Activity */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Recent Activity</h3>
              </div>
              <div className="p-3 max-h-48 overflow-y-auto">
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
}) {
  const queryClient = useQueryClient();
  const [targetText, setTargetText] = useState(segment.targetText ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Scroll into view when selected
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSelected]);

  const insertTerm = (term: string) => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = targetText.slice(0, start) + term + targetText.slice(end);
      setTargetText(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + term.length;
      }, 0);
    } else {
      setTargetText(term);
      setIsEditing(true);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  const replaceTarget = (text: string) => {
    setTargetText(text);
    setIsEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
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

  const handleTargetSelect = () => {
    if (textareaRef.current) {
      const { selectionStart, selectionEnd } = textareaRef.current;
      const selectedText = targetText.slice(selectionStart, selectionEnd).trim();
      if (selectedText) {
        setTermSelection((prev) => ({ ...prev, target: selectedText }));
      }
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

  const handleSave = () => {
    updateMutation.mutate({ targetText, status: 'translated' });
  };

  const handleConfirm = () => {
    updateMutation.mutate(
      { targetText, status: 'reviewed_1', propagate: true },
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
      className={`grid grid-cols-[auto_1fr_1fr] gap-0 border-b border-slate-100 cursor-pointer transition-all ${
        isSelected
          ? `${statusConfig.bg} ring-1 ring-inset ring-blue-200`
          : `hover:bg-slate-50 border-l-4 ${statusConfig.border}`
      }`}
      onClick={onClick}
    >
      {/* Segment number column */}
      <div className={`w-14 sm:w-20 flex flex-col items-center justify-center py-3 gap-1 ${
        isSelected ? `border-l-4 ${statusConfig.border}` : ''
      }`}>
        <span className="text-[11px] font-medium text-slate-400">{index + 1}</span>
        {segment.bestMatchPercent !== null && segment.bestMatchPercent !== undefined && (
          <MatchBadge percent={segment.bestMatchPercent} isContext={segment.hasContextMatch} />
        )}
        <span className={`text-[9px] font-medium uppercase tracking-wide ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Source panel */}
      <div
        ref={sourceRef}
        className="p-3 border-l border-slate-100 bg-slate-50/50 select-text"
        onMouseUp={handleSourceMouseUp}
      >
        <div className="text-sm text-slate-700 leading-relaxed">
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
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[10px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
              "{termSelection.source}"
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setTermSelection((prev) => ({ ...prev, source: '' })); }}
              className="text-[10px] text-slate-400 hover:text-slate-600 p-0.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Target panel */}
      <div className="p-3 border-l border-slate-100">
        {isSelected ? (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            {termSelection.target && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                  "{termSelection.target}"
                </span>
                <button
                  onClick={() => setTermSelection((prev) => ({ ...prev, target: '' }))}
                  className="text-[10px] text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              onFocus={() => setIsEditing(true)}
              onSelect={handleTargetSelect}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-colors ${
                termSelection.target ? 'border-orange-300 bg-orange-50/30' : 'border-slate-300 bg-white'
              }`}
              rows={Math.max(2, Math.ceil(segment.sourceText.length / 50))}
              placeholder="Enter translation..."
            />

            {/* Action buttons - better grouped and spaced */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary actions */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending || !targetText.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Save as draft (Ctrl+S)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save
                </button>

                <button
                  onClick={handleConfirm}
                  disabled={updateMutation.isPending || !targetText.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={writableTMName ? `Confirm and save to TM (Ctrl+Enter)` : 'Confirm (Ctrl+Enter)'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Confirm
                  {writableTMName && <span className="opacity-75">+ TM</span>}
                </button>
              </div>

              {/* Secondary actions */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopySource}
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
                  title="Copy source to target"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="hidden sm:inline">Copy src</span>
                </button>

                {writableTBId && (
                  <button
                    onClick={openAddTermModal}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-orange-700 bg-orange-100 rounded-md hover:bg-orange-200 transition-colors"
                    title="Add term to terminology"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="hidden sm:inline">Term</span>
                  </button>
                )}
              </div>

              {/* Propagation indicator */}
              {lastPropagation && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-md animate-pulse">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  +{lastPropagation.count} propagated
                </span>
              )}

              {/* Cancel - pushed to end */}
              <button
                onClick={() => {
                  setTargetText(segment.targetText ?? '');
                  setIsEditing(false);
                  onDeselect();
                }}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Add Term Modal */}
            {showAddTermModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Add to Terminology</h3>
                      {writableTBName && (
                        <p className="text-xs text-orange-600">{writableTBName}</p>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-4">
                    {termAddSuccess ? (
                      <div className="py-8 text-center">
                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-emerald-700 font-medium">Term added successfully!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Context preview */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Source</p>
                            <p className="text-xs text-slate-600 line-clamp-2">
                              <HighlightedSelection text={termForm.sourceContext} selection={termForm.source} />
                            </p>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Target</p>
                            <p className="text-xs text-slate-600 line-clamp-2">
                              <HighlightedSelection text={termForm.targetContext} selection={termForm.target} />
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Source Term <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={termForm.source}
                              onChange={(e) => setTermForm({ ...termForm, source: e.target.value })}
                              placeholder="Enter source term"
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Target Term <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={termForm.target}
                              onChange={(e) => setTermForm({ ...termForm, target: e.target.value })}
                              placeholder="Enter translation"
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Definition <span className="text-slate-400">(optional)</span>
                          </label>
                          <textarea
                            value={termForm.definition}
                            onChange={(e) => setTermForm({ ...termForm, definition: e.target.value })}
                            placeholder="Add context or notes..."
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                          />
                        </div>

                        {termForm.source && termForm.target && (
                          <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                            <span className="text-xs font-medium text-orange-700">{termForm.source}</span>
                            <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className="text-xs font-medium text-orange-700">{termForm.target}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {!termAddSuccess && (
                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                      <button
                        onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddToTB}
                        disabled={!termForm.source.trim() || !termForm.target.trim() || addToTBMutation.isPending}
                        className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          <div className={`text-sm leading-relaxed ${segment.targetText ? 'text-slate-700' : 'text-slate-400 italic'}`}>
            {segment.targetText || 'Click to translate...'}
          </div>
        )}
      </div>
    </div>
  );
}
