import { eq, and, sql } from 'drizzle-orm';
import { db, termBases, terms } from '../db/index.js';
import type { TermBase, Term, TermMatch } from '@memoq/shared';

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

export async function findTBById(id: string): Promise<TermBase | null> {
  const [tb] = await db
    .select()
    .from(termBases)
    .where(eq(termBases.id, id));

  return tb ?? null;
}

export async function listOrgTBs(orgId: string): Promise<TermBase[]> {
  const tbs = await db
    .select()
    .from(termBases)
    .where(eq(termBases.orgId, orgId))
    .orderBy(termBases.name);

  return tbs as TermBase[];
}

export async function deleteTB(id: string): Promise<void> {
  await db.delete(termBases).where(eq(termBases.id, id));
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
  // Check for existing term with same source
  const [existing] = await db
    .select()
    .from(terms)
    .where(
      and(
        eq(terms.tbId, input.tbId),
        sql`LOWER(${terms.sourceTerm}) = LOWER(${input.sourceTerm})`
      )
    );

  if (existing) {
    // Update existing term
    const [updated] = await db
      .update(terms)
      .set({
        targetTerm: input.targetTerm,
        definition: input.definition,
      })
      .where(eq(terms.id, existing.id))
      .returning();

    return updated as Term;
  }

  // Create new term
  const [term] = await db
    .insert(terms)
    .values({
      tbId: input.tbId,
      sourceTerm: input.sourceTerm,
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
    .where(sql`${terms.tbId} = ANY(${tbIds})`);

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
