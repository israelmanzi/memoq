import { eq, sql, isNull, and } from 'drizzle-orm';
import {
  db,
  segments,
  documents,
  projects,
  translationUnits,
  translationMemories,
  terms,
  termBases,
} from '../db/index.js';

export interface SegmentSearchResult {
  id: string;
  sourceText: string;
  targetText: string | null;
  status: string;
  documentId: string;
  documentName: string;
  projectId: string;
  projectName: string;
}

export interface TMUnitSearchResult {
  id: string;
  sourceText: string;
  targetText: string;
  tmId: string;
  tmName: string;
}

export interface TermSearchResult {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  definition: string | null;
  tbId: string;
  tbName: string;
}

export interface SearchResults {
  query: string;
  segments: {
    items: SegmentSearchResult[];
    total: number;
  };
  tmUnits: {
    items: TMUnitSearchResult[];
    total: number;
  };
  terms: {
    items: TermSearchResult[];
    total: number;
  };
}

/**
 * Search segments within an organization
 */
export async function searchSegments(
  orgId: string,
  query: string,
  limit = 20
): Promise<{ items: SegmentSearchResult[]; total: number }> {
  const searchPattern = `%${query}%`;

  const results = await db
    .select({
      id: segments.id,
      sourceText: segments.sourceText,
      targetText: segments.targetText,
      status: segments.status,
      documentId: documents.id,
      documentName: documents.name,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(segments)
    .innerJoin(documents, eq(segments.documentId, documents.id))
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .where(
      and(
        eq(projects.orgId, orgId),
        isNull(projects.deletedAt),
        sql`(${segments.sourceText} ILIKE ${searchPattern} OR ${segments.targetText} ILIKE ${searchPattern})`
      )
    )
    .limit(limit);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(segments)
    .innerJoin(documents, eq(segments.documentId, documents.id))
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .where(
      and(
        eq(projects.orgId, orgId),
        isNull(projects.deletedAt),
        sql`(${segments.sourceText} ILIKE ${searchPattern} OR ${segments.targetText} ILIKE ${searchPattern})`
      )
    );

  return {
    items: results as SegmentSearchResult[],
    total: countResult?.count ?? 0,
  };
}

/**
 * Search translation memory units within an organization
 */
export async function searchTMUnits(
  orgId: string,
  query: string,
  limit = 20
): Promise<{ items: TMUnitSearchResult[]; total: number }> {
  const searchPattern = `%${query}%`;

  const results = await db
    .select({
      id: translationUnits.id,
      sourceText: translationUnits.sourceText,
      targetText: translationUnits.targetText,
      tmId: translationMemories.id,
      tmName: translationMemories.name,
    })
    .from(translationUnits)
    .innerJoin(translationMemories, eq(translationUnits.tmId, translationMemories.id))
    .where(
      and(
        eq(translationMemories.orgId, orgId),
        isNull(translationMemories.deletedAt),
        sql`(${translationUnits.sourceText} ILIKE ${searchPattern} OR ${translationUnits.targetText} ILIKE ${searchPattern})`
      )
    )
    .limit(limit);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(translationUnits)
    .innerJoin(translationMemories, eq(translationUnits.tmId, translationMemories.id))
    .where(
      and(
        eq(translationMemories.orgId, orgId),
        isNull(translationMemories.deletedAt),
        sql`(${translationUnits.sourceText} ILIKE ${searchPattern} OR ${translationUnits.targetText} ILIKE ${searchPattern})`
      )
    );

  return {
    items: results as TMUnitSearchResult[],
    total: countResult?.count ?? 0,
  };
}

/**
 * Search terms within an organization
 */
export async function searchTerms(
  orgId: string,
  query: string,
  limit = 20
): Promise<{ items: TermSearchResult[]; total: number }> {
  const searchPattern = `%${query}%`;

  const results = await db
    .select({
      id: terms.id,
      sourceTerm: terms.sourceTerm,
      targetTerm: terms.targetTerm,
      definition: terms.definition,
      tbId: termBases.id,
      tbName: termBases.name,
    })
    .from(terms)
    .innerJoin(termBases, eq(terms.tbId, termBases.id))
    .where(
      and(
        eq(termBases.orgId, orgId),
        isNull(termBases.deletedAt),
        sql`(${terms.sourceTerm} ILIKE ${searchPattern} OR ${terms.targetTerm} ILIKE ${searchPattern})`
      )
    )
    .limit(limit);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(terms)
    .innerJoin(termBases, eq(terms.tbId, termBases.id))
    .where(
      and(
        eq(termBases.orgId, orgId),
        isNull(termBases.deletedAt),
        sql`(${terms.sourceTerm} ILIKE ${searchPattern} OR ${terms.targetTerm} ILIKE ${searchPattern})`
      )
    );

  return {
    items: results as TermSearchResult[],
    total: countResult?.count ?? 0,
  };
}

/**
 * Search all entity types within an organization
 */
export async function searchAll(
  orgId: string,
  query: string,
  limit = 20
): Promise<SearchResults> {
  // Run all searches in parallel
  const [segmentsResult, tmUnitsResult, termsResult] = await Promise.all([
    searchSegments(orgId, query, limit),
    searchTMUnits(orgId, query, limit),
    searchTerms(orgId, query, limit),
  ]);

  return {
    query,
    segments: segmentsResult,
    tmUnits: tmUnitsResult,
    terms: termsResult,
  };
}
