/**
 * Analytics Service
 * Provides project statistics, leverage analysis, productivity metrics, and reporting
 */

import { eq, and, sql, asc, gte, lte, inArray } from 'drizzle-orm';
import {
  db,
  documents,
  segments,
  segmentHistory,
  projectResources,
  users,
  segmentComments,
} from '../db/index.js';
import { listDocumentSegments, findProjectById } from './project.service.js';
import { findMatches } from './tm.service.js';

// ============ Types ============

export interface LeverageAnalysis {
  documentId: string;
  documentName: string;
  totalSegments: number;
  totalWords: number;
  matchDistribution: {
    exact: { count: number; words: number; percentage: number }; // 100%
    fuzzyHigh: { count: number; words: number; percentage: number }; // 95-99%
    fuzzyMid: { count: number; words: number; percentage: number }; // 85-94%
    fuzzyLow: { count: number; words: number; percentage: number }; // 75-84%
    noMatch: { count: number; words: number; percentage: number }; // <75%
    repetitions: { count: number; words: number; percentage: number }; // Duplicates in doc
  };
  estimatedEffort: {
    exact: number; // 0% effort
    fuzzyHigh: number; // 25% effort
    fuzzyMid: number; // 50% effort
    fuzzyLow: number; // 75% effort
    noMatch: number; // 100% effort
    repetitions: number; // 10% effort
    totalWeightedWords: number;
  };
}

export interface ProjectStatistics {
  projectId: string;
  projectName: string;
  sourceLanguage: string;
  targetLanguage: string;
  totalDocuments: number;
  totalSegments: number;
  totalSourceWords: number;
  totalTargetWords: number;
  segmentsByStatus: {
    untranslated: number;
    draft: number;
    translated: number;
    reviewed1: number;
    reviewed2: number;
    locked: number;
  };
  progressPercentage: {
    translation: number;
    review1: number;
    review2: number;
    complete: number;
  };
  qualityMetrics: {
    totalQAIssues: number;
    totalComments: number;
    unresolvedComments: number;
  };
  timeline: {
    createdAt: Date;
    deadline: Date | null;
    daysRemaining: number | null;
    isOverdue: boolean;
  };
}

export interface UserProductivity {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  statistics: {
    segmentsTranslated: number;
    wordsTranslated: number;
    segmentsReviewed: number;
    wordsReviewed: number;
    commentsAdded: number;
    avgTimePerSegment: number | null; // in seconds
    mostActiveDay: string | null;
    lastActivity: Date | null;
  };
  productivity: {
    wordsPerDay: number;
    segmentsPerDay: number;
    activeDays: number;
  };
}

export interface DocumentAnalytics {
  documentId: string;
  documentName: string;
  totalSegments: number;
  sourceWords: number;
  targetWords: number;
  completionPercentage: number;
  averageMatchPercentage: number;
  mtUsageCount: number;
  qaIssueCount: number;
  commentCount: number;
  timeSpent: number | null; // in minutes
  contributors: Array<{
    userId: string;
    userName: string;
    role: string;
    segmentsContributed: number;
  }>;
}

export interface ProjectTimeline {
  date: string;
  segmentsCompleted: number;
  wordsTranslated: number;
  commentsAdded: number;
  activeUsers: number;
}

// ============ Leverage Analysis ============

/**
 * Analyze document to show TM leverage before translation starts
 * Shows distribution of match percentages and estimated effort
 */
