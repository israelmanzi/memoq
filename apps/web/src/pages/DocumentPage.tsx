import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { projectsApi, tbApi, tmApi, type SegmentWithMatchInfo } from '../api';
import type { SegmentStatus, TermMatch } from '@memoq/shared';
import { HighlightedText } from '../components/HighlightedText';

type StatusFilter = 'all' | 'untranslated' | 'translated' | 'reviewed' | 'fuzzy';

// Helper component to highlight selected text within context
function HighlightedSelection({ text, selection }: { text: string; selection: string }) {
  if (!text) return <span className="text-gray-400 italic">No text</span>;
  if (!selection) return <span>{text}</span>;

  // Find the selection in the text (case-insensitive)
  const lowerText = text.toLowerCase();
  const lowerSelection = selection.toLowerCase();
  const index = lowerText.indexOf(lowerSelection);

  if (index === -1) {
    // Selection not found in text - just show the text
    return <span>{text}</span>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + selection.length);
  const after = text.slice(index + selection.length);

  return (
    <span>
      {before}
      <mark className="bg-yellow-300 text-gray-900 px-0.5 rounded">{match}</mark>
      {after}
    </span>
  );
}

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

  // Get first writable TM for "Confirm + TM" feature
  const writableTMId = resourcesData?.items?.find(
    (r) => r.resourceType === 'tm' && r.isWritable
  )?.resourceId ?? null;

  // Get first writable TB for "Add to TB" feature
  const writableTBId = resourcesData?.items?.find(
    (r) => r.resourceType === 'tb' && r.isWritable
  )?.resourceId ?? null;

  // Fetch TM details to get name
  const { data: writableTM } = useQuery({
    queryKey: ['tm', writableTMId],
    queryFn: () => tmApi.get(writableTMId!),
    enabled: !!writableTMId,
  });

  // Fetch TB details to get name
  const { data: writableTB } = useQuery({
    queryKey: ['tb', writableTBId],
    queryFn: () => tbApi.get(writableTBId!),
    enabled: !!writableTBId,
  });

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

        {/* Navigation + Actions */}
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
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <Link
            to="/projects/$projectId"
            params={{ projectId: document.projectId }}
            className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Done Editing
          </Link>
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
                isLastSegment={index === segments.length - 1}
                onClick={() => setSelectedSegmentId(segment.id)}
                onDeselect={() => setSelectedSegmentId(null)}
                documentId={documentId}
                projectId={document.projectId}
                termMatches={segment.id === selectedSegmentId ? selectedSegment?.termMatches : undefined}
                pendingTermInsert={segment.id === selectedSegmentId ? pendingTermInsert : null}
                onTermInserted={() => setPendingTermInsert(null)}
                writableTMName={writableTM?.name ?? null}
                writableTBId={writableTBId}
                writableTBName={writableTB?.name ?? null}
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
  isLastSegment,
  onClick,
  onDeselect,
  documentId,
  projectId,
  termMatches,
  pendingTermInsert,
  onTermInserted,
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
  pendingTermInsert?: string | null;
  onTermInserted?: () => void;
  writableTMName: string | null;
  writableTBId: string | null;
  writableTBName: string | null;
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

  const [lastPropagation, setLastPropagation] = useState<{ count: number } | null>(null);

  const updateMutation = useMutation({
    mutationFn: (data: { targetText: string; status?: SegmentStatus; confirm?: boolean; propagate?: boolean }) =>
      projectsApi.updateSegment(documentId, segment.id, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['segments', documentId] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      // Invalidate parent queries for accurate progress on navigation
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
      setIsEditing(false);
      // Show propagation result
      if (result.propagation && result.propagation.propagatedCount > 0) {
        setLastPropagation({ count: result.propagation.propagatedCount });
        // Auto-hide after 3 seconds
        setTimeout(() => setLastPropagation(null), 3000);
      }
    },
  });

  // Term selection state for live highlighting in table view
  const [termSelection, setTermSelection] = useState({ source: '', target: '' });
  const sourceRef = useRef<HTMLDivElement>(null);

  // Track source text selection
  const handleSourceMouseUp = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';
    if (selectedText && sourceRef.current?.contains(selection?.anchorNode ?? null)) {
      setTermSelection((prev) => ({ ...prev, source: selectedText }));
    }
  };

  // Track target text selection
  const handleTargetSelect = () => {
    if (textareaRef.current) {
      const { selectionStart, selectionEnd } = textareaRef.current;
      const selectedText = targetText.slice(selectionStart, selectionEnd).trim();
      if (selectedText) {
        setTermSelection((prev) => ({ ...prev, target: selectedText }));
      }
    }
  };

  // Add Term Modal state
  const [showAddTermModal, setShowAddTermModal] = useState(false);
  const [termForm, setTermForm] = useState({
    source: '',
    target: '',
    definition: '',
    sourceContext: '', // Full source text for highlighting
    targetContext: '', // Full target text for highlighting
  });
  const [termAddSuccess, setTermAddSuccess] = useState(false);

  // Mutation for adding term to TB
  const addToTBMutation = useMutation({
    mutationFn: ({ sourceTerm, targetTerm, definition }: { sourceTerm: string; targetTerm: string; definition?: string }) =>
      tbApi.addTerm(writableTBId!, { sourceTerm, targetTerm, definition }),
    onSuccess: () => {
      // Invalidate segment query to refresh term matches
      queryClient.invalidateQueries({ queryKey: ['segment', documentId] });
      queryClient.invalidateQueries({ queryKey: ['tb'] });
      // Show success and close modal
      setTermAddSuccess(true);
      setTimeout(() => {
        setShowAddTermModal(false);
        setTermForm({ source: '', target: '', definition: '', sourceContext: '', targetContext: '' });
        setTermAddSuccess(false);
        clearTermSelection(); // Clear highlights after successful add
      }, 1000);
    },
  });

  const openAddTermModal = () => {
    // Use tracked selections (which persist even after clicking elsewhere)
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

  const handleSave = () => {
    updateMutation.mutate({
      targetText,
      status: 'translated',
    });
  };

  const handleConfirm = () => {
    // Confirm sets status to reviewed_1 which auto-saves to TM
    // Also propagate to identical untranslated segments
    updateMutation.mutate(
      {
        targetText,
        status: 'reviewed_1',
        propagate: true, // Auto-propagate to identical segments
      },
      {
        onSuccess: () => {
          if (isLastSegment) {
            // Last segment - just close/deselect
            onDeselect();
          } else {
            // Auto-advance to next segment
            onConfirmComplete?.();
          }
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
    if (!writableTBId || !termForm.source.trim() || !termForm.target.trim()) return;
    addToTBMutation.mutate({
      sourceTerm: termForm.source.trim(),
      targetTerm: termForm.target.trim(),
      definition: termForm.definition.trim() || undefined,
    });
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
        ref={sourceRef}
        className="flex-1 p-3 border-r border-gray-100 bg-gray-50 select-text"
        onMouseUp={handleSourceMouseUp}
      >
        <div className="text-sm text-gray-900 leading-relaxed">
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
            <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
              Source: "{termSelection.source}"
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setTermSelection((prev) => ({ ...prev, source: '' })); }}
              className="text-xs text-gray-400 hover:text-gray-600"
              title="Clear source selection"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Target panel */}
      <div className="flex-1 p-3">
        {isSelected ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            {/* Show target selection indicator above textarea */}
            {termSelection.target && (
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                  Target: "{termSelection.target}"
                </span>
                <button
                  onClick={() => setTermSelection((prev) => ({ ...prev, target: '' }))}
                  className="text-xs text-gray-400 hover:text-gray-600"
                  title="Clear target selection"
                >
                  ✕
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              onFocus={() => setIsEditing(true)}
              onSelect={handleTargetSelect}
              className={`w-full px-2 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${
                termSelection.target ? 'border-orange-300 bg-orange-50/30' : 'border-gray-300'
              }`}
              rows={Math.max(2, Math.ceil(segment.sourceText.length / 60))}
              placeholder="Enter translation..."
            />
            <div className="flex gap-1.5 flex-wrap items-center">
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
                title="Save as translated (draft)"
              >
                Save
              </button>
              <button
                onClick={handleConfirm}
                disabled={updateMutation.isPending}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                title={writableTMName ? `Confirm, save to "${writableTMName}", and propagate` : 'Confirm and propagate (no TM linked)'}
              >
                {writableTMName ? `Confirm → ${writableTMName}` : 'Confirm'}
              </button>
              {lastPropagation && (
                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded animate-pulse">
                  +{lastPropagation.count} propagated
                </span>
              )}
              {writableTBId && (
                <button
                  onClick={openAddTermModal}
                  className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"
                  title={writableTBName ? `Add term to "${writableTBName}"` : 'Add a term pair to Term Base'}
                >
                  + Term{writableTBName ? ` → ${writableTBName}` : ''}
                </button>
              )}
              <button
                onClick={() => {
                  setTargetText(segment.targetText ?? '');
                  setIsEditing(false);
                  onDeselect();
                }}
                className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                title="Cancel changes and close"
              >
                Cancel
              </button>
            </div>

            {/* Add Term Modal */}
            {showAddTermModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}>
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Add to Term Base</h3>
                      {writableTBName && (
                        <p className="text-sm text-orange-600">→ {writableTBName}</p>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  {termAddSuccess ? (
                    <div className="py-8 text-center">
                      <div className="text-green-500 text-4xl mb-2">✓</div>
                      <p className="text-green-700 font-medium">Term added successfully!</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Context with highlighted selections */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-2 bg-gray-50 rounded border border-gray-200">
                          <p className="text-xs font-medium text-gray-500 mb-1">Source text:</p>
                          <p className="text-sm text-gray-700 leading-relaxed">
                            <HighlightedSelection
                              text={termForm.sourceContext}
                              selection={termForm.source}
                            />
                          </p>
                        </div>
                        <div className="p-2 bg-gray-50 rounded border border-gray-200">
                          <p className="text-xs font-medium text-gray-500 mb-1">Target text:</p>
                          <p className="text-sm text-gray-700 leading-relaxed">
                            <HighlightedSelection
                              text={termForm.targetContext}
                              selection={termForm.target}
                            />
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Source Term <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={termForm.source}
                          onChange={(e) => setTermForm({ ...termForm, source: e.target.value })}
                          placeholder="Enter source term"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Target Term <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={termForm.target}
                          onChange={(e) => setTermForm({ ...termForm, target: e.target.value })}
                          placeholder="Enter target term (translation)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Definition <span className="text-gray-400">(optional)</span>
                        </label>
                        <textarea
                          value={termForm.definition}
                          onChange={(e) => setTermForm({ ...termForm, definition: e.target.value })}
                          placeholder="Add context, usage notes, or examples..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                        />
                      </div>

                      {/* Preview */}
                      {termForm.source && termForm.target && (
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                          <p className="text-xs font-medium text-orange-700 mb-2">Preview:</p>
                          <p className="text-sm">
                            <span className="font-medium text-gray-900">{termForm.source}</span>
                            <span className="text-gray-400 mx-2">→</span>
                            <span className="font-medium text-gray-900">{termForm.target}</span>
                          </p>
                          {termForm.definition && (
                            <p className="text-xs text-gray-600 mt-1 italic">{termForm.definition}</p>
                          )}
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => { setShowAddTermModal(false); clearTermSelection(); }}
                          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddToTB}
                          disabled={!termForm.source.trim() || !termForm.target.trim() || addToTBMutation.isPending}
                          className="px-4 py-2 text-sm bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {addToTBMutation.isPending ? 'Adding...' : 'Add Term'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
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
