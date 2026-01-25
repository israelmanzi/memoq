// Label formatting utilities for enterprise-standard display

// Project Status
const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export function formatProjectStatus(status: string): string {
  return PROJECT_STATUS_LABELS[status] || status;
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
  return WORKFLOW_STATUS_LABELS[status] || status;
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
  return SEGMENT_STATUS_LABELS[status] || status;
}

// Workflow Type
const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  simple: 'Simple',
  single_review: 'Single Review',
  full_review: 'Full Review',
};

export function formatWorkflowType(type: string): string {
  return WORKFLOW_TYPE_LABELS[type] || type;
}

// Organization Roles
const ORG_ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export function formatOrgRole(role: string): string {
  return ORG_ROLE_LABELS[role] || role;
}

// Project Roles
const PROJECT_ROLE_LABELS: Record<string, string> = {
  project_manager: 'Project Manager',
  translator: 'Translator',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
};

export function formatProjectRole(role: string): string {
  return PROJECT_ROLE_LABELS[role] || role;
}

// Generic formatter for unknown enum values (converts snake_case to Title Case)
export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
