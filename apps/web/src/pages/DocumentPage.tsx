import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { projectsApi, tbApi, type SegmentWithMatchInfo } from '../api';
import type { SegmentStatus, TermMatch } from '@memoq/shared';
import { HighlightedText } from '../components/HighlightedText';

type StatusFilter = 'all' | 'untranslated' | 'translated' | 'reviewed' | 'fuzzy';

export function DocumentPage() {
  const { documentId } = useParams({ from: '/protected/documents/$documentId' });
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [pendingTermInsert, setPendingTermInsert] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: document } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => projectsApi.getDocument(documentId),
  });

  // Fetch project resources to check for writable TMs
  const { data: resourcesData } = useQuery({
    queryKey: ['project-resources', document?.projectId],
    queryFn: () => projectsApi.listResources(document!.projectId),
    enabled: !!document?.projectId,
  });

  const hasWritableTM = resourcesData?.items?.some(
    (r) => r.resourceType === 'tm' && r.isWritable
  ) ?? false;

  // Get first writable TB for "Add to TB" feature
  const writableTBId = resourcesData?.items?.find(
    (r) => r.resourceType === 'tb' && r.isWritable
  )?.resourceId ?? null;

  const { data: segmentsData } = useQuery({
    queryKey: ['segments', documentId],
    queryFn: () => projectsApi.listSegments(documentId, true), // Include match info
    enabled: !!document,
  });

  const allSegments = segmentsData?.items ?? [];

  // Filter segments based on status filter
  const segments = allSegments.filter((seg) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'untranslated') return !seg.status || seg.status === 'untranslated';
    if (statusFilter === 'translated') return seg.status === 'translated' || seg.status === 'draft';
    if (statusFilter === 'reviewed') return seg.status === 'reviewed_1' || seg.status === 'reviewed_2' || seg.status === 'locked';
    if (statusFilter === 'fuzzy') return seg.bestMatchPercent !== null && seg.bestMatchPercent >= 50 && seg.bestMatchPercent < 100;
    return true;
  });

  // Find next segment (in filtered list) for auto-advance
  const goToNextSegment = () => {
    if (!selectedSegmentId) return;
    const currentIndex = segments.findIndex((s) => s.id === selectedSegmentId);
    const nextSegment = segments[currentIndex + 1];
    if (currentIndex < segments.length - 1 && nextSegment) {
      setSelectedSegmentId(nextSegment.id);
    }
  };

  // Find next untranslated segment
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

  // Insert TM match into textarea (like TB terms) - user can review before saving
  const handleInsertMatch = (targetText: string) => {
    if (!selectedSegmentId) return;
    setPendingTermInsert(targetText);
  };

  if (!document) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link
            to="/projects/$projectId"
            params={{ projectId: document.projectId }}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Back to project
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{document.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{document.progress}% complete</span>
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              document.workflowStatus === 'complete'
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {document.workflowStatus}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 bg-white rounded-lg border border-gray-200 px-4 py-2">
        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Filter:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All ({allSegments.length})</option>
            <option value="untranslated">
              Untranslated ({allSegments.filter((s) => !s.status || s.status === 'untranslated').length})
            </option>
            <option value="translated">
              Translated ({allSegments.filter((s) => s.status === 'translated' || s.status === 'draft').length})
            </option>
            <option value="reviewed">
              Reviewed ({allSegments.filter((s) => s.status === 'reviewed_1' || s.status === 'reviewed_2' || s.status === 'locked').length})
            </option>
            <option value="fuzzy">
              Fuzzy matches ({allSegments.filter((s) => s.bestMatchPercent !== null && s.bestMatchPercent >= 50 && s.bestMatchPercent < 100).length})
            </option>
          </select>
          {statusFilter !== 'all' && (
            <span className="text-xs text-gray-500">
              Showing {segments.length} of {allSegments.length}
            </span>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToNextUntranslated}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            title="Go to next untranslated segment"
          >
            Next untranslated
          </button>
          <button
            onClick={() => {
              const idx = segments.findIndex((s) => s.id === selectedSegmentId);
              const prevSegment = segments[idx - 1];
              if (idx > 0 && prevSegment) setSelectedSegmentId(prevSegment.id);
            }}
            disabled={!selectedSegmentId || segments.findIndex((s) => s.id === selectedSegmentId) <= 0}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous segment"
          >
            ↑
          </button>
          <button
            onClick={goToNextSegment}
            disabled={!selectedSegmentId || segments.findIndex((s) => s.id === selectedSegmentId) >= segments.length - 1}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next segment"
          >
            ↓
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Segments list - Split View */}
        <div className="w-2/3 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex">
            <div className="w-10 text-xs font-medium text-gray-500 uppercase">#</div>
            <div className="flex-1 text-xs font-medium text-gray-500 uppercase">Source</div>
            <div className="flex-1 text-xs font-medium text-gray-500 uppercase">Target</div>
          </div>
          {/* Segments */}
          <div className="flex-1 overflow-y-auto">
            {segments.map((segment, index) => (
              <SegmentRow
                key={segment.id}
                segment={segment}
                index={index}
                isSelected={segment.id === selectedSegmentId}
                onClick={() => setSelectedSegmentId(segment.id)}
                documentId={documentId}
                projectId={document.projectId}
                termMatches={segment.id === selectedSegmentId ? selectedSegment?.termMatches : undefined}
                pendingTermInsert={segment.id === selectedSegmentId ? pendingTermInsert : null}
                onTermInserted={() => setPendingTermInsert(null)}
                hasWritableTM={hasWritableTM}
                writableTBId={writableTBId}
                onConfirmComplete={goToNextSegment}
              />
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div className="w-1/3 space-y-4">
          {selectedSegment && (
            <>
              {/* TM Matches */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">TM Matches</h3>
                {selectedSegment.matches.length === 0 ? (
                  <p className="text-sm text-gray-500">No matches found</p>
                ) : (
                  <div className="space-y-2">
                    {selectedSegment.matches.map((match) => (
                      <div
                        key={match.id}
                        className="p-2 bg-gray-50 rounded border border-gray-200 transition-colors cursor-pointer hover:bg-blue-50 hover:border-blue-300"
                        onClick={() => handleInsertMatch(match.targetText)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-xs font-medium ${
                              match.matchPercent === 100
                                ? 'text-green-600'
                                : match.matchPercent >= 75
                                  ? 'text-yellow-600'
                                  : 'text-gray-600'
                            }`}
                          >
                            {match.matchPercent}% {match.isContextMatch && '(Context)'}
                          </span>
                          <span className="text-xs text-blue-600">Click to insert</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{match.sourceText}</p>
                        <p className="text-sm text-gray-900">{match.targetText}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TB Terms */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">TB Terms</h3>
                {!selectedSegment.termMatches || selectedSegment.termMatches.length === 0 ? (
                  <p className="text-sm text-gray-500">No terms found</p>
                ) : (
                  <div className="space-y-2">
                    {selectedSegment.termMatches.map((term, idx) => (
                      <div
                        key={`${term.id}-${idx}`}
                        className="p-2 bg-orange-50 rounded border border-orange-200 cursor-pointer hover:bg-orange-100 transition-colors"
                        onClick={() => setPendingTermInsert(term.targetTerm)}
                        title="Click to insert term"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-orange-600">Term</span>
                          <span className="text-xs text-orange-600">Click to insert</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{term.sourceTerm}</p>
                        <p className="text-sm text-gray-900">{term.targetTerm}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Segment info */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Segment Info</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Status</dt>
                    <dd className="text-gray-900">{selectedSegment.status}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Characters</dt>
                    <dd className="text-gray-900">{selectedSegment.sourceText.length}</dd>
                  </div>
                </dl>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SegmentRow({
  segment,
  index,
  isSelected,
  onClick,
  documentId,
  projectId,
  termMatches,
  pendingTermInsert,
  onTermInserted,
  hasWritableTM,
  writableTBId,
  onConfirmComplete,
}: {
  segment: SegmentWithMatchInfo;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  documentId: string;
  projectId: string;
  termMatches?: TermMatch[];
  pendingTermInsert?: string | null;
  onTermInserted?: () => void;
  hasWritableTM: boolean;
  writableTBId: string | null;
  onConfirmComplete?: () => void;
}) {
  const queryClient = useQueryClient();
  const [targetText, setTargetText] = useState(segment.targetText ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Insert term at cursor position (or append if not editing)
  const insertTerm = (term: string) => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = targetText.slice(0, start) + term + targetText.slice(end);
      setTargetText(newText);
      // Set cursor position after inserted term
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + term.length;
      }, 0);
    } else {
      // Not editing - append to target text and start editing
      setTargetText((prev) => (prev ? prev + ' ' + term : term));
      setIsEditing(true);
    }
  };

  // Handle pending term insert from side panel
  useEffect(() => {
    if (pendingTermInsert) {
      insertTerm(pendingTermInsert);
      onTermInserted?.();
    }
  }, [pendingTermInsert]);

  const updateMutation = useMutation({
    mutationFn: (data: { targetText: string; status?: SegmentStatus; confirm?: boolean }) =>
      projectsApi.updateSegment(documentId, segment.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments', documentId] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      // Invalidate parent queries for accurate progress on navigation
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
      setIsEditing(false);
    },
  });

  // Track selected text for "Add to TB" feature
  const [selectedSourceText, setSelectedSourceText] = useState('');
  const [selectedTargetText, setSelectedTargetText] = useState('');

  // Mutation for adding term to TB
  const addToTBMutation = useMutation({
    mutationFn: ({ sourceTerm, targetTerm }: { sourceTerm: string; targetTerm: string }) =>
      tbApi.addTerm(writableTBId!, { sourceTerm, targetTerm }),
    onSuccess: () => {
      // Invalidate segment query to refresh term matches
      queryClient.invalidateQueries({ queryKey: ['segment', documentId] });
      // Clear selections after adding
      setSelectedSourceText('');
      setSelectedTargetText('');
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      targetText,
      status: 'translated',
    });
  };

  const handleConfirm = () => {
    // Confirm sets status to reviewed_1 which auto-saves to TM
    updateMutation.mutate(
      {
        targetText,
        status: 'reviewed_1',
      },
      {
        onSuccess: () => {
          // Auto-advance to next segment after confirm
          onConfirmComplete?.();
        },
      }
    );
  };

  const handleCopySource = () => {
    setTargetText(segment.sourceText);
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  const handleAddToTB = () => {
    if (!writableTBId || !selectedSourceText.trim() || !selectedTargetText.trim()) return;
    addToTBMutation.mutate({
      sourceTerm: selectedSourceText.trim(),
      targetTerm: selectedTargetText.trim(),
    });
  };

  // Capture text selection from source
  const handleSourceSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedSourceText(selection.toString().trim());
    }
  };

  // Capture text selection from target textarea
  const handleTargetSelection = () => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== end) {
        setSelectedTargetText(targetText.slice(start, end).trim());
      }
    }
  };

  const statusColors: Record<string, string> = {
    untranslated: 'bg-gray-100 text-gray-600',
    draft: 'bg-yellow-100 text-yellow-600',
    translated: 'bg-blue-100 text-blue-600',
    reviewed_1: 'bg-purple-100 text-purple-600',
    reviewed_2: 'bg-indigo-100 text-indigo-600',
    locked: 'bg-green-100 text-green-600',
  };

  const statusLabels: Record<string, string> = {
    untranslated: 'New',
    draft: 'Draft',
    translated: 'Translated',
    reviewed_1: 'Reviewed',
    reviewed_2: 'Reviewed 2',
    locked: 'Locked',
  };

  // Get match color based on percentage
  const getMatchColor = (percent: number | null) => {
    if (percent === null) return 'text-gray-300';
    if (percent === 100) return 'text-green-600 font-medium';
    if (percent >= 75) return 'text-yellow-600';
    return 'text-gray-400';
  };

  return (
    <div
      className={`flex border-b border-gray-200 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      {/* Segment number and status */}
      <div className="w-20 flex-shrink-0 px-2 py-3 flex flex-col items-start gap-1 border-r border-gray-100 text-xs">
        <span className="text-gray-400 font-mono">#{index + 1}</span>
        <span className={`px-1.5 py-0.5 font-medium rounded ${statusColors[segment.status ?? 'untranslated']}`}>
          {statusLabels[segment.status ?? 'untranslated']}
        </span>
        {segment.bestMatchPercent !== null && segment.bestMatchPercent !== undefined && (
          <span
            className={`${getMatchColor(segment.bestMatchPercent)}`}
            title={segment.hasContextMatch ? 'Context match' : 'TM match'}
          >
            {segment.bestMatchPercent}% TM
          </span>
        )}
      </div>

      {/* Source panel */}
      <div
        className="flex-1 p-3 border-r border-gray-100 bg-gray-50 select-text"
        onMouseUp={handleSourceSelection}
      >
        <div className="text-sm text-gray-900 leading-relaxed">
          <HighlightedText
            text={segment.sourceText}
            termMatches={termMatches ?? []}
            onTermClick={(term) => insertTerm(term.targetTerm)}
          />
        </div>
      </div>

      {/* Target panel */}
      <div className="flex-1 p-3">
        {isSelected ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              ref={textareaRef}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              onSelect={handleTargetSelection}
              onFocus={() => setIsEditing(true)}
              className="w-full px-2 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={Math.max(2, Math.ceil(segment.sourceText.length / 60))}
              placeholder="Enter translation..."
            />
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={handleCopySource}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                title="Copy source text to target"
              >
                Copy src
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                title="Save as translated"
              >
                Save
              </button>
              <button
                onClick={handleConfirm}
                disabled={updateMutation.isPending}
                className={`px-2 py-1 text-xs rounded disabled:opacity-50 ${
                  hasWritableTM
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
                title={hasWritableTM ? 'Confirm and save to TM' : 'Confirm (no TM)'}
              >
                {hasWritableTM ? 'Confirm+TM' : 'Confirm'}
              </button>
              {writableTBId && selectedSourceText && selectedTargetText && (
                <button
                  onClick={handleAddToTB}
                  disabled={addToTBMutation.isPending}
                  className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                  title={`Add "${selectedSourceText}" → "${selectedTargetText}" to TB`}
                >
                  +TB
                </button>
              )}
              <button
                onClick={() => {
                  setTargetText(segment.targetText ?? '');
                  setIsEditing(false);
                }}
                className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                title="Cancel changes"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={`text-sm leading-relaxed ${segment.targetText ? 'text-gray-900' : 'text-gray-400 italic'}`}>
            {segment.targetText || 'Click to translate...'}
          </div>
        )}
      </div>
    </div>
  );
}
