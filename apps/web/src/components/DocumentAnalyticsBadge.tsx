/**
 * Document Analytics Badge Component
 * Compact display of document statistics with translation assist breakdown
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';

// Format role for display (capitalize, replace underscores)
function formatRole(role: string): string {
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface DocumentAnalyticsBadgeProps {
  documentId: string;
}

export function DocumentAnalyticsBadge({ documentId }: DocumentAnalyticsBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['document-analytics', documentId],
    queryFn: () => analyticsApi.getDocumentAnalytics(documentId),
    refetchInterval: 60000,
  });

  if (isLoading || !analytics) {
    return null;
  }

  // Calculate assisted count (TM + AI)
  const tmCount = analytics.tmMatchCount ?? 0;
  const aiCount = analytics.aiTranslationCount ?? analytics.mtUsageCount ?? 0;
  const assistedCount = tmCount + aiCount;

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text hover:bg-surface-hover"
        title="View document analytics"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span>{analytics.completionPercentage}%</span>
        {assistedCount > 0 && (
          <>
            <span className="text-border">|</span>
            <span className="text-accent">{assistedCount} assisted</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-surface-panel border-b border-border">
          <div>
            <h3 className="text-sm font-medium text-text">Document Analytics</h3>
            <p className="text-2xs text-text-muted truncate">{analytics.documentName}</p>
          </div>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 text-text-muted hover:text-text hover:bg-surface-hover"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-3 space-y-4">
          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="text-text-muted">Completion</span>
              <span className="font-medium text-text">{analytics.completionPercentage}%</span>
            </div>
            <div className="h-1.5 bg-surface-panel overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${analytics.completionPercentage}%` }}
              ></div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Total Segments" value={analytics.totalSegments} />
            <MetricCard label="Source Words" value={analytics.sourceWords} />
            <MetricCard label="Target Words" value={analytics.targetWords} />
            <MetricCard label="Comments" value={analytics.commentCount} />
          </div>

          {/* Translation Assist - Prominent Section */}
          <div className="bg-accent/5 border border-accent/20 p-3">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs font-medium text-accent uppercase tracking-wide">
                Translation Assist
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* TM Matches */}
              <div className="text-center p-2 bg-surface-panel border border-border">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <svg className="w-3.5 h-3.5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  <span className="text-2xs text-text-muted">TM Matches</span>
                </div>
                <div className="text-lg font-semibold text-text">{tmCount}</div>
                {analytics.averageMatchPercentage > 0 && (
                  <div className="text-2xs text-success">
                    avg {analytics.averageMatchPercentage.toFixed(0)}% match
                  </div>
                )}
              </div>

              {/* AI Translate */}
              <div className="text-center p-2 bg-surface-panel border border-border">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <svg className="w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 24 24">
                    {/* Sparkles icon - multiple 4-pointed stars */}
                    <path d="M9.5 2l1.5 3.5L14.5 7l-3.5 1.5L9.5 12l-1.5-3.5L4.5 7l3.5-1.5L9.5 2z" />
                    <path d="M19 8l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L15.5 11.5l2.5-1L19 8z" opacity="0.7" />
                    <path d="M14.5 16l.75 1.875 1.875.75-1.875.75-.75 1.875-.75-1.875L12 18.625l1.875-.75.625-1.875z" opacity="0.5" />
                  </svg>
                  <span className="text-2xs text-text-muted">AI Translate</span>
                </div>
                <div className="text-lg font-semibold text-text">{aiCount}</div>
                {aiCount > 0 && (
                  <div className="text-2xs text-accent">powered by AI</div>
                )}
              </div>
            </div>

            {assistedCount > 0 && (
              <div className="mt-2 pt-2 border-t border-border-light text-center">
                <span className="text-xs text-text-secondary">
                  <span className="font-medium text-accent">{assistedCount}</span> of {analytics.totalSegments} segments assisted
                  <span className="text-success ml-1">
                    ({((assistedCount / analytics.totalSegments) * 100).toFixed(0)}% efficiency)
                  </span>
                </span>
              </div>
            )}

            {assistedCount === 0 && (
              <div className="mt-2 pt-2 border-t border-border-light text-center text-xs text-text-muted">
                No TM matches or AI translations yet
              </div>
            )}
          </div>

          {/* Quality Metrics */}
          {(analytics.qaIssueCount > 0 || analytics.timeSpent) && (
            <div className="bg-surface-panel p-2 border border-border">
              <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                Quality
              </div>
              <div className="space-y-1">
                {analytics.qaIssueCount > 0 && (
                  <MetricRow label="QA Issues" value={analytics.qaIssueCount} color="text-warning" />
                )}
                {analytics.timeSpent !== null && analytics.timeSpent > 0 && (
                  <MetricRow label="Time Spent" value={formatTime(analytics.timeSpent)} />
                )}
              </div>
            </div>
          )}

          {/* Contributors */}
          {analytics.contributors.length > 0 && (
            <div>
              <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                Contributors
              </div>
              <div className="space-y-1">
                {analytics.contributors.map((contributor) => (
                  <div
                    key={contributor.userId}
                    className="flex items-center justify-between py-1.5 px-2 bg-surface-panel border border-border"
                  >
                    <div>
                      <span className="text-xs text-text">{contributor.userName}</span>
                      <span className="ml-1.5 text-2xs text-text-muted">{formatRole(contributor.role)}</span>
                    </div>
                    <span className="text-xs text-text-secondary">
                      {contributor.segmentsContributed} seg
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-3 py-2 border-t border-border bg-surface-panel">
          <button
            onClick={() => setIsExpanded(false)}
            className="px-3 py-1.5 text-xs text-text-secondary hover:text-text hover:bg-surface-hover"
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
    <div className="bg-surface-panel p-2 border border-border">
      <div className="text-2xs text-text-muted">{label}</div>
      <div className="text-sm font-medium text-text">{value.toLocaleString()}</div>
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className={`font-medium ${color || 'text-text'}`}>{value}</span>
    </div>
  );
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
