import { eq, and, sql, desc } from 'drizzle-orm';
import {
  db,
  projects,
  projectMembers,
  projectResources,
  documents,
  segments,
} from '../db/index.js';
import type {
  Project,
  Document,
  Segment,
  WorkflowType,
  ProjectStatus,
  WorkflowStatus,
  SegmentStatus,
  ProjectRole,
} from '@memoq/shared';
import { findMatches } from './tm.service.js';

// ============ Projects ============

export interface CreateProjectInput {
  orgId: string;
  name: string;
  description?: string;
  sourceLanguage: string;
  targetLanguage: string;
  workflowType?: WorkflowType;
  createdBy: string;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const [project] = await db
    .insert(projects)
    .values({
      orgId: input.orgId,
      name: input.name,
      description: input.description,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      workflowType: input.workflowType ?? 'single_review',
      createdBy: input.createdBy,
    })
    .returning();

  if (!project) {
    throw new Error('Failed to create project');
  }

  // Add creator as project manager
  await addProjectMember({
    projectId: project.id,
    userId: input.createdBy,
    role: 'project_manager',
  });

  return project as Project;
}

export async function findProjectById(id: string): Promise<Project | null> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  return project as Project | null;
}

export async function listOrgProjects(
  orgId: string,
  status?: ProjectStatus
): Promise<Project[]> {
  const conditions = [eq(projects.orgId, orgId)];
  if (status) {
    conditions.push(eq(projects.status, status));
  }

  const result = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.createdAt));

  return result as Project[];
}

export async function updateProject(
  id: string,
  data: {
    name?: string;
    description?: string;
    status?: ProjectStatus;
    workflowType?: WorkflowType;
  }
): Promise<Project | null> {
  const [project] = await db
    .update(projects)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();

  return project as Project | null;
}

export async function deleteProject(id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}

// ============ Project Members ============

export interface AddProjectMemberInput {
  projectId: string;
  userId: string;
  role: ProjectRole;
}

export async function addProjectMember(
  input: AddProjectMemberInput
): Promise<{ id: string; projectId: string; userId: string; role: string }> {
  const [member] = await db
    .insert(projectMembers)
    .values({
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
    })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId, projectMembers.role],
      set: { role: input.role },
    })
    .returning();

  if (!member) {
    throw new Error('Failed to add project member');
  }

  return member;
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
  role?: string
): Promise<void> {
  const conditions = [
    eq(projectMembers.projectId, projectId),
    eq(projectMembers.userId, userId),
  ];
  if (role) {
    conditions.push(eq(projectMembers.role, role));
  }

  await db.delete(projectMembers).where(and(...conditions));
}

export async function getProjectMembership(
  projectId: string,
  userId: string
): Promise<{ id: string; role: string } | null> {
  const [member] = await db
    .select({ id: projectMembers.id, role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
    );

  return member ?? null;
}

export async function listProjectMembers(projectId: string) {
  const members = await db.query.projectMembers.findMany({
    where: eq(projectMembers.projectId, projectId),
    with: {
      user: {
        columns: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  return members.map((m) => ({
    id: m.id,
    role: m.role,
    createdAt: m.createdAt,
    user: m.user,
  }));
}

// ============ Project Resources ============

export async function addProjectResource(
  projectId: string,
  resourceType: 'tm' | 'tb',
  resourceId: string,
  isWritable = true
): Promise<void> {
  await db
    .insert(projectResources)
    .values({
      projectId,
      resourceType,
      resourceId,
      isWritable,
    })
    .onConflictDoNothing();
}

export async function removeProjectResource(
  projectId: string,
  resourceId: string
): Promise<void> {
  await db
    .delete(projectResources)
    .where(
      and(
        eq(projectResources.projectId, projectId),
        eq(projectResources.resourceId, resourceId)
      )
    );
}

export async function listProjectResources(projectId: string) {
  const resources = await db
    .select()
    .from(projectResources)
    .where(eq(projectResources.projectId, projectId));

  return resources;
}

// ============ Documents ============

export interface CreateDocumentInput {
  projectId: string;
  name: string;
  fileType: string;
  originalContent?: string;
}

export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const [doc] = await db
    .insert(documents)
    .values({
      projectId: input.projectId,
      name: input.name,
      fileType: input.fileType,
      originalContent: input.originalContent,
    })
    .returning();

  if (!doc) {
    throw new Error('Failed to create document');
  }

  return doc as Document;
}

export async function findDocumentById(id: string): Promise<Document | null> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));

  return doc as Document | null;
}

export async function listProjectDocuments(projectId: string): Promise<Document[]> {
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.createdAt));

  return docs as Document[];
}

export async function updateDocumentStatus(
  id: string,
  workflowStatus: WorkflowStatus
): Promise<Document | null> {
  const [doc] = await db
    .update(documents)
    .set({ workflowStatus, updatedAt: new Date() })
    .where(eq(documents.id, id))
    .returning();

  return doc as Document | null;
}

export async function deleteDocument(id: string): Promise<void> {
  await db.delete(documents).where(eq(documents.id, id));
}

