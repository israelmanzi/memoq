/**
 * Find & Replace Modal
 * Search and replace text across document segments
 */

import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type SegmentWithMatchInfo } from '../api';

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  segments: SegmentWithMatchInfo[];
  onSegmentClick: (segmentId: string) => void;
}

interface MatchResult {
  segmentId: string;
  segmentIndex: number;
  field: 'source' | 'target';
  text: string;
  matchStart: number;
  matchEnd: number;
}

export function FindReplaceModal({
  isOpen,
  onClose,
  documentId,
  segments,
  onSegmentClick,
}: FindReplaceModalProps) {
  const queryClient = useQueryClient();
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchIn, setSearchIn] = useState<'source' | 'target' | 'both'>('target');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Find matches
  const findMatches = useCallback(() => {
    if (!findText.trim()) {
      setMatches([]);
      return;
    }

    const results: MatchResult[] = [];
    const searchPattern = wholeWord ? `\\b${escapeRegex(findText)}\\b` : escapeRegex(findText);
    const regex = new RegExp(searchPattern, caseSensitive ? 'g' : 'gi');

    segments.forEach((segment, index) => {
      if (searchIn === 'source' || searchIn === 'both') {
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(segment.sourceText)) !== null) {
          results.push({
            segmentId: segment.id,
            segmentIndex: index,
            field: 'source',
            text: segment.sourceText,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          });
        }
      }

      if (searchIn === 'target' || searchIn === 'both') {
        const targetText = segment.targetText ?? '';
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(targetText)) !== null) {
          results.push({
            segmentId: segment.id,
            segmentIndex: index,
            field: 'target',
            text: targetText,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          });
        }
      }
    });

    setMatches(results);
    setCurrentMatchIndex(0);
  }, [findText, segments, searchIn, caseSensitive, wholeWord]);

  // Re-run search when parameters change
  useEffect(() => {
    findMatches();
  }, [findMatches]);

  // Navigate to current match
  useEffect(() => {
    if (matches.length > 0 && matches[currentMatchIndex]) {
      const match = matches[currentMatchIndex];
      if (match) {
        onSegmentClick(match.segmentId);
      }
    }
  }, [currentMatchIndex, matches, onSegmentClick]);

  const goToNext = () => {
    if (matches.length > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
    }
  };

  const goToPrev = () => {
    if (matches.length > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
    }
  };

  const replaceMutation = useMutation({
    mutationFn: async (segmentIds: string[]) => {
      const updates = segmentIds.map((segmentId) => {
        const segment = segments.find((s) => s.id === segmentId);
        if (!segment) return null;

        const searchPattern = wholeWord ? `\\b${escapeRegex(findText)}\\b` : escapeRegex(findText);
        const regex = new RegExp(searchPattern, caseSensitive ? 'g' : 'gi');
        const newTargetText = (segment.targetText ?? '').replace(regex, replaceText);

        return { id: segmentId, targetText: newTargetText };
      }).filter((u): u is { id: string; targetText: string } => u !== null);

      if (updates.length === 0) return { updated: 0 };

      return projectsApi.updateSegmentsBulk(documentId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments', documentId] });
      findMatches(); // Re-run search to update matches
    },
  });

  const handleReplaceCurrent = () => {
    const currentMatch = matches[currentMatchIndex];
    if (!currentMatch || currentMatch.field !== 'target') return;
    replaceMutation.mutate([currentMatch.segmentId]);
  };

  const handleReplaceAll = () => {
    const targetMatches = matches.filter((m) => m.field === 'target');
    const uniqueSegmentIds = [...new Set(targetMatches.map((m) => m.segmentId))];
    if (uniqueSegmentIds.length === 0) return;
    replaceMutation.mutate(uniqueSegmentIds);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
        e.preventDefault();
        if (e.shiftKey) goToPrev();
        else goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, matches.length]);

  if (!isOpen) return null;

  const currentMatch = matches[currentMatchIndex];
  const targetMatchCount = matches.filter((m) => m.field === 'target').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50" onClick={onClose}>
      <div
        className="bg-surface-alt border border-border shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-base font-semibold text-text">Find & Replace</h3>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Find input */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Find</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="Search text..."
                className="flex-1 px-3 py-2 text-sm bg-surface border border-border text-text focus:outline-none focus:border-accent"
                autoFocus
              />
              <button
                onClick={goToPrev}
                disabled={matches.length === 0}
                className="px-2 py-2 text-text-secondary hover:text-text hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous match (Shift+Enter)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={goToNext}
                disabled={matches.length === 0}
                className="px-2 py-2 text-text-secondary hover:text-text hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next match (Enter)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Replace input */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Replace with</label>
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replacement text..."
              className="w-full px-3 py-2 text-sm bg-surface border border-border text-text focus:outline-none focus:border-accent"
            />
          </div>

          {/* Options */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="w-4 h-4 text-accent focus:ring-accent border-border bg-surface"
              />
              <span className="text-xs text-text-secondary">Case sensitive</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="w-4 h-4 text-accent focus:ring-accent border-border bg-surface"
              />
              <span className="text-xs text-text-secondary">Whole word</span>
            </label>
            <select
              value={searchIn}
              onChange={(e) => setSearchIn(e.target.value as 'source' | 'target' | 'both')}
              className="px-2 py-1 text-xs bg-surface border border-border text-text focus:border-accent focus:outline-none"
            >
              <option value="target">Target only</option>
              <option value="source">Source only</option>
              <option value="both">Both</option>
            </select>
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">
              {matches.length === 0 ? (
                findText ? 'No matches found' : 'Enter search text'
              ) : (
                <>
                  {currentMatchIndex + 1} of {matches.length} matches
                  {currentMatch && (
                    <span className="ml-2 text-text-muted">
                      (Segment {currentMatch.segmentIndex + 1}, {currentMatch.field})
                    </span>
                  )}
                </>
              )}
            </span>
            {targetMatchCount > 0 && (
              <span className="text-accent">
                {targetMatchCount} replaceable in target
              </span>
            )}
          </div>

          {/* Preview of current match */}
          {currentMatch && (
            <div className="p-2 bg-surface-panel border border-border">
              <p className="text-2xs text-text-muted mb-1">
                Segment {currentMatch.segmentIndex + 1} ({currentMatch.field}):
              </p>
              <p className="text-sm text-text">
                <HighlightMatch
                  text={currentMatch.text}
                  start={currentMatch.matchStart}
                  end={currentMatch.matchEnd}
                />
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-panel">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
          >
            Close
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleReplaceCurrent}
              disabled={!currentMatch || currentMatch.field !== 'target' || replaceMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium text-text bg-surface border border-border hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Replace
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={targetMatchCount === 0 || replaceMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium text-text-inverse bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {replaceMutation.isPending ? 'Replacing...' : `Replace All (${targetMatchCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HighlightMatch({ text, start, end }: { text: string; start: number; end: number }) {
  const before = text.slice(Math.max(0, start - 30), start);
  const match = text.slice(start, end);
  const after = text.slice(end, end + 30);

  return (
    <>
      {start > 30 && '...'}
      {before}
      <mark className="bg-warning-bg text-warning px-0.5">{match}</mark>
      {after}
      {end + 30 < text.length && '...'}
    </>
  );
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
