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
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="bg-surface rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-surface-panel rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-surface-panel rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-danger-bg border border-danger text-danger rounded-lg p-4">
        <p className="font-medium">Failed to load project statistics</p>
        <p className="text-sm mt-1">{(error as Error)?.message}</p>
      </div>
    );
  }

  const deadline = stats.timeline.deadline ? new Date(stats.timeline.deadline) : null;
  const createdAt = new Date(stats.timeline.createdAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-text">{stats.projectName}</h2>
        <p className="text-sm text-text-secondary mt-1">
          {stats.sourceLanguage.toUpperCase()} → {stats.targetLanguage.toUpperCase()}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Documents"
          value={stats.totalDocuments}
          icon="📄"
        />
        <MetricCard
          label="Segments"
          value={stats.totalSegments}
          icon="📝"
        />
        <MetricCard
          label="Source Words"
          value={stats.totalSourceWords}
          icon="🔤"
        />
        <MetricCard
          label="Target Words"
          value={stats.totalTargetWords}
          icon="✍️"
        />
      </div>

      {/* Progress Overview */}
      <div className="bg-surface-panel rounded-lg p-6">
        <h3 className="font-semibold text-text mb-4">Project Progress</h3>

        <div className="space-y-4">
          <ProgressBar
            label="Translation"
            percentage={stats.progressPercentage.translation}
            color="bg-blue-500"
          />
          <ProgressBar
            label="Review 1"
            percentage={stats.progressPercentage.review1}
            color="bg-yellow-500"
          />
          <ProgressBar
            label="Review 2"
            percentage={stats.progressPercentage.review2}
            color="bg-orange-500"
          />
          <ProgressBar
            label="Complete"
            percentage={stats.progressPercentage.complete}
            color="bg-green-500"
          />
        </div>
      </div>

      {/* Segments by Status */}
      <div className="bg-surface-panel rounded-lg p-6">
        <h3 className="font-semibold text-text mb-4">Segments by Status</h3>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatusCard label="Untranslated" value={stats.segmentsByStatus.untranslated} color="text-text-secondary" />
          <StatusCard label="Draft" value={stats.segmentsByStatus.draft} color="text-text-secondary" />
          <StatusCard label="Translated" value={stats.segmentsByStatus.translated} color="text-blue-500" />
          <StatusCard label="Reviewed (L1)" value={stats.segmentsByStatus.reviewed1} color="text-yellow-500" />
          <StatusCard label="Reviewed (L2)" value={stats.segmentsByStatus.reviewed2} color="text-orange-500" />
          <StatusCard label="Locked" value={stats.segmentsByStatus.locked} color="text-green-500" />
        </div>
      </div>

      {/* Quality & Timeline */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quality Metrics */}
        <div className="bg-surface-panel rounded-lg p-6">
          <h3 className="font-semibold text-text mb-4">Quality Metrics</h3>

          <div className="space-y-3">
            <QualityMetric
              label="Total Comments"
              value={stats.qualityMetrics.totalComments}
              sublabel={`${stats.qualityMetrics.unresolvedComments} unresolved`}
            />
            {/* QA Issues - coming soon */}
            <QualityMetric
              label="QA Issues"
              value={stats.qualityMetrics.totalQAIssues || 0}
              sublabel="Run QA checks on documents"
              muted={stats.qualityMetrics.totalQAIssues === 0}
            />
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-surface-panel rounded-lg p-6">
          <h3 className="font-semibold text-text mb-4">Timeline</h3>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-text-secondary">Created</p>
              <p className="text-text font-medium">{createdAt.toLocaleDateString()}</p>
            </div>

            {deadline && (
              <>
                <div>
                  <p className="text-sm text-text-secondary">Deadline</p>
                  <p className={`text-text font-medium ${stats.timeline.isOverdue ? 'text-danger' : ''}`}>
                    {deadline.toLocaleDateString()}
                  </p>
                </div>

                {stats.timeline.daysRemaining !== null && (
                  <div>
                    <p className="text-sm text-text-secondary">Status</p>
                    <p className={`font-medium ${stats.timeline.isOverdue ? 'text-danger' : stats.timeline.daysRemaining < 7 ? 'text-warning' : 'text-text'}`}>
                      {stats.timeline.isOverdue
                        ? `Overdue by ${Math.abs(stats.timeline.daysRemaining)} days`
                        : stats.timeline.daysRemaining === 0
                        ? 'Due today'
                        : `${stats.timeline.daysRemaining} days remaining`
                      }
                    </p>
                  </div>
                )}
              </>
            )}

            {!deadline && (
              <p className="text-sm text-text-secondary italic">No deadline set</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components

function MetricCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-surface-panel rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-text-secondary text-sm">{label}</p>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-text">{value.toLocaleString()}</p>
    </div>
  );
}

function ProgressBar({ label, percentage, color }: { label: string; percentage: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-text">{label}</span>
        <span className="text-sm font-medium text-text">{percentage}%</span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-3 rounded bg-surface">
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-text-secondary mt-1">{label}</p>
    </div>
  );
}

function QualityMetric({
  label,
  value,
  sublabel,
  muted = false
}: {
  label: string;
  value: number;
  sublabel?: string;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-text-secondary">{label}</p>
      <p className={`text-xl font-bold mt-1 ${muted ? 'text-text-secondary' : 'text-text'}`}>
        {value.toLocaleString()}
      </p>
      {sublabel && (
        <p className="text-xs text-text-secondary mt-0.5">{sublabel}</p>
      )}
    </div>
  );
}