export async function analyzeLeverage(
  documentId: string,
  projectId: string
): Promise<LeverageAnalysis> {
  // Get document info
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc) {
    throw new Error('Document not found');
  }

  // Get all segments
  const segmentsList = await listDocumentSegments(documentId);

  if (!segmentsList || segmentsList.length === 0) {
    throw new Error('No segments found in document');
  }

  // Get project TMs
  const project = await findProjectById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const tmIds = await db
    .select({ tmId: projectResources.resourceId })
    .from(projectResources)
    .where(
      and(
        eq(projectResources.projectId, projectId),
        eq(projectResources.resourceType, 'translation_memory')
      )
    );

  // Initialize match distribution
  const matchDistribution = {
    exact: { count: 0, words: 0, percentage: 0 },
    fuzzyHigh: { count: 0, words: 0, percentage: 0 },
    fuzzyMid: { count: 0, words: 0, percentage: 0 },
    fuzzyLow: { count: 0, words: 0, percentage: 0 },
    noMatch: { count: 0, words: 0, percentage: 0 },
    repetitions: { count: 0, words: 0, percentage: 0 },
  };

  // Track seen source texts for repetition detection
  const seenSources = new Map<string, number>();
  const totalSegments = segmentsList.length;
  let totalWords = 0;

  // Analyze each segment
  for (const segment of segmentsList) {
    const wordCount = segment.sourceText.split(/\s+/).filter(Boolean).length;
    totalWords += wordCount;

    // Check for repetitions (exact duplicates within document)
    const normalizedSource = segment.sourceText.toLowerCase().trim();
    if (seenSources.has(normalizedSource)) {
      matchDistribution.repetitions.count++;
      matchDistribution.repetitions.words += wordCount;
      seenSources.set(normalizedSource, (seenSources.get(normalizedSource) || 0) + 1);
      continue;
    }
    seenSources.set(normalizedSource, 1);

    // Get best TM match for this segment
    let bestMatchPercent = 0;

    if (tmIds.length > 0) {
      try {
        for (const { tmId } of tmIds) {
          const matches = await findMatches({
            tmIds: [tmId],
            sourceText: segment.sourceText,
            minMatchPercent: 70, // Minimum 70% to be useful
            maxResults: 1,
          });

          if (matches.length > 0 && matches[0]?.matchPercent && matches[0].matchPercent > bestMatchPercent) {
            bestMatchPercent = matches[0].matchPercent;
          }
        }
      } catch (error) {
        // Continue if TM lookup fails
        console.warn('TM lookup failed:', error);
      }
    }

    // Categorize by match percentage
    if (bestMatchPercent === 100) {
      matchDistribution.exact.count++;
      matchDistribution.exact.words += wordCount;
    } else if (bestMatchPercent >= 95) {
      matchDistribution.fuzzyHigh.count++;
      matchDistribution.fuzzyHigh.words += wordCount;
    } else if (bestMatchPercent >= 85) {
      matchDistribution.fuzzyMid.count++;
      matchDistribution.fuzzyMid.words += wordCount;
    } else if (bestMatchPercent >= 75) {
      matchDistribution.fuzzyLow.count++;
      matchDistribution.fuzzyLow.words += wordCount;
    } else {
      matchDistribution.noMatch.count++;
      matchDistribution.noMatch.words += wordCount;
    }
  }

  // Calculate percentages
  for (const key of Object.keys(matchDistribution) as Array<keyof typeof matchDistribution>) {
    matchDistribution[key].percentage = totalSegments > 0
      ? Math.round((matchDistribution[key].count / totalSegments) * 100)
      : 0;
  }

  // Calculate estimated effort (weighted words)
  // Industry standard weights: 100%=0%, 95-99%=25%, 85-94%=50%, 75-84%=75%, <75%=100%, repetitions=10%
  const estimatedEffort = {
    exact: Math.round(matchDistribution.exact.words * 0.0),
    fuzzyHigh: Math.round(matchDistribution.fuzzyHigh.words * 0.25),
    fuzzyMid: Math.round(matchDistribution.fuzzyMid.words * 0.5),
    fuzzyLow: Math.round(matchDistribution.fuzzyLow.words * 0.75),
    noMatch: Math.round(matchDistribution.noMatch.words * 1.0),
    repetitions: Math.round(matchDistribution.repetitions.words * 0.1),
    totalWeightedWords: 0,
  };

  estimatedEffort.totalWeightedWords =
    estimatedEffort.exact +
    estimatedEffort.fuzzyHigh +
    estimatedEffort.fuzzyMid +
    estimatedEffort.fuzzyLow +
    estimatedEffort.noMatch +
    estimatedEffort.repetitions;

  return {
    documentId: doc.id,
    documentName: doc.name,
    totalSegments,
    totalWords,
    matchDistribution,
    estimatedEffort,
  };
}

