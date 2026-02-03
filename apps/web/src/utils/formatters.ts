// Label formatting utilities for enterprise-standard display

// Project Status
const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export function formatProjectStatus(status: string): string {
  return PROJECT_STATUS_LABELS[status] || formatEnumLabel(status);
}

// Workflow Status (Document level)
const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  translation: 'Translation',
  review_1: 'Review',
  review_2: 'Final Review',
  complete: 'Complete',
};

export function formatWorkflowStatus(status: string): string {
  return WORKFLOW_STATUS_LABELS[status] || formatEnumLabel(status);
}

// Segment Status
const SEGMENT_STATUS_LABELS: Record<string, string> = {
  untranslated: 'New',
  draft: 'Draft',
  translated: 'Translated',
  reviewed_1: 'Reviewed',
  reviewed_2: 'Final Review',
  locked: 'Locked',
};

export function formatSegmentStatus(status: string | null | undefined): string {
  if (!status) return 'New';
  return SEGMENT_STATUS_LABELS[status] || formatEnumLabel(status);
}

// Workflow Type
const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  simple: 'Simple',
  single_review: 'Single Review',
  full_review: 'Full Review',
};

export function formatWorkflowType(type: string): string {
  return WORKFLOW_TYPE_LABELS[type] || formatEnumLabel(type);
}

// Organization Roles
const ORG_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  translator: 'Translator',
  reviewer: 'Reviewer',
};

export function formatOrgRole(role: string): string {
  return ORG_ROLE_LABELS[role] || formatEnumLabel(role);
}

// Project Roles
const PROJECT_ROLE_LABELS: Record<string, string> = {
  project_manager: 'Project Manager',
  translator: 'Translator',
  reviewer_1: 'Reviewer 1',
  reviewer_2: 'Reviewer 2',
};

export function formatProjectRole(role: string): string {
  return PROJECT_ROLE_LABELS[role] || formatEnumLabel(role);
}

// Document Assignment Roles
const DOCUMENT_ROLE_LABELS: Record<string, string> = {
  translator: 'Translator',
  reviewer_1: 'Reviewer 1',
  reviewer_2: 'Reviewer 2',
};

export function formatDocumentRole(role: string): string {
  return DOCUMENT_ROLE_LABELS[role] || formatEnumLabel(role);
}

// Generic formatter for unknown enum values (converts snake_case to Title Case)
export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Relative Time Formatting
const RELATIVE_TIME_THRESHOLDS = [
  { limit: 60, unit: 'second', divisor: 1 },
  { limit: 3600, unit: 'minute', divisor: 60 },
  { limit: 86400, unit: 'hour', divisor: 3600 },
  { limit: 604800, unit: 'day', divisor: 86400 },
  { limit: 2592000, unit: 'week', divisor: 604800 },
  { limit: 31536000, unit: 'month', divisor: 2592000 },
  { limit: Infinity, unit: 'year', divisor: 31536000 },
] as const;

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago")
 * Falls back to absolute date for dates older than a week
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  // Future dates
  if (diffSeconds < 0) {
    return 'Just now';
  }

  // Just now (less than 10 seconds)
  if (diffSeconds < 10) {
    return 'Just now';
  }

  // Find appropriate unit
  for (const { limit, unit, divisor } of RELATIVE_TIME_THRESHOLDS) {
    if (diffSeconds < limit) {
      const value = Math.floor(diffSeconds / divisor);
      const plural = value !== 1 ? 's' : '';
      return `${value} ${unit}${plural} ago`;
    }
  }

  // Fallback (shouldn't reach here)
  return formatAbsoluteDateTime(d);
}

/**
 * Format a date as absolute date and time (e.g., "Jan 15, 2024 2:30 PM")
 */
export function formatAbsoluteDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a date as short date (e.g., "Jan 15")
 */
export function formatShortDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