// ============ Segments ============

export interface CreateSegmentInput {
  documentId: string;
  segmentIndex: number;
  sourceText: string;
  targetText?: string;
}

export async function createSegment(input: CreateSegmentInput): Promise<Segment> {
  const [segment] = await db
    .insert(segments)
    .values({
      documentId: input.documentId,
      segmentIndex: input.segmentIndex,
      sourceText: input.sourceText,
      targetText: input.targetText,
    })
    .returning();

  if (!segment) {
    throw new Error('Failed to create segment');
  }

  return segment as Segment;
}

export async function createSegmentsBulk(
  documentId: string,
  segmentData: Array<{ sourceText: string; targetText?: string }>
): Promise<number> {
  const values = segmentData.map((s, index) => ({
    documentId,
    segmentIndex: index,
    sourceText: s.sourceText,
    targetText: s.targetText,
  }));

  await db.insert(segments).values(values);
  return values.length;
}

export async function findSegmentById(id: string): Promise<Segment | null> {
  const [segment] = await db.select().from(segments).where(eq(segments.id, id));

  return segment as Segment | null;
}

export async function listDocumentSegments(documentId: string): Promise<Segment[]> {
  const result = await db
    .select()
    .from(segments)
    .where(eq(segments.documentId, documentId))
    .orderBy(segments.segmentIndex);

  return result as Segment[];
}

export async function updateSegment(
  id: string,
  data: {
    targetText?: string;
    status?: SegmentStatus;
    lockedBy?: string | null;
    lastModifiedBy?: string;
  }
): Promise<Segment | null> {
  const [segment] = await db
    .update(segments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(segments.id, id))
    .returning();

  return segment as Segment | null;
}

export async function updateSegmentsBulk(
  updates: Array<{ id: string; targetText: string; status?: SegmentStatus; lastModifiedBy?: string }>
): Promise<number> {
  let updated = 0;
  for (const update of updates) {
    await db
      .update(segments)
      .set({
        targetText: update.targetText,
        status: update.status,
        lastModifiedBy: update.lastModifiedBy,
        updatedAt: new Date(),
      })
      .where(eq(segments.id, update.id));
    updated++;
  }
  return updated;
}

// ============ Pre-translation ============

export interface PreTranslateOptions {
  documentId: string;
  tmIds: string[];
  minMatchPercent?: number; // Default 100 (exact matches only)
  overwriteExisting?: boolean; // Default false
}

export interface PreTranslateResult {
  totalSegments: number;
  preTranslated: number;
  exactMatches: number;
  fuzzyMatches: number;
}

/**
 * Pre-translate a document using TM matches
 * Fills in target text for segments that have TM matches
 */
export async function preTranslateDocument(
  options: PreTranslateOptions
): Promise<PreTranslateResult> {
  const {
    documentId,
    tmIds,
    minMatchPercent = 100,
    overwriteExisting = false,
  } = options;

  if (tmIds.length === 0) {
    const segs = await listDocumentSegments(documentId);
    return {
      totalSegments: segs.length,
      preTranslated: 0,
      exactMatches: 0,
      fuzzyMatches: 0,
    };
  }

  const segs = await listDocumentSegments(documentId);
  let preTranslated = 0;
  let exactMatches = 0;
  let fuzzyMatches = 0;

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (!seg) continue;

    // Skip if already has target and we're not overwriting
    if (seg.targetText && !overwriteExisting) {
      continue;
    }

    // Get context from adjacent segments
    const contextPrev = i > 0 ? segs[i - 1]?.sourceText : undefined;
    const contextNext = i < segs.length - 1 ? segs[i + 1]?.sourceText : undefined;

    // Find TM matches
    const matches = await findMatches({
      tmIds,
      sourceText: seg.sourceText,
      contextPrev,
      contextNext,
      minMatchPercent,
      maxResults: 1, // We only need the best match
    });

    if (matches.length > 0) {
      const bestMatch = matches[0];
      if (!bestMatch) continue;

      // Determine status based on match quality
      let status: SegmentStatus;
      if (bestMatch.matchPercent === 100) {
        status = bestMatch.isContextMatch ? 'translated' : 'translated';
        exactMatches++;
      } else {
        status = 'draft'; // Fuzzy matches need review
        fuzzyMatches++;
      }

      // Update segment with pre-translated text
      await db
        .update(segments)
        .set({
          targetText: bestMatch.targetText,
          status,
          updatedAt: new Date(),
        })
        .where(eq(segments.id, seg.id));

      preTranslated++;
    }
  }

  return {
    totalSegments: segs.length,
    preTranslated,
    exactMatches,
    fuzzyMatches,
  };
}

// ============ Statistics ============

