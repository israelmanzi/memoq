import type { ActivityLogEntry } from '@oxy/shared';

interface ActivityFeedProps {
  activities: ActivityLogEntry[];
  isLoading?: boolean;
  showEntityName?: boolean;
}

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString();
}

function getActionIcon(action: string): string {
  switch (action) {
    case 'create':
      return '+';
    case 'upload':
      return '↑';
    case 'translate':
      return '✎';
    case 'review':
      return '✓';
    case 'confirm':
      return '✓✓';
    case 'delete':
      return '×';
    case 'update':
      return '↻';
    case 'export':
      return '↓';
    case 'add_member':
      return '👤+';
    case 'remove_member':
      return '👤-';
    case 'add_resource':
      return '📎';
    case 'remove_resource':
      return '📎-';
    default:
      return '•';
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case 'create':
    case 'upload':
      return 'bg-success-bg text-success';
    case 'translate':
      return 'bg-accent/10 text-accent';
    case 'review':
    case 'confirm':
      return 'bg-accent/10 text-accent-muted';
    case 'delete':
      return 'bg-danger-bg text-danger';
    case 'update':
      return 'bg-warning-bg text-warning';
    case 'export':
      return 'bg-surface-panel text-text-secondary';
    default:
      return 'bg-surface-panel text-text-muted';
  }
}

function formatEntityType(entityType: string): string {
  switch (entityType) {
    case 'tm':
      return 'TM';
    case 'tb':
      return 'Term Base';
    case 'tm_unit':
      return 'TM entry';
    case 'tb_term':
      return 'term';
    default:
      return entityType;
  }
}

function formatActionText(activity: ActivityLogEntry, showEntityName: boolean): string {
  const { action, entityType, entityName, metadata } = activity;
  const formattedType = formatEntityType(entityType);
  const name = showEntityName && entityName ? ` "${entityName}"` : '';

  switch (action) {
    case 'create':
      return `created ${formattedType}${name}`;
    case 'upload':
      if (entityType === 'tm' || entityType === 'tb') {
        const count = (metadata as Record<string, unknown>)?.importedCount;
        return `imported ${count || ''} entries to ${formattedType}${name}`;
      }
      return `uploaded${name}`;
    case 'translate':
      return `translated a segment`;
    case 'review':
      return `reviewed a segment`;
    case 'confirm':
      return `confirmed a segment`;
    case 'delete':
      return `deleted ${formattedType}${name}`;
    case 'update':
      return `updated ${formattedType}${name}`;
    case 'add_member':
      return `added a member to project`;
    case 'remove_member':
      return `removed a member from project`;
    case 'add_resource':
      const resType = (metadata as Record<string, unknown>)?.resourceType;
      return `attached ${resType === 'tm' ? 'TM' : resType === 'tb' ? 'Term Base' : 'resource'} to project`;
    case 'remove_resource':
      return `removed a resource from project`;
    case 'status_change':
      return `changed status`;
    case 'export':
      return `exported ${formattedType}${name}`;
    default:
      return `${action} ${formattedType}`;
  }
}

export function ActivityFeed({ activities, isLoading, showEntityName = true }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex items-start gap-2">
            <div className="w-6 h-6 bg-surface-panel rounded-full" />
            <div className="flex-1">
              <div className="h-3 bg-surface-panel rounded w-3/4 mb-1" />
              <div className="h-2 bg-surface-panel rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-xs text-text-muted text-center py-4">No activity yet</p>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-start gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-medium flex-shrink-0 ${getActionColor(activity.action)}`}
            title={activity.action}
          >
            {getActionIcon(activity.action)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text">
              <span className="font-medium">{activity.userName || 'Unknown'}</span>{' '}
              {formatActionText(activity, showEntityName)}
            </p>
            <p className="text-2xs text-text-muted">
              {formatRelativeTime(activity.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
