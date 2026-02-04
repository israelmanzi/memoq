/**
 * QA Panel Component
 * Shows QA issues for a segment or document
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qaApi, type QACheckResult, getQASeverityColor, getQASeverityBgColor } from '../api';

interface QAPanelProps {
  documentId: string;
  segmentId?: string | null;
  onSegmentClick?: (segmentId: string) => void;
}

export function QAPanel({ documentId, segmentId, onSegmentClick }: QAPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const { data: documentResult, refetch, isLoading } = useQuery({
    queryKey: ['qa-document', documentId],
    queryFn: () => qaApi.checkDocument(documentId),
    enabled: false, // Only run when triggered
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const handleRunQA = async () => {
    setIsRunning(true);
    try {
      await refetch();
    } finally {
      setIsRunning(false);
    }
  };

  // Get issues for current segment
  const currentSegmentIssues = segmentId && documentResult
    ? documentResult.results.find(r => r.segmentId === segmentId)?.issues ?? []
    : [];

  const hasIssues = documentResult && documentResult.totalIssues > 0;

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-2 py-1.5 bg-surface-panel">
        <h3
          className="text-xs font-medium text-text-secondary uppercase tracking-wide cursor-help"
          title="Quality Assurance: Check for common translation issues like missing numbers, punctuation mismatches, terminology consistency."
        >
          QA Checks
        </h3>
        <button
          onClick={handleRunQA}
          disabled={isRunning || isLoading}
          className="px-2 py-0.5 text-2xs text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Run QA checks on all segments"
        >
          {isRunning || isLoading ? 'Running...' : 'Run QA'}
        </button>
      </div>

      <div className="bg-surface-alt">
        {!documentResult ? (
          <div className="px-2 py-3 text-center text-xs text-text-muted">
            Click "Run QA" to check for issues
          </div>
        ) : !hasIssues ? (
          <div className="px-2 py-3 text-center">
            <div className="flex items-center justify-center gap-1 text-success">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-medium">All checks passed!</span>
            </div>
            <p className="text-2xs text-text-muted mt-1">
              {documentResult.totalSegments} segments checked
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-light">
            {/* Summary */}
            <div className="px-2 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">
                  {documentResult.segmentsWithIssues} of {documentResult.totalSegments} segments
                </span>
                <span className="font-medium text-danger">
                  {documentResult.totalIssues} issues
                </span>
              </div>
              {/* Issue breakdown by severity */}
              <div className="flex items-center gap-2 mt-1.5">
                {documentResult.issuesBySeverity.error > 0 && (
                  <span className="px-1.5 py-0.5 text-2xs bg-danger-bg text-danger">
                    {documentResult.issuesBySeverity.error} errors
                  </span>
                )}
                {documentResult.issuesBySeverity.warning > 0 && (
                  <span className="px-1.5 py-0.5 text-2xs bg-warning-bg text-warning">
                    {documentResult.issuesBySeverity.warning} warnings
                  </span>
                )}
                {documentResult.issuesBySeverity.info > 0 && (
                  <span className="px-1.5 py-0.5 text-2xs bg-surface-panel text-text-secondary">
                    {documentResult.issuesBySeverity.info} info
                  </span>
                )}
              </div>
            </div>

            {/* Current segment issues */}
            {segmentId && currentSegmentIssues.length > 0 && (
              <div className="px-2 py-2">
                <p className="text-2xs font-medium text-text-secondary mb-1.5">Current segment:</p>
                <div className="space-y-1">
                  {currentSegmentIssues.map((issue, idx) => (
                    <QAIssueItem key={idx} issue={issue} />
                  ))}
                </div>
              </div>
            )}

            {/* Toggle all issues */}
            <div className="px-2 py-1.5">
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full text-left text-xs text-accent hover:text-accent-hover"
              >
                {showAll ? 'Hide all issues' : `Show all ${documentResult.totalIssues} issues`}
              </button>
            </div>

            {/* All issues */}
            {showAll && (
              <div className="max-h-48 overflow-y-auto">
                {documentResult.results
                  .filter(r => !r.passed)
                  .map((result) => (
                    <button
                      key={result.segmentId}
                      onClick={() => onSegmentClick?.(result.segmentId)}
                      className={`w-full text-left px-2 py-1.5 hover:bg-surface-hover ${
                        result.segmentId === segmentId ? 'bg-accent/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-2xs text-text-muted">
                          Segment {result.segmentIndex + 1}
                        </span>
                        <span className="text-2xs text-danger">
                          {result.issues.length} issues
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {result.issues.slice(0, 2).map((issue, idx) => (
                          <QAIssueItem key={idx} issue={issue} compact />
                        ))}
                        {result.issues.length > 2 && (
                          <p className="text-2xs text-text-muted">
                            +{result.issues.length - 2} more
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QAIssueItem({ issue, compact = false }: { issue: QACheckResult['issues'][0]; compact?: boolean }) {
  return (
    <div className={`flex items-start gap-1.5 ${compact ? '' : 'p-1.5 ' + getQASeverityBgColor(issue.severity)}`}>
      <span className={`flex-shrink-0 ${compact ? 'text-2xs' : 'text-xs'} ${getQASeverityColor(issue.severity)}`}>
        {issue.severity === 'error' ? '●' : issue.severity === 'warning' ? '▲' : '○'}
      </span>
      <div className="min-w-0">
        <p className={`${compact ? 'text-2xs' : 'text-xs'} text-text`}>
          {issue.message}
        </p>
        {!compact && issue.details && (
          <p className="text-2xs text-text-muted mt-0.5">
            {issue.details.expected && `Expected: ${issue.details.expected}`}
            {issue.details.found && ` Found: ${issue.details.found}`}
          </p>
        )}
      </div>
    </div>
  );
}
