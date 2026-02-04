/**
 * Document Analytics Badge Component
 * Compact display of document statistics
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';

interface DocumentAnalyticsBadgeProps {
  documentId: string;
}

export function DocumentAnalyticsBadge({ documentId }: DocumentAnalyticsBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['document-analytics', documentId],
    queryFn: () => analyticsApi.getDocumentAnalytics(documentId),
    refetchInterval: 60000, // Refetch every minute
  });

  if (isLoading || !analytics) {
    return null;
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-panel hover:bg-surface-hover rounded text-sm text-text-secondary hover:text-text transition-colors"
        title="View document analytics"
      >
        <span>📊</span>
        <span>{analytics.completionPercentage}% complete</span>
        <span className="text-xs">•</span>
        <span>{analytics.commentCount} comments</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg shadow-xl max-w-2xl w-full">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text">Document Analytics</h3>
            <p className="text-sm text-text-secondary mt-1">{analytics.documentName}</p>
          </div>
          <button
            onClick={() => setIsExpanded(false)}
            className="text-text-secondary hover:text-text p-2 rounded hover:bg-surface-hover"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">Completion</span>
              <span className="text-lg font-bold text-text">{analytics.completionPercentage}%</span>
            </div>
            <div className="h-2 bg-surface-panel rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${analytics.completionPercentage}%` }}
              ></div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Total Segments" value={analytics.totalSegments} />
            <MetricCard label="Source Words" value={analytics.sourceWords} />
            <MetricCard label="Target Words" value={analytics.targetWords} />
            <MetricCard label="Comments" value={analytics.commentCount} />
          </div>

          {/* Translation Metrics */}
          <div className="bg-surface-panel rounded-lg p-4">
            <h4 className="font-medium text-text mb-3">Translation Metrics</h4>
            <div className="space-y-2">
              {analytics.averageMatchPercentage > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Avg. TM Match</span>
                  <span className="font-medium text-text">{analytics.averageMatchPercentage.toFixed(1)}%</span>
                </div>
              )}
              {analytics.mtUsageCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">MT Translations</span>
                  <span className="font-medium text-text">{analytics.mtUsageCount}</span>
                </div>
              )}
              {analytics.qaIssueCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">QA Issues</span>
                  <span className="font-medium text-warning">{analytics.qaIssueCount}</span>
                </div>
              )}
              {analytics.timeSpent !== null && analytics.timeSpent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Time Spent</span>
                  <span className="font-medium text-text">{formatTime(analytics.timeSpent)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Contributors */}
          {analytics.contributors.length > 0 && (
            <div>
              <h4 className="font-medium text-text mb-3">Contributors</h4>
              <div className="space-y-2">
                {analytics.contributors.map((contributor) => (
                  <div
                    key={contributor.userId}
                    className="flex items-center justify-between py-2 px-3 bg-surface-panel rounded"
                  >
                    <div>
                      <p className="text-sm font-medium text-text">{contributor.userName}</p>
                      <p className="text-xs text-text-secondary">{contributor.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-text">
                        {contributor.segmentsContributed}
                      </p>
                      <p className="text-xs text-text-secondary">segments</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end">
          <button
            onClick={() => setIsExpanded(false)}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text rounded hover:bg-surface-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-panel rounded p-3">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className="text-xl font-bold text-text">{value.toLocaleString()}</p>
    </div>
  );
}

function formatTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