// ============ Project Statistics ============

/**
 * Get comprehensive project statistics
 */
export async function getProjectStatistics(projectId: string): Promise<ProjectStatistics> {
  const project = await findProjectById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Get all documents
  const projectDocs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, projectId)));

  // Get all segments
  const allSegments = await db
    .select()
    .from(segments)
    .where(
      and(
        inArray(documents.id, projectDocs.map((d) => d.id)),
        eq(segments.documentId, documents.id)
      )
    )
    .innerJoin(documents, eq(segments.documentId, documents.id));

  const totalSegments = allSegments.length;
  let totalSourceWords = 0;
  let totalTargetWords = 0;

  // Count segments by status
  const segmentsByStatus = {
    untranslated: 0,
    draft: 0,
    translated: 0,
    reviewed1: 0,
    reviewed2: 0,
    locked: 0,
  };

  for (const { segments: segment } of allSegments) {
    const sourceWords = segment.sourceText.split(/\s+/).filter(Boolean).length;
    const targetWords = segment.targetText ? segment.targetText.split(/\s+/).filter(Boolean).length : 0;
    totalSourceWords += sourceWords;
    totalTargetWords += targetWords;

    segmentsByStatus[segment.status as keyof typeof segmentsByStatus]++;
  }

  // Calculate progress percentages
  const translatedCount =
    segmentsByStatus.translated +
    segmentsByStatus.reviewed1 +
    segmentsByStatus.reviewed2 +
    segmentsByStatus.locked;
  const reviewed1Count =
    segmentsByStatus.reviewed1 +
    segmentsByStatus.reviewed2 +
    segmentsByStatus.locked;
  const reviewed2Count = segmentsByStatus.reviewed2 + segmentsByStatus.locked;
  const completeCount = segmentsByStatus.locked;

  const progressPercentage = {
    translation: totalSegments > 0 ? Math.round((translatedCount / totalSegments) * 100) : 0,
    review1: totalSegments > 0 ? Math.round((reviewed1Count / totalSegments) * 100) : 0,
    review2: totalSegments > 0 ? Math.round((reviewed2Count / totalSegments) * 100) : 0,
    complete: totalSegments > 0 ? Math.round((completeCount / totalSegments) * 100) : 0,
  };

  // Get quality metrics (comments)
  const [commentStats] = await db
    .select({
      totalComments: sql<number>`count(*)::int`,
      unresolvedComments: sql<number>`count(*) filter (where ${segmentComments.resolved} = false)::int`,
    })
    .from(segmentComments)
    .where(
      inArray(
        segmentComments.segmentId,
        allSegments.map((s) => s.segments.id)
      )
    );

  // Calculate timeline
  const now = new Date();
  const deadline = project.deadline ? new Date(project.deadline) : null;
  const daysRemaining = deadline
    ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    projectId: project.id,
    projectName: project.name,
    sourceLanguage: project.sourceLanguage,
    targetLanguage: project.targetLanguage,
    totalDocuments: projectDocs.length,
    totalSegments,
    totalSourceWords,
    totalTargetWords,
    segmentsByStatus,
    progressPercentage,
    qualityMetrics: {
      totalQAIssues: 0, // TODO: Add QA issue tracking
      totalComments: commentStats?.totalComments ?? 0,
      unresolvedComments: commentStats?.unresolvedComments ?? 0,
    },
    timeline: {
      createdAt: project.createdAt,
      deadline,
      daysRemaining,
      isOverdue: daysRemaining !== null && daysRemaining < 0,
    },
  };
}

// ============ User Productivity ============

/**
 * Get productivity metrics for a user within a project
 */
