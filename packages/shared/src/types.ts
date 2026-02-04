import type {
  ORG_ROLES,
  PROJECT_ROLES,
  DOCUMENT_ROLES,
  WORKFLOW_TYPES,
  WORKFLOW_STATUSES,
  SEGMENT_STATUSES,
  PROJECT_STATUSES,
  SUPPORTED_FILE_TYPES,
} from './constants.js';

// Role types
export type OrgRole = (typeof ORG_ROLES)[number];
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

// Status types
export type WorkflowType = (typeof WORKFLOW_TYPES)[number];
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type FileType = (typeof SUPPORTED_FILE_TYPES)[number];

// Entity types
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMembership {
  id: string;
  userId: string;
  orgId: string;
  role: OrgRole;
  createdAt: Date;
}

export interface TranslationMemory {
  id: string;
  orgId: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TranslationUnit {
  id: string;
  tmId: string;
  sourceText: string;
  targetText: string;
  sourceHash: string;
  contextPrev: string | null;
  contextNext: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface TermBase {
  id: string;
  orgId: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface Term {
  id: string;
  tbId: string;
  sourceTerm: string;
  targetTerm: string;
  definition: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  workflowType: WorkflowType;
  status: ProjectStatus;
  deadline: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: string;
  projectId: string;
  name: string;
  fileType: FileType;
  originalContent: string | null;
  // Binary file support
  fileStorageKey: string | null;
  structureMetadata: unknown | null;
  pageCount: number | null;
  isBinaryFormat: boolean;
  workflowStatus: WorkflowStatus;
  // Word counts
  sourceWordCount: number;
  targetWordCount: number;
  // Deadline
  deadline: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentAssignment {
  id: string;
  documentId: string;
  userId: string;
  role: DocumentRole;
  assignedAt: Date;
  assignedBy: string | null;
}

export interface DocumentAssignmentWithUser extends DocumentAssignment {
  user: {
    id: string;
    name: string;
    email: string;
  };
  assignedByUser?: {
    id: string;
    name: string;
  } | null;
}

export interface Segment {
  id: string;
  documentId: string;
  segmentIndex: number;
  sourceText: string;
  targetText: string | null;
  status: SegmentStatus;
  lockedBy: string | null;
  lastModifiedBy: string | null;
  translatedBy: string | null;
  translatedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Optional user names (populated when fetching single segment)
  translatedByName?: string | null;
  reviewedByName?: string | null;
  lastModifiedByName?: string | null;
}

// API types
export interface TMMatch {
  id: string;
  sourceText: string;
  targetText: string;
  matchPercent: number;
  isContextMatch: boolean;
}

export interface TermMatch {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  position: { start: number; end: number };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Activity log types
export interface ActivityLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  action: string;
  userId: string;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// Auth types
export interface AuthUser extends User {
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: OrgRole;
  }>;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

// Document assignment filter types
export type DocumentAssignmentFilter =
  | 'all'
  | 'awaiting_action'
  | 'assigned_to_me'
  | 'assigned_as_translator'
  | 'assigned_as_reviewer_1'
  | 'assigned_as_reviewer_2'
  | 'unassigned';

// Document with assignment info for list views
export interface DocumentAssignmentInfo {
  translator: { userId: string; userName: string } | null;
  reviewer_1: { userId: string; userName: string } | null;
  reviewer_2: { userId: string; userName: string } | null;
}

export interface DocumentWithAssignments extends Document {
  assignments: DocumentAssignmentInfo;
  // Computed fields for the current user
  isAssignedToMe: boolean;
  myRole: DocumentRole | null;
  isAwaitingMyAction: boolean;
}