export async function getProjectStats(projectId: string) {
  const [docCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.projectId, projectId));

  const docs = await listProjectDocuments(projectId);
  let totalSegments = 0;
  let translatedSegments = 0;
  let reviewedSegments = 0;

  for (const doc of docs) {
    const segs = await listDocumentSegments(doc.id);
    totalSegments += segs.length;
    translatedSegments += segs.filter(
      (s) => s.status && !['untranslated', 'draft'].includes(s.status)
    ).length;
    reviewedSegments += segs.filter(
      (s) => s.status && ['reviewed_1', 'reviewed_2', 'locked'].includes(s.status)
    ).length;
  }

  return {
    documentCount: docCount?.count ?? 0,
    totalSegments,
    translatedSegments,
    reviewedSegments,
    progress: totalSegments > 0 ? Math.round((translatedSegments / totalSegments) * 100) : 0,
  };
}

export async function getDocumentStats(documentId: string) {
  const segs = await listDocumentSegments(documentId);

  const byStatus: Record<string, number> = {};
  for (const seg of segs) {
    const status = seg.status ?? 'untranslated';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    totalSegments: segs.length,
    byStatus,
    progress:
      segs.length > 0
        ? Math.round(
            (segs.filter((s) => s.status && !['untranslated', 'draft'].includes(s.status))
              .length /
              segs.length) *
              100
          )
        : 0,
  };
}

// ============ Workflow Transitions ============

// Segment status hierarchy (index = minimum level for workflow stage)
const SEGMENT_STATUS_LEVEL: Record<string, number> = {
  untranslated: 0,
  draft: 1,
  translated: 2,
  reviewed_1: 3,
  reviewed_2: 4,
  locked: 5,
};

// Minimum segment level required for each workflow status
const WORKFLOW_REQUIREMENTS: Record<WorkflowStatus, number> = {
  translation: 0,  // Any status
  review_1: 2,     // All segments >= translated
  review_2: 3,     // All segments >= reviewed_1
  complete: 4,     // All segments >= reviewed_2
};

/**
 * Calculate what workflow status a document should have based on its segments
 */
export async function calculateDocumentWorkflowStatus(
  documentId: string,
  workflowType: WorkflowType
): Promise<WorkflowStatus> {
  const segs = await listDocumentSegments(documentId);

  if (segs.length === 0) {
    return 'translation';
  }

  // Find the minimum segment status level
  let minLevel = 5; // Start with max (locked)
  for (const seg of segs) {
    const status = seg.status ?? 'untranslated';
    const level = SEGMENT_STATUS_LEVEL[status] ?? 0;
    minLevel = Math.min(minLevel, level);
  }

  // Determine workflow status based on minimum level and workflow type
  if (minLevel >= WORKFLOW_REQUIREMENTS.complete) {
    return 'complete';
  }

  if (minLevel >= WORKFLOW_REQUIREMENTS.review_2 && workflowType === 'full_review') {
    return 'review_2';
  }

  if (minLevel >= WORKFLOW_REQUIREMENTS.review_1 && workflowType !== 'simple') {
    return 'review_1';
  }

  return 'translation';
}

/**
 * Check if a document can be manually advanced to a workflow status
 * Returns { allowed: boolean, reason?: string }
 */
export async function canAdvanceToWorkflowStatus(
  documentId: string,
  targetStatus: WorkflowStatus,
  workflowType: WorkflowType
): Promise<{ allowed: boolean; reason?: string }> {
  const segs = await listDocumentSegments(documentId);

  if (segs.length === 0) {
    return { allowed: false, reason: 'Document has no segments' };
  }

  const requiredLevel = WORKFLOW_REQUIREMENTS[targetStatus];

  // Count segments that don't meet the requirement
  const notReady = segs.filter((seg) => {
    const status = seg.status ?? 'untranslated';
    return (SEGMENT_STATUS_LEVEL[status] ?? 0) < requiredLevel;
  });

  if (notReady.length > 0) {
    const statusName = targetStatus === 'review_1' ? 'translated'
      : targetStatus === 'review_2' ? 'reviewed (1st)'
      : targetStatus === 'complete' ? 'reviewed (2nd)'
      : 'ready';

    return {
      allowed: false,
      reason: `${notReady.length} segment(s) not ${statusName} yet`,
    };
  }

  // Check workflow type compatibility
  if (targetStatus === 'review_2' && workflowType !== 'full_review') {
    return { allowed: false, reason: 'Review 2 requires full_review workflow type' };
  }

  if ((targetStatus === 'review_1' || targetStatus === 'review_2') && workflowType === 'simple') {
    return { allowed: false, reason: 'Review stages not available for simple workflow' };
  }

  return { allowed: true };
}

/**
 * Auto-update document workflow status after segment changes
 * Call this after updating segments
 */
export async function refreshDocumentWorkflowStatus(documentId: string): Promise<WorkflowStatus> {
  const doc = await findDocumentById(documentId);
  if (!doc) {
    throw new Error('Document not found');
  }

  const project = await findProjectById(doc.projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const newStatus = await calculateDocumentWorkflowStatus(documentId, project.workflowType);

  // Only update if status changed
  if (newStatus !== doc.workflowStatus) {
    await db
      .update(documents)
      .set({ workflowStatus: newStatus, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  }

  return newStatus;
}