export async function getUserProductivity(
  userId: string,
  projectId: string,
  startDate?: Date,
  endDate?: Date
): Promise<UserProductivity> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user) {
    throw new Error('User not found');
  }

  // Get all segments modified by this user in the project
  const projectDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.projectId, projectId)));

  const docIds = projectDocs.map((d) => d.id);

  // Build date filter
  const dateFilters = [];
  if (startDate) {
    dateFilters.push(gte(segmentHistory.changedAt, startDate));
  }
  if (endDate) {
    dateFilters.push(lte(segmentHistory.changedAt, endDate));
  }

  // Get segment history for this user
  const history = await db
    .select()
    .from(segmentHistory)
    .innerJoin(segments, eq(segmentHistory.segmentId, segments.id))
    .where(
      and(
        eq(segmentHistory.changedBy, userId),
        inArray(segments.documentId, docIds),
        ...dateFilters
      )
    )
    .orderBy(asc(segmentHistory.changedAt));

  // Calculate statistics
  let segmentsTranslated = 0;
  let wordsTranslated = 0;
  let segmentsReviewed = 0;
  let wordsReviewed = 0;

  const seenSegments = new Set<string>();
  const dailyActivity = new Map<string, number>();

  for (const entry of history) {
    const segment = entry.segments;
    const hist = entry.segment_history;

    // Count unique segments
    if (!seenSegments.has(segment.id)) {
      seenSegments.add(segment.id);

      if (hist.status === 'translated') {
        segmentsTranslated++;
        wordsTranslated += hist.targetText ? hist.targetText.split(/\s+/).filter(Boolean).length : 0;
      } else if (hist.status === 'reviewed_1' || hist.status === 'reviewed_2') {
        segmentsReviewed++;
        wordsReviewed += hist.targetText ? hist.targetText.split(/\s+/).filter(Boolean).length : 0;
      }
    }

    // Track daily activity
    if (hist.changedAt) {
      const dateKey = hist.changedAt.toISOString().split('T')[0] || '';
      if (dateKey) {
        dailyActivity.set(dateKey, (dailyActivity.get(dateKey) || 0) + 1);
      }
    }
  }

  // Get comment count
  const [commentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(segmentComments)
    .innerJoin(segments, eq(segmentComments.segmentId, segments.id))
    .where(
      and(
        eq(segmentComments.userId, userId),
        inArray(segments.documentId, docIds)
      )
    );

  // Find most active day
  let mostActiveDay: string | null = null;
  let maxActivity = 0;
  for (const [date, count] of dailyActivity.entries()) {
    if (count > maxActivity) {
      maxActivity = count;
      mostActiveDay = date;
    }
  }

  // Calculate productivity metrics
  const activeDays = dailyActivity.size;
  const wordsPerDay = activeDays > 0 ? Math.round(wordsTranslated / activeDays) : 0;
  const segmentsPerDay = activeDays > 0 ? Math.round(segmentsTranslated / activeDays) : 0;

  // Get last activity
  const lastActivity: Date | null = history.length > 0 ? (history[history.length - 1]?.segment_history?.changedAt || null) : null;

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    role: 'translator', // TODO: Get actual role from project membership
    statistics: {
      segmentsTranslated,
      wordsTranslated,
      segmentsReviewed,
      wordsReviewed,
      commentsAdded: commentCount?.count ?? 0,
      avgTimePerSegment: null, // TODO: Calculate based on timestamp differences
      mostActiveDay,
      lastActivity,
    },
    productivity: {
      wordsPerDay,
      segmentsPerDay,
      activeDays,
    },
  };
}

// ============ Document Analytics ============

/**
 * Get analytics for a specific document
 */
