export const ORG_ROLES = ['admin', 'project_manager', 'translator', 'reviewer'] as const;

export const PROJECT_ROLES = ['project_manager', 'translator', 'reviewer_1', 'reviewer_2'] as const;

export const DOCUMENT_ROLES = ['translator', 'reviewer_1', 'reviewer_2'] as const;

export const WORKFLOW_TYPES = ['simple', 'single_review', 'full_review'] as const;

export const WORKFLOW_STATUSES = ['translation', 'review_1', 'review_2', 'complete'] as const;

export const SEGMENT_STATUSES = [
  'untranslated',
  'draft',
  'translated',
  'reviewed_1',
  'reviewed_2',
  'locked',
] as const;

export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;

export const SUPPORTED_FILE_TYPES = ['txt', 'xliff', 'xlf', 'json', 'html', 'tmx'] as const;

export const MIN_FUZZY_MATCH_PERCENT = 70;
export const MAX_TM_RESULTS = 10;
export const DEFAULT_PAGE_SIZE = 50;
