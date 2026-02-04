/**
 * Productivity Metrics Component
 * Shows user and team productivity statistics
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, type UserProductivity } from '../api';

interface ProductivityMetricsProps {
  projectId: string;
  userId?: string; // If provided, show single user; otherwise show team
}

export function ProductivityMetrics({ projectId, userId }: ProductivityMetricsProps) {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');

  // Calculate date range
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
      <div className="bg-surface rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-surface-panel rounded w-1/3"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-surface-panel rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger-bg border border-danger text-danger rounded-lg p-4">
        <p className="font-medium">Failed to load productivity metrics</p>
        <p className="text-sm mt-1">{(error as Error)?.message}</p>
      </div>
    );
  }

  const isTeamView = Array.isArray(productivity);
  const users = isTeamView ? productivity : [productivity];

  return (
    <div className="space-y-6">
      {/* Header with Date Range Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text">
          {isTeamView ? 'Team Productivity' : 'Productivity Metrics'}
        </h3>

        <div className="flex gap-2">
          <button
            onClick={() => setDateRange('7d')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              dateRange === '7d'
                ? 'bg-primary text-white'
                : 'bg-surface-panel text-text-secondary hover:text-text'
            }`}
          >
            Last 7 days
          </button>
          <button
            onClick={() => setDateRange('30d')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              dateRange === '30d'
                ? 'bg-primary text-white'
                : 'bg-surface-panel text-text-secondary hover:text-text'
            }`}
          >
            Last 30 days
          </button>
          <button
            onClick={() => setDateRange('all')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              dateRange === 'all'
                ? 'bg-primary text-white'
                : 'bg-surface-panel text-text-secondary hover:text-text'
            }`}
          >
            All time
          </button>
        </div>
      </div>

      {/* Productivity Cards */}
      <div className="space-y-4">
        {users.map((user) => (
          <ProductivityCard key={user.userId} user={user} />
        ))}
      </div>

      {isTeamView && users.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          <p>No team members found for this project</p>
        </div>
      )}
    </div>
  );
}

function ProductivityCard({ user }: { user: UserProductivity }) {
  const { statistics, productivity } = user;

  const totalContributions =
    statistics.segmentsTranslated + statistics.segmentsReviewed;

  const lastActivity = statistics.lastActivity
    ? new Date(statistics.lastActivity)
    : null;

  return (
    <div className="bg-surface-panel rounded-lg p-6">
      {/* User Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-semibold text-text">{user.userName}</h4>
          <p className="text-sm text-text-secondary">{user.userEmail}</p>
          <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded bg-surface text-text-secondary">
            {user.role}
          </span>
        </div>

        {lastActivity && (
          <div className="text-right">
            <p className="text-xs text-text-secondary">Last active</p>
            <p className="text-sm text-text">{lastActivity.toLocaleDateString()}</p>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatBox
          label="Words Translated"
          value={statistics.wordsTranslated}
          icon="✍️"
        />
        <StatBox
          label="Segments Translated"
          value={statistics.segmentsTranslated}
          icon="📝"
        />
        <StatBox
          label="Segments Reviewed"
          value={statistics.segmentsReviewed}
          icon="✅"
        />
        <StatBox
          label="Comments Added"
          value={statistics.commentsAdded}
          icon="💬"
        />
      </div>

      {/* Productivity Metrics */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
        <ProductivityStat
          label="Words/Day"
          value={productivity.wordsPerDay}
        />
        <ProductivityStat
          label="Segments/Day"
          value={productivity.segmentsPerDay}
        />
        <ProductivityStat
          label="Active Days"
          value={productivity.activeDays}
        />
      </div>

      {statistics.mostActiveDay && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-text-secondary">
            Most productive day: <span className="text-text font-medium">{statistics.mostActiveDay}</span>
          </p>
        </div>
      )}

      {totalContributions === 0 && (
        <div className="mt-4 text-center text-sm text-text-secondary italic">
          No contributions yet
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-surface rounded p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-text-secondary">{label}</p>
        <span>{icon}</span>
      </div>
      <p className="text-xl font-bold text-text">{value.toLocaleString()}</p>
    </div>
  );
}

function ProductivityStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-primary">{value.toLocaleString()}</p>
      <p className="text-xs text-text-secondary">{label}</p>
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
