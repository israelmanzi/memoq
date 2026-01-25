import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { projectsApi } from '../api';
import type { Segment, SegmentStatus } from '@memoq/shared';

export function DocumentPage() {
  const { documentId } = useParams({ from: '/protected/documents/$documentId' });
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const { data: document } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => projectsApi.getDocument(documentId),
  });

  const { data: segmentsData } = useQuery({
    queryKey: ['segments', documentId],
    queryFn: () => projectsApi.listSegments(documentId),
    enabled: !!document,
  });

  const segments = segmentsData?.items ?? [];

  const { data: selectedSegment } = useQuery({
    queryKey: ['segment', documentId, selectedSegmentId],
    queryFn: () => projectsApi.getSegment(documentId, selectedSegmentId!),
    enabled: !!selectedSegmentId,
  });

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

      {/* Editor */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Segments list */}
        <div className="w-2/3 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="grid grid-cols-12 text-xs font-medium text-gray-500 uppercase">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Source</div>
              <div className="col-span-5">Target</div>
              <div className="col-span-1">Status</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {segments.map((segment, index) => (
              <SegmentRow
                key={segment.id}
                segment={segment}
                index={index}
                isSelected={segment.id === selectedSegmentId}
                onClick={() => setSelectedSegmentId(segment.id)}
                documentId={documentId}
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
                        className="p-2 bg-gray-50 rounded border border-gray-200 cursor-pointer hover:bg-gray-100"
                        onClick={() => {
                          // Apply match - this would update the segment
                        }}
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
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{match.sourceText}</p>
                        <p className="text-sm text-gray-900">{match.targetText}</p>
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
}: {
  segment: Segment;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  documentId: string;
}) {
  const queryClient = useQueryClient();
  const [targetText, setTargetText] = useState(segment.targetText ?? '');
  const [isEditing, setIsEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: { targetText: string; status?: SegmentStatus; confirm?: boolean }) =>
      projectsApi.updateSegment(documentId, segment.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments', documentId] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      setIsEditing(false);
    },
  });

  const handleSave = (confirm = false) => {
    updateMutation.mutate({
      targetText,
      status: 'translated',
      confirm,
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

  return (
    <div
      className={`grid grid-cols-12 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
        isSelected ? 'bg-blue-50' : ''
      }`}
      onClick={onClick}
    >
      <div className="col-span-1 text-sm text-gray-400">{index + 1}</div>
      <div className="col-span-5 text-sm text-gray-900 pr-4">{segment.sourceText}</div>
      <div className="col-span-5 pr-4">
        {isEditing ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={2}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSave(false)}
                disabled={updateMutation.isPending}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={updateMutation.isPending}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Save to TM
              </button>
              <button
                onClick={() => {
                  setTargetText(segment.targetText ?? '');
                  setIsEditing(false);
                }}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`text-sm ${segment.targetText ? 'text-gray-900' : 'text-gray-400 italic'}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
          >
            {segment.targetText || 'Double-click to translate'}
          </div>
        )}
      </div>
      <div className="col-span-1">
        <span
          className={`px-1.5 py-0.5 text-xs font-medium rounded ${statusColors[segment.status ?? 'untranslated']}`}
        >
          {(segment.status ?? 'untranslated').charAt(0).toUpperCase()}
        </span>
      </div>
    </div>
  );
}
