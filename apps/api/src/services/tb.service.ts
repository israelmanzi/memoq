import { eq, and, sql, desc, inArray, isNull } from 'drizzle-orm';
import { db, termBases, terms, users, projectResources, projects } from '../db/index.js';
import type { TermBase, Term, TermMatch } from '@oxy/shared';

export interface TermBaseWithCreator extends TermBase {
  createdByName: string | null;
}

// ============ Term Base CRUD ============

export interface CreateTBInput {
  orgId: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdBy: string;
}

export async function createTB(input: CreateTBInput): Promise<TermBase> {
  const [tb] = await db
    .insert(termBases)
    .values({
      orgId: input.orgId,
      name: input.name,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      createdBy: input.createdBy,
    })
    .returning();

  if (!tb) {
    throw new Error('Failed to create term base');
  }

  return tb as TermBase;
}

export async function findTBById(id: string, includeDeleted = false): Promise<TermBase | null> {
  const conditions = includeDeleted
    ? eq(termBases.id, id)
    : and(eq(termBases.id, id), isNull(termBases.deletedAt));

  const [tb] = await db
    .select()
    .from(termBases)
    .where(conditions);

  return tb ?? null;
}

export async function listOrgTBs(
  orgId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ items: TermBaseWithCreator[]; total: number }> {
  const { limit = 100, offset = 0 } = options;

  const conditions = and(
    eq(termBases.orgId, orgId),
    isNull(termBases.deletedAt)
  );

  const tbs = await db
    .select({
      id: termBases.id,
      orgId: termBases.orgId,
      name: termBases.name,
      sourceLanguage: termBases.sourceLanguage,
      targetLanguage: termBases.targetLanguage,
      createdBy: termBases.createdBy,
      createdAt: termBases.createdAt,
      createdByName: users.name,
    })
    .from(termBases)
    .leftJoin(users, eq(termBases.createdBy, users.id))
    .where(conditions)
    .orderBy(desc(termBases.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(termBases)
    .where(conditions);

  return {
    items: tbs as TermBaseWithCreator[],
    total: countResult?.count ?? 0,
  };
}

export interface TBDeleteInfo {
  termCount: number;
  linkedProjects: Array<{ id: string; name: string }>;
}

export async function getTBDeleteInfo(id: string): Promise<TBDeleteInfo> {
  // Count terms
  const [termCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(terms)
    .where(eq(terms.tbId, id));

  // Find linked projects
  const linkedResources = await db
    .select({
      projectId: projectResources.projectId,
      projectName: projects.name,
    })
    .from(projectResources)
    .innerJoin(projects, eq(projectResources.projectId, projects.id))
    .where(
      and(
        eq(projectResources.resourceId, id),
        eq(projectResources.resourceType, 'tb'),
        isNull(projects.deletedAt)
      )
    );

  return {
    termCount: termCount?.count ?? 0,
    linkedProjects: linkedResources.map((r) => ({ id: r.projectId, name: r.projectName })),
  };
}

export async function deleteTB(id: string, deletedBy: string): Promise<void> {
  // Soft delete - set deletedAt and deletedBy
  await db
    .update(termBases)
    .set({
      deletedAt: new Date(),
      deletedBy,
    })
    .where(eq(termBases.id, id));

  // Remove from all project resources
  await db
    .delete(projectResources)
    .where(
      and(
        eq(projectResources.resourceId, id),
        eq(projectResources.resourceType, 'tb')
      )
    );
}

export async function updateTB(
  id: string,
  data: { name?: string }
): Promise<TermBase | null> {
  const [tb] = await db
    .update(termBases)
    .set(data)
    .where(eq(termBases.id, id))
    .returning();

  return tb ?? null;
}

// ============ Terms ============

export interface AddTermInput {
  tbId: string;
  sourceTerm: string;
  targetTerm: string;
  definition?: string;
  createdBy?: string;
}

export async function addTerm(input: AddTermInput): Promise<Term> {
  // Check for existing terms with same source (case-insensitive)
  const existingTerms = await db
    .select()
    .from(terms)
    .where(
      and(
        eq(terms.tbId, input.tbId),
        sql`LOWER(${terms.sourceTerm}) = LOWER(${input.sourceTerm})`
      )
    );

  // Check if exact same source+target already exists
  const exactMatch = existingTerms.find(
    (t) => t.targetTerm.toLowerCase() === input.targetTerm.toLowerCase()
  );

  if (exactMatch) {
    // Update definition only if it's an exact match
    const [updated] = await db
      .update(terms)
      .set({
        definition: input.definition,
      })
      .where(eq(terms.id, exactMatch.id))
      .returning();

    return updated as Term;
  }

  // If there are existing terms with same source but different target,
  // add version numbers to distinguish them
  let sourceTerm = input.sourceTerm;
  if (existingTerms.length > 0) {
    // Check if existing terms already have version numbers
    const hasVersions = existingTerms.some((t) => / #\d+$/.test(t.sourceTerm));

    if (!hasVersions && existingTerms.length === 1) {
      // Add #1 to the existing term
      const existing = existingTerms[0]!;
      await db
        .update(terms)
        .set({ sourceTerm: `${existing.sourceTerm} #1` })
        .where(eq(terms.id, existing.id));
    }

    // Find the next version number
    const versionNumbers = existingTerms
      .map((t) => {
        const match = t.sourceTerm.match(/ #(\d+)$/);
        return match && match[1] ? parseInt(match[1], 10) : 1;
      });
    const nextVersion = Math.max(...versionNumbers) + 1;
    sourceTerm = `${input.sourceTerm} #${nextVersion}`;
  }

  // Create new term
  const [term] = await db
    .insert(terms)
    .values({
      tbId: input.tbId,
      sourceTerm,
      targetTerm: input.targetTerm,
      definition: input.definition,
      createdBy: input.createdBy,
    })
    .returning();

  if (!term) {
    throw new Error('Failed to add term');
  }

  return term as Term;
}

export async function getTerm(id: string): Promise<Term | null> {
  const [term] = await db
    .select()
    .from(terms)
    .where(eq(terms.id, id));

  return term ?? null;
}

export async function deleteTerm(id: string): Promise<void> {
  await db.delete(terms).where(eq(terms.id, id));
}

export async function updateTerm(
  id: string,
  data: { sourceTerm?: string; targetTerm?: string; definition?: string }
): Promise<Term | null> {
  const [term] = await db
    .update(terms)
    .set(data)
    .where(eq(terms.id, id))
    .returning();

  return term ?? null;
}

export async function listTBTerms(
  tbId: string,
  limit = 100,
  offset = 0,
  search?: string
): Promise<{ items: Term[]; total: number }> {
  const conditions = [eq(terms.tbId, tbId)];

  if (search) {
    conditions.push(
      sql`(${terms.sourceTerm} ILIKE ${'%' + search + '%'} OR ${terms.targetTerm} ILIKE ${'%' + search + '%'})`
    );
  }

  const termList = await db
    .select()
    .from(terms)
    .where(and(...conditions))
    .orderBy(terms.sourceTerm)
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(terms)
    .where(and(...conditions));

  return {
    items: termList as Term[],
    total: countResult?.count ?? 0,
  };
}

// ============ Term Matching ============

export interface FindTermsOptions {
  tbIds: string[];
  text: string;
}

export async function findTermsInText(options: FindTermsOptions): Promise<TermMatch[]> {
  const { tbIds, text } = options;

  if (tbIds.length === 0) {
    return [];
  }

  // Get all terms from the specified TBs
  const allTerms = await db
    .select()
    .from(terms)
    .where(inArray(terms.tbId, tbIds));

  const matches: TermMatch[] = [];
  const textLower = text.toLowerCase();

  for (const term of allTerms) {
    const sourceLower = term.sourceTerm.toLowerCase();
    let startIndex = 0;
    let position = textLower.indexOf(sourceLower, startIndex);

    while (position !== -1) {
      // Check word boundaries to avoid partial matches
      const beforeChar = position > 0 ? textLower[position - 1] ?? ' ' : ' ';
      const afterChar =
        position + sourceLower.length < textLower.length
          ? textLower[position + sourceLower.length] ?? ' '
          : ' ';

      const isWordBoundaryBefore = !/[a-zA-Z0-9]/.test(beforeChar);
      const isWordBoundaryAfter = !/[a-zA-Z0-9]/.test(afterChar);

      if (isWordBoundaryBefore && isWordBoundaryAfter) {
        matches.push({
          id: term.id,
          sourceTerm: term.sourceTerm,
          targetTerm: term.targetTerm,
          position: {
            start: position,
            end: position + term.sourceTerm.length,
          },
        });
      }

      startIndex = position + 1;
      position = textLower.indexOf(sourceLower, startIndex);
    }
  }

  // Sort by position and remove duplicates (same term at same position)
  const seen = new Set<string>();
  return matches
    .sort((a, b) => a.position.start - b.position.start)
    .filter((match) => {
      const key = `${match.id}-${match.position.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ============ Bulk Operations ============

export async function addTermsBulk(
  tbId: string,
  termData: Array<{
    sourceTerm: string;
    targetTerm: string;
    definition?: string;
  }>,
  createdBy?: string
): Promise<number> {
  let added = 0;

  for (const t of termData) {
    await addTerm({
      tbId,
      sourceTerm: t.sourceTerm,
      targetTerm: t.targetTerm,
      definition: t.definition,
      createdBy,
    });
    added++;
  }

  return added;
}

// ============ Statistics ============

export async function getTBStats(tbId: string): Promise<{
  termCount: number;
}> {
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(terms)
    .where(eq(terms.tbId, tbId));

  return {
    termCount: countResult?.count ?? 0,
  };
}
