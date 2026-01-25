import { eq, and, sql } from 'drizzle-orm';
import { db, translationMemories, translationUnits } from '../db/index.js';
import { distance } from 'fastest-levenshtein';
import { createHash } from 'crypto';
import type { TranslationMemory, TranslationUnit, TMMatch } from '@memoq/shared';

// ============ Translation Memory CRUD ============

export interface CreateTMInput {
  orgId: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdBy: string;
}

export async function createTM(input: CreateTMInput): Promise<TranslationMemory> {
  const [tm] = await db
    .insert(translationMemories)
    .values({
      orgId: input.orgId,
      name: input.name,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      createdBy: input.createdBy,
    })
    .returning();

  if (!tm) {
    throw new Error('Failed to create translation memory');
  }

  return tm as TranslationMemory;
}

export async function findTMById(id: string): Promise<TranslationMemory | null> {
  const [tm] = await db
    .select()
    .from(translationMemories)
    .where(eq(translationMemories.id, id));

  return tm ?? null;
}

export async function listOrgTMs(orgId: string): Promise<TranslationMemory[]> {
  const tms = await db
    .select()
    .from(translationMemories)
    .where(eq(translationMemories.orgId, orgId))
    .orderBy(translationMemories.name);

  return tms as TranslationMemory[];
}

export async function deleteTM(id: string): Promise<void> {
  await db.delete(translationMemories).where(eq(translationMemories.id, id));
}

export async function updateTM(
  id: string,
  data: { name?: string }
): Promise<TranslationMemory | null> {
  const [tm] = await db
    .update(translationMemories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(translationMemories.id, id))
    .returning();

  return tm ?? null;
}

// ============ Translation Units ============

function hashSource(text: string): string {
  return createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

export interface AddTranslationUnitInput {
  tmId: string;
  sourceText: string;
  targetText: string;
  contextPrev?: string;
  contextNext?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export async function addTranslationUnit(
  input: AddTranslationUnitInput
): Promise<TranslationUnit> {
  const sourceHash = hashSource(input.sourceText);

  // Check for existing exact match
  const [existing] = await db
    .select()
    .from(translationUnits)
    .where(
      and(
        eq(translationUnits.tmId, input.tmId),
        eq(translationUnits.sourceHash, sourceHash)
      )
    );

  if (existing) {
    // Update existing unit
    const [updated] = await db
      .update(translationUnits)
      .set({
        targetText: input.targetText,
        contextPrev: input.contextPrev,
        contextNext: input.contextNext,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      })
      .where(eq(translationUnits.id, existing.id))
      .returning();

    return updated as TranslationUnit;
  }

  // Create new unit
  const [unit] = await db
    .insert(translationUnits)
    .values({
      tmId: input.tmId,
      sourceText: input.sourceText,
      targetText: input.targetText,
      sourceHash,
      contextPrev: input.contextPrev,
      contextNext: input.contextNext,
      createdBy: input.createdBy,
      metadata: input.metadata ?? {},
    })
    .returning();

  if (!unit) {
    throw new Error('Failed to add translation unit');
  }

  return unit as TranslationUnit;
}

export async function getTranslationUnit(id: string): Promise<TranslationUnit | null> {
  const [unit] = await db
    .select()
    .from(translationUnits)
    .where(eq(translationUnits.id, id));

  if (!unit) return null;
  return { ...unit, metadata: unit.metadata as Record<string, unknown> };
}

export async function deleteTranslationUnit(id: string): Promise<void> {
  await db.delete(translationUnits).where(eq(translationUnits.id, id));
}

export async function listTMUnits(
  tmId: string,
  limit = 100,
  offset = 0
): Promise<{ items: TranslationUnit[]; total: number }> {
  const units = await db
    .select()
    .from(translationUnits)
    .where(eq(translationUnits.tmId, tmId))
    .orderBy(translationUnits.createdAt)
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(translationUnits)
    .where(eq(translationUnits.tmId, tmId));

  return {
    items: units as TranslationUnit[],
    total: countResult?.count ?? 0,
  };
}

// ============ Fuzzy Matching ============

export interface FuzzyMatchOptions {
  tmIds: string[];
  sourceText: string;
  contextPrev?: string;
  contextNext?: string;
  minMatchPercent?: number;
  maxResults?: number;
}

export async function findMatches(options: FuzzyMatchOptions): Promise<TMMatch[]> {
  const {
    tmIds,
    sourceText,
    contextPrev,
    contextNext,
    minMatchPercent = 50,
    maxResults = 10,
  } = options;

  if (tmIds.length === 0) {
    return [];
  }

  // Get all units from the specified TMs
  const units = await db
    .select()
    .from(translationUnits)
    .where(sql`${translationUnits.tmId} = ANY(${tmIds})`);

  const normalizedSource = sourceText.toLowerCase().trim();
  const sourceHash = hashSource(sourceText);

  const matches: TMMatch[] = [];

  for (const unit of units) {
    // Check for exact match first
    if (unit.sourceHash === sourceHash) {
      const isContextMatch =
        contextPrev !== undefined &&
        contextNext !== undefined &&
        unit.contextPrev === contextPrev &&
        unit.contextNext === contextNext;

      matches.push({
        id: unit.id,
        sourceText: unit.sourceText,
        targetText: unit.targetText,
        matchPercent: 100,
        isContextMatch,
      });
      continue;
    }

    // Calculate fuzzy match percentage using Levenshtein distance
    const normalizedUnitSource = unit.sourceText.toLowerCase().trim();
    const maxLen = Math.max(normalizedSource.length, normalizedUnitSource.length);

    if (maxLen === 0) continue;

    const dist = distance(normalizedSource, normalizedUnitSource);
    const matchPercent = Math.round(((maxLen - dist) / maxLen) * 100);

    if (matchPercent >= minMatchPercent) {
      matches.push({
        id: unit.id,
        sourceText: unit.sourceText,
        targetText: unit.targetText,
        matchPercent,
        isContextMatch: false,
      });
    }
  }

  // Sort by match percentage (descending) and limit results
  return matches
    .sort((a, b) => b.matchPercent - a.matchPercent)
    .slice(0, maxResults);
}

// ============ Bulk Operations ============

export async function addTranslationUnitsBulk(
  tmId: string,
  units: Array<{
    sourceText: string;
    targetText: string;
    contextPrev?: string;
    contextNext?: string;
    metadata?: Record<string, unknown>;
  }>,
  createdBy?: string
): Promise<number> {
  let added = 0;

  // Process in batches to avoid overwhelming the database
  const batchSize = 100;
  for (let i = 0; i < units.length; i += batchSize) {
    const batch = units.slice(i, i + batchSize);

    for (const unit of batch) {
      await addTranslationUnit({
        tmId,
        sourceText: unit.sourceText,
        targetText: unit.targetText,
        contextPrev: unit.contextPrev,
        contextNext: unit.contextNext,
        createdBy,
        metadata: unit.metadata,
      });
      added++;
    }
  }

  return added;
}

// ============ Statistics ============

export async function getTMStats(tmId: string): Promise<{
  unitCount: number;
  lastUpdated: Date | null;
}> {
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(translationUnits)
    .where(eq(translationUnits.tmId, tmId));

  const [lastUnit] = await db
    .select({ updatedAt: translationUnits.updatedAt })
    .from(translationUnits)
    .where(eq(translationUnits.tmId, tmId))
    .orderBy(sql`${translationUnits.updatedAt} DESC`)
    .limit(1);

  return {
    unitCount: countResult?.count ?? 0,
    lastUpdated: lastUnit?.updatedAt ?? null,
  };
}
