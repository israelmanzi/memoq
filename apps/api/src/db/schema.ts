import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============ Organizations ============
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(orgMemberships),
  translationMemories: many(translationMemories),
  termBases: many(termBases),
  projects: many(projects),
}));

// ============ Users ============
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  // Email verification
  emailVerified: boolean('email_verified').default(false).notNull(),
  emailVerificationToken: text('email_verification_token'),
  emailVerificationExpires: timestamp('email_verification_expires', { withTimezone: true }),
  // Password reset
  passwordResetToken: text('password_reset_token'),
  passwordResetExpires: timestamp('password_reset_expires', { withTimezone: true }),
  // MFA
  mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
  mfaSecret: text('mfa_secret'),
  mfaBackupCodes: jsonb('mfa_backup_codes').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(orgMemberships),
  projectMemberships: many(projectMembers),
}));

// ============ Organization Memberships ============
export const orgMemberships = pgTable(
  'org_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // admin, project_manager, translator, reviewer
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('org_memberships_user_org_idx').on(table.userId, table.orgId),
    index('idx_org_memberships_user').on(table.userId),
    index('idx_org_memberships_org').on(table.orgId),
  ]
);

export const orgMembershipsRelations = relations(orgMemberships, ({ one }) => ({
  user: one(users, {
    fields: [orgMemberships.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [orgMemberships.orgId],
    references: [organizations.id],
  }),
}));

// ============ Translation Memories ============
export const translationMemories = pgTable(
  'translation_memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sourceLanguage: text('source_language').notNull(),
    targetLanguage: text('target_language').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [index('idx_tm_org').on(table.orgId)]
);

export const translationMemoriesRelations = relations(translationMemories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [translationMemories.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [translationMemories.createdBy],
    references: [users.id],
  }),
  units: many(translationUnits),
}));

// ============ Translation Units ============
export const translationUnits = pgTable(
  'translation_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tmId: uuid('tm_id')
      .notNull()
      .references(() => translationMemories.id, { onDelete: 'cascade' }),
    sourceText: text('source_text').notNull(),
    targetText: text('target_text').notNull(),
    sourceHash: text('source_hash').notNull(),
    contextPrev: text('context_prev'),
    contextNext: text('context_next'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default({}),
  },
  (table) => [
    index('idx_tu_tm').on(table.tmId),
    index('idx_tu_hash').on(table.sourceHash),
  ]
);

export const translationUnitsRelations = relations(translationUnits, ({ one }) => ({
  translationMemory: one(translationMemories, {
    fields: [translationUnits.tmId],
    references: [translationMemories.id],
  }),
  createdByUser: one(users, {
    fields: [translationUnits.createdBy],
    references: [users.id],
  }),
}));

// ============ Term Bases ============
export const termBases = pgTable(
  'term_bases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sourceLanguage: text('source_language').notNull(),
    targetLanguage: text('target_language').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [index('idx_tb_org').on(table.orgId)]
);

export const termBasesRelations = relations(termBases, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [termBases.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [termBases.createdBy],
    references: [users.id],
  }),
  terms: many(terms),
}));

// ============ Terms ============
export const terms = pgTable(
  'terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tbId: uuid('tb_id')
      .notNull()
      .references(() => termBases.id, { onDelete: 'cascade' }),
    sourceTerm: text('source_term').notNull(),
    targetTerm: text('target_term').notNull(),
    definition: text('definition'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_terms_tb').on(table.tbId)]
);

export const termsRelations = relations(terms, ({ one }) => ({
  termBase: one(termBases, {
    fields: [terms.tbId],
    references: [termBases.id],
  }),
  createdByUser: one(users, {
    fields: [terms.createdBy],
    references: [users.id],
  }),
}));

// ============ Projects ============
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    sourceLanguage: text('source_language').notNull(),
    targetLanguage: text('target_language').notNull(),
    workflowType: text('workflow_type').default('single_review'), // simple, single_review, full_review
    status: text('status').default('active'), // active, completed, archived
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [index('idx_projects_org').on(table.orgId)]
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  members: many(projectMembers),
  resources: many(projectResources),
  documents: many(documents),
}));

// ============ Project Resources ============
export const projectResources = pgTable(
  'project_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type').notNull(), // tm, tb
    resourceId: uuid('resource_id').notNull(),
    isWritable: boolean('is_writable').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_project_resources').on(table.projectId)]
);

