import { eq, and, sql } from 'drizzle-orm';
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
    .orderBy(projects.createdAt);

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
    .orderBy(documents.createdAt);

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
