/**
 * Productivity Metrics Component
 * Shows user and team productivity statistics
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, type UserProductivity } from '../api';

interface ProductivityMetricsProps {
  projectId: string;
  userId?: string;
}

export function ProductivityMetrics({ projectId, userId }: ProductivityMetricsProps) {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');

  const { startDate, endDate } = getDateRange(dateRange);

  const { data: productivity, isLoading, error } = useQuery<UserProductivity | UserProductivity[]>({
    queryKey: userId
      ? ['user-productivity', projectId, userId, dateRange]
      : ['team-productivity', projectId, dateRange],
    queryFn: () =>
      userId
        ? analyticsApi.getUserProductivity(projectId, userId, startDate, endDate)
        : analyticsApi.getTeamProductivity(projectId),
  });

  if (isLoading) {
    return (
      <div className="p-3">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-surface-panel w-1/3"></div>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 bg-surface-panel"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
        Failed to load productivity metrics
      </div>
    );
  }

  const isTeamView = Array.isArray(productivity);
  const users = isTeamView ? productivity : productivity ? [productivity] : [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-surface-panel border-b border-border">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          {isTeamView ? 'Team Productivity' : 'Productivity'}
        </h3>
        <div className="flex gap-px">
          {(['7d', '30d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-2 py-0.5 text-2xs ${
                dateRange === range
                  ? 'bg-accent text-text-inverse'
                  : 'text-text-secondary hover:text-text hover:bg-surface-hover'
              }`}
            >
              {range === '7d' ? '7d' : range === '30d' ? '30d' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* User Cards */}
      <div className="space-y-2 px-2">
        {users.map((user) => (
          <ProductivityCard key={user.userId} user={user} />
        ))}

        {isTeamView && users.length === 0 && (
          <div className="text-center py-4 text-xs text-text-muted">
            No team members found
          </div>
        )}
      </div>
    </div>
  );
}

// Format role for display (capitalize, replace underscores)
function formatRole(role: string): string {
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ProductivityCard({ user }: { user: UserProductivity }) {
  const { statistics, productivity } = user;
  const totalContributions = statistics.segmentsTranslated + statistics.segmentsReviewed;

  const lastActivity = statistics.lastActivity
    ? new Date(statistics.lastActivity)
    : null;

  return (
    <div className="bg-surface-panel border border-border p-2">
      {/* User Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-xs font-medium text-text">{user.userName}</span>
          <span className="ml-2 px-1 py-0.5 text-2xs bg-surface text-text-muted">
            {formatRole(user.role)}
          </span>
        </div>
        {lastActivity && (
          <span className="text-2xs text-text-muted">
            {lastActivity.toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <StatBox label="Words" value={statistics.wordsTranslated} />
        <StatBox label="Segments" value={statistics.segmentsTranslated} />
        <StatBox label="Reviewed" value={statistics.segmentsReviewed} />
        <StatBox label="Comments" value={statistics.commentsAdded} />
      </div>

      {/* Productivity Row */}
      <div className="flex items-center gap-4 pt-2 border-t border-border-light text-2xs">
        <span className="text-text-muted">
          <span className="font-medium text-text">{productivity.wordsPerDay}</span> words/day
        </span>
        <span className="text-text-muted">
          <span className="font-medium text-text">{productivity.segmentsPerDay}</span> seg/day
        </span>
        <span className="text-text-muted">
          <span className="font-medium text-text">{productivity.activeDays}</span> active days
        </span>
      </div>

      {totalContributions === 0 && (
        <div className="mt-2 text-center text-2xs text-text-muted italic">
          No contributions yet
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-sm font-medium text-text">{value.toLocaleString()}</div>
      <div className="text-2xs text-text-muted">{label}</div>
    </div>
  );
}

function getDateRange(range: '7d' | '30d' | 'all'): { startDate?: string; endDate?: string } {
  const now = new Date();
  const endDate = now.toISOString();

  if (range === 'all') {
    return {};
  }

  const days = range === '7d' ? 7 : 30;
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);

  return {
    startDate: startDate.toISOString(),
    endDate,
  };
}
