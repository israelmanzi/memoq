/**
 * Project Statistics Dashboard Component
 * Shows comprehensive project metrics and progress
 */

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';

interface ProjectStatsDashboardProps {
  projectId: string;
}

export function ProjectStatsDashboard({ projectId }: ProjectStatsDashboardProps) {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['project-statistics', projectId],
    queryFn: () => analyticsApi.getProjectStatistics(projectId),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="p-3">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-surface-panel w-1/3"></div>
          <div className="grid grid-cols-4 gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-surface-panel"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
        Failed to load project statistics
      </div>
    );
  }

  const deadline = stats.timeline.deadline ? new Date(stats.timeline.deadline) : null;
  const createdAt = new Date(stats.timeline.createdAt);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="px-3 py-2 bg-surface-panel border-b border-border">
        <h2 className="text-sm font-medium text-text">{stats.projectName}</h2>
        <p className="text-2xs text-text-muted">
          {stats.sourceLanguage.toUpperCase()} → {stats.targetLanguage.toUpperCase()}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-2 px-3">
        <MetricCard label="Documents" value={stats.totalDocuments} />
        <MetricCard label="Segments" value={stats.totalSegments} />
        <MetricCard label="Source Words" value={stats.totalSourceWords} />
        <MetricCard label="Target Words" value={stats.totalTargetWords} />
      </div>

      {/* Progress Overview */}
      <div className="px-3">
        <div className="bg-surface-panel border border-border p-3">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
            Progress
          </div>
          <div className="space-y-2">
            <ProgressBar label="Translation" percentage={stats.progressPercentage.translation} color="bg-accent" />
            <ProgressBar label="Review 1" percentage={stats.progressPercentage.review1} color="bg-warning" />
            <ProgressBar label="Review 2" percentage={stats.progressPercentage.review2} color="bg-accent-muted" />
            <ProgressBar label="Complete" percentage={stats.progressPercentage.complete} color="bg-success" />
          </div>
        </div>
      </div>

      {/* Segments by Status */}
      <div className="px-3">
        <div className="bg-surface-panel border border-border p-3">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
            Segments by Status
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatusCard label="Untranslated" value={stats.segmentsByStatus.untranslated} />
            <StatusCard label="Draft" value={stats.segmentsByStatus.draft} />
            <StatusCard label="Translated" value={stats.segmentsByStatus.translated} color="text-accent" />
            <StatusCard label="Reviewed L1" value={stats.segmentsByStatus.reviewed1} color="text-warning" />
            <StatusCard label="Reviewed L2" value={stats.segmentsByStatus.reviewed2} color="text-accent-muted" />
            <StatusCard label="Locked" value={stats.segmentsByStatus.locked} color="text-success" />
          </div>
        </div>
      </div>

      {/* Quality & Timeline */}
      <div className="grid grid-cols-2 gap-3 px-3">
        {/* Quality Metrics */}
        <div className="bg-surface-panel border border-border p-3">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
            Quality
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Comments</span>
              <span className="text-text">{stats.qualityMetrics.totalComments}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Unresolved</span>
              <span className={stats.qualityMetrics.unresolvedComments > 0 ? 'text-warning' : 'text-text'}>
                {stats.qualityMetrics.unresolvedComments}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">QA Issues</span>
              <span className="text-text">{stats.qualityMetrics.totalQAIssues || 0}</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-surface-panel border border-border p-3">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
            Timeline
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Created</span>
              <span className="text-text">{createdAt.toLocaleDateString()}</span>
            </div>
            {deadline && (
              <>
                <div className="flex justify-between">
                  <span className="text-text-muted">Deadline</span>
                  <span className={stats.timeline.isOverdue ? 'text-danger' : 'text-text'}>
                    {deadline.toLocaleDateString()}
                  </span>
                </div>
                {stats.timeline.daysRemaining !== null && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Status</span>
                    <span className={
                      stats.timeline.isOverdue ? 'text-danger' :
                      stats.timeline.daysRemaining < 7 ? 'text-warning' : 'text-success'
                    }>
                      {stats.timeline.isOverdue
                        ? `${Math.abs(stats.timeline.daysRemaining)}d overdue`
                        : stats.timeline.daysRemaining === 0
                        ? 'Due today'
                        : `${stats.timeline.daysRemaining}d left`
                      }
                    </span>
                  </div>
                )}
              </>
            )}
            {!deadline && (
              <div className="text-text-muted italic">No deadline set</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-panel border border-border p-2 text-center">
      <div className="text-sm font-medium text-text">{value.toLocaleString()}</div>
      <div className="text-2xs text-text-muted">{label}</div>
    </div>
  );
}

function ProgressBar({ label, percentage, color }: { label: string; percentage: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="text-text">{percentage}%</span>
      </div>
      <div className="h-1 bg-surface overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center py-1.5 bg-surface">
      <div className={`text-sm font-medium ${color || 'text-text-secondary'}`}>{value.toLocaleString()}</div>
      <div className="text-2xs text-text-muted">{label}</div>
    </div>
  );
}