export const projectResourcesRelations = relations(projectResources, ({ one }) => ({
  project: one(projects, {
    fields: [projectResources.projectId],
    references: [projects.id],
  }),
}));

// ============ Project Members ============
export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // project_manager, translator, reviewer_1, reviewer_2
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('project_members_unique_idx').on(table.projectId, table.userId, table.role),
    index('idx_project_members_project').on(table.projectId),
    index('idx_project_members_user').on(table.userId),
  ]
);

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

// ============ Documents ============
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fileType: text('file_type').notNull(),
    originalContent: text('original_content'),
    workflowStatus: text('workflow_status').default('translation'), // translation, review_1, review_2, complete
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_documents_project').on(table.projectId)]
);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
  assignments: many(documentAssignments),
  segments: many(segments),
}));

// ============ Document Assignments ============
export const documentAssignments = pgTable(
  'document_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // translator, reviewer_1, reviewer_2
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('doc_assignments_unique_idx').on(table.documentId, table.role),
    index('idx_doc_assignments_doc').on(table.documentId),
    index('idx_doc_assignments_user').on(table.userId),
  ]
);

export const documentAssignmentsRelations = relations(documentAssignments, ({ one }) => ({
  document: one(documents, {
    fields: [documentAssignments.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [documentAssignments.userId],
    references: [users.id],
  }),
  assignedByUser: one(users, {
    fields: [documentAssignments.assignedBy],
    references: [users.id],
  }),
}));

// ============ Segments ============
export const segments = pgTable(
  'segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    segmentIndex: integer('segment_index').notNull(),
    sourceText: text('source_text').notNull(),
    targetText: text('target_text'),
    status: text('status').default('untranslated'), // untranslated, draft, translated, reviewed_1, reviewed_2, locked
    lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
    lastModifiedBy: uuid('last_modified_by').references(() => users.id, { onDelete: 'set null' }),
    // Translation tracking
    translatedBy: uuid('translated_by').references(() => users.id, { onDelete: 'set null' }),
    translatedAt: timestamp('translated_at', { withTimezone: true }),
    // Review tracking
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_segments_document').on(table.documentId),
    index('idx_segments_order').on(table.documentId, table.segmentIndex),
  ]
);

export const segmentsRelations = relations(segments, ({ one, many }) => ({
  document: one(documents, {
    fields: [segments.documentId],
    references: [documents.id],
  }),
  lockedByUser: one(users, {
    fields: [segments.lockedBy],
    references: [users.id],
  }),
  lastModifiedByUser: one(users, {
    fields: [segments.lastModifiedBy],
    references: [users.id],
  }),
  history: many(segmentHistory),
}));

// ============ Segment History ============
export const segmentHistory = pgTable(
  'segment_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    targetText: text('target_text'),
    status: text('status'),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_segment_history').on(table.segmentId)]
);

export const segmentHistoryRelations = relations(segmentHistory, ({ one }) => ({
  segment: one(segments, {
    fields: [segmentHistory.segmentId],
    references: [segments.id],
  }),
  changedByUser: one(users, {
    fields: [segmentHistory.changedBy],
    references: [users.id],
  }),
}));

// ============ Sessions ============
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sessions_user').on(table.userId),
    index('idx_sessions_token').on(table.tokenHash),
  ]
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// ============ Activity Logs ============
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Entity info
    entityType: text('entity_type').notNull(), // project, document, segment, tm, tb, tm_unit, tb_term
    entityId: uuid('entity_id').notNull(),
    entityName: text('entity_name'), // Cached name for display without joins
    // Action info
    action: text('action').notNull(), // create, update, delete, translate, review, confirm, upload, etc.
    // Actor
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Scoping for efficient queries
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    // Details
    metadata: jsonb('metadata').default({}), // Old/new values, additional context
    // Timestamp
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_activity_org').on(table.orgId),
    index('idx_activity_project').on(table.projectId),
    index('idx_activity_document').on(table.documentId),
    index('idx_activity_user').on(table.userId),
    index('idx_activity_entity').on(table.entityType, table.entityId),
    index('idx_activity_created').on(table.createdAt),
  ]
);

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [activityLogs.orgId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [activityLogs.projectId],
    references: [projects.id],
  }),
  document: one(documents, {
    fields: [activityLogs.documentId],
    references: [documents.id],
  }),
}));