export async function getDocumentAnalytics(documentId: string): Promise<DocumentAnalytics> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc) {
    throw new Error('Document not found');
  }

  const segmentsList = await listDocumentSegments(documentId);

  const totalSegments = segmentsList.length;
  const sourceWords = doc.sourceWordCount || 0;
  const targetWords = doc.targetWordCount || 0;

  // Calculate completion percentage
  const completedSegments = segmentsList.filter(
    (s) => s.status === 'translated' || s.status === 'reviewed_1' || s.status === 'reviewed_2' || s.status === 'locked'
  ).length;
  const completionPercentage = totalSegments > 0 ? Math.round((completedSegments / totalSegments) * 100) : 0;

  // Get comment count
  const [commentStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(segmentComments)
    .where(
      inArray(
        segmentComments.segmentId,
        segmentsList.map((s) => s.id)
      )
    );

  // Get contributors from segment history
  const contributors = await db
    .select({
      userId: users.id,
      userName: users.name,
      segmentCount: sql<number>`count(distinct ${segmentHistory.segmentId})::int`,
    })
    .from(segmentHistory)
    .innerJoin(users, eq(segmentHistory.changedBy, users.id))
    .where(
      inArray(
        segmentHistory.segmentId,
        segmentsList.map((s) => s.id)
      )
    )
    .groupBy(users.id, users.name);

  return {
    documentId: doc.id,
    documentName: doc.name,
    totalSegments,
    sourceWords,
    targetWords,
    completionPercentage,
    averageMatchPercentage: 0, // TODO: Calculate from TM matches
    mtUsageCount: 0, // TODO: Track MT usage
    qaIssueCount: 0, // TODO: Track QA issues
    commentCount: commentStats?.count ?? 0,
    timeSpent: null, // TODO: Calculate from segment history timestamps
    contributors: contributors.map((c) => ({
      userId: c.userId,
      userName: c.userName,
      role: 'contributor', // TODO: Get actual role
      segmentsContributed: c.segmentCount,
    })),
  };
}

// ============ Project Timeline ============

/**
 * Get project activity timeline (daily breakdown)
 */
export async function getProjectTimeline(
  projectId: string,
  startDate?: Date,
  endDate?: Date
): Promise<ProjectTimeline[]> {
  const projectDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.projectId, projectId)));

  const docIds = projectDocs.map((d) => d.id);

  const dateFilters = [];
  if (startDate) {
    dateFilters.push(gte(segmentHistory.changedAt, startDate));
  }
  if (endDate) {
    dateFilters.push(lte(segmentHistory.changedAt, endDate));
  }

  // Get daily activity
  const timeline = await db
    .select({
      date: sql<string>`date(${segmentHistory.changedAt})`,
      segmentsCompleted: sql<number>`count(distinct ${segmentHistory.segmentId})::int`,
      wordsTranslated: sql<number>`sum(length(${segmentHistory.targetText}) - length(trim(${segmentHistory.targetText})) + 1)::int`,
      activeUsers: sql<number>`count(distinct ${segmentHistory.changedBy})::int`,
    })
    .from(segmentHistory)
    .innerJoin(segments, eq(segmentHistory.segmentId, segments.id))
    .where(and(inArray(segments.documentId, docIds), ...dateFilters))
    .groupBy(sql`date(${segmentHistory.changedAt})`)
    .orderBy(asc(sql`date(${segmentHistory.changedAt})`));

  // Get daily comment counts
  const commentTimeline = await db
    .select({
      date: sql<string>`date(${segmentComments.createdAt})`,
      commentsAdded: sql<number>`count(*)::int`,
    })
    .from(segmentComments)
    .innerJoin(segments, eq(segmentComments.segmentId, segments.id))
    .where(
      and(
        inArray(segments.documentId, docIds),
        ...dateFilters.map((f) =>
          f.toString().includes('segment_history')
            ? sql`date(${segmentComments.createdAt}) ${f.toString().split('segment_history.created_at')[1]}`
            : f
        )
      )
    )
    .groupBy(sql`date(${segmentComments.createdAt})`)
    .orderBy(asc(sql`date(${segmentComments.createdAt})`));

  // Merge timelines
  const commentMap = new Map(commentTimeline.map((c) => [c.date, c.commentsAdded]));

  return timeline.map((t) => ({
    date: t.date,
    segmentsCompleted: t.segmentsCompleted,
    wordsTranslated: t.wordsTranslated || 0,
    commentsAdded: commentMap.get(t.date) || 0,
    activeUsers: t.activeUsers,
  }));
}
