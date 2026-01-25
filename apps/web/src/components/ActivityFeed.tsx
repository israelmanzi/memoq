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
      return 'bg-green-100 text-green-700';
    case 'translate':
      return 'bg-blue-100 text-blue-700';
    case 'review':
    case 'confirm':
      return 'bg-purple-100 text-purple-700';
    case 'delete':
      return 'bg-red-100 text-red-700';
    case 'update':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-gray-100 text-gray-700';
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
    default:
      return `${action} ${formattedType}`;
  }
}

export function ActivityFeed({ activities, isLoading, showEntityName = true }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex items-start gap-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full" />
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-4">No activity yet</p>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-start gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${getActionColor(activity.action)}`}
          >
            {getActionIcon(activity.action)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">
              <span className="font-medium">{activity.userName || 'Unknown'}</span>{' '}
              {formatActionText(activity, showEntityName)}
            </p>
            <p className="text-xs text-gray-500">
              {formatRelativeTime(activity.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
