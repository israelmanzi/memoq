/**
 * Analytics Service
 * Provides project statistics, leverage analysis, productivity metrics, and reporting
 */

import { eq, and, sql, asc, gte, lte, inArray } from 'drizzle-orm';
import {
  db,
  documents,
  segments,
  projectResources,
  users,
  segmentComments,
  projectMembers,
  orgMemberships,
} from '../db/index.js';
import { listDocumentSegments, findProjectById } from './project.service.js';
import { findMatches } from './tm.service.js';

// Helper to format role for display
function formatRole(role: string): string {
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  tmMatchCount: number;
  aiTranslationCount: number;
  mtUsageCount: number; // Kept for backward compatibility
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
        eq(projectResources.resourceType, 'tm')
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

  // Get all segments for documents in this project
  const docIds = projectDocs.map((d) => d.id);

  // Handle empty project case
  if (docIds.length === 0) {
    return {
      projectId: project.id,
      projectName: project.name,
      sourceLanguage: project.sourceLanguage,
      targetLanguage: project.targetLanguage,
      totalDocuments: 0,
      totalSegments: 0,
      totalSourceWords: 0,
      totalTargetWords: 0,
      segmentsByStatus: {
        untranslated: 0,
        draft: 0,
        translated: 0,
        reviewed1: 0,
        reviewed2: 0,
        locked: 0,
      },
      progressPercentage: {
        translation: 0,
        review1: 0,
        review2: 0,
        complete: 0,
      },
      qualityMetrics: {
        totalQAIssues: 0,
        totalComments: 0,
        unresolvedComments: 0,
      },
      timeline: {
        createdAt: project.createdAt,
        deadline: project.deadline ? new Date(project.deadline) : null,
        daysRemaining: project.deadline
          ? Math.ceil((new Date(project.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          : null,
        isOverdue: project.deadline
          ? Math.ceil((new Date(project.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) < 0
          : false,
      },
    };
  }

  const allSegments = await db
    .select()
    .from(segments)
    .innerJoin(documents, eq(segments.documentId, documents.id))
    .where(inArray(segments.documentId, docIds));

  const totalSegments = allSegments.length;
  let totalSourceWords = 0;
  let totalTargetWords = 0;

  // Count segments by status (use underscore keys to match actual status values)
  const segmentsByStatusInternal: Record<string, number> = {
    untranslated: 0,
    draft: 0,
    translated: 0,
    reviewed_1: 0,
    reviewed_2: 0,
    locked: 0,
  };

  for (const { segments: segment } of allSegments) {
    const sourceWords = segment.sourceText.split(/\s+/).filter(Boolean).length;
    const targetWords = segment.targetText ? segment.targetText.split(/\s+/).filter(Boolean).length : 0;
    totalSourceWords += sourceWords;
    totalTargetWords += targetWords;

    const status = segment.status ?? 'untranslated';
    if (status in segmentsByStatusInternal && segmentsByStatusInternal[status] !== undefined) {
      segmentsByStatusInternal[status] = segmentsByStatusInternal[status] + 1;
    }
  }

  // Map to API response format (without underscores for cleaner JSON keys)
  const segmentsByStatus = {
    untranslated: segmentsByStatusInternal.untranslated ?? 0,
    draft: segmentsByStatusInternal.draft ?? 0,
    translated: segmentsByStatusInternal.translated ?? 0,
    reviewed1: segmentsByStatusInternal.reviewed_1 ?? 0,
    reviewed2: segmentsByStatusInternal.reviewed_2 ?? 0,
    locked: segmentsByStatusInternal.locked ?? 0,
  };

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
  const segmentIds = allSegments.map((s) => s.segments.id);
  let commentStats: { totalComments: number; unresolvedComments: number } | undefined;

  if (segmentIds.length > 0) {
    [commentStats] = await db
      .select({
        totalComments: sql<number>`count(*)::int`,
        unresolvedComments: sql<number>`count(*) filter (where ${segmentComments.resolved} = false)::int`,
      })
      .from(segmentComments)
      .where(inArray(segmentComments.segmentId, segmentIds));
  }

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

  // If no documents, return empty productivity
  if (docIds.length === 0) {
    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: 'Member',
      statistics: {
        segmentsTranslated: 0,
        wordsTranslated: 0,
        segmentsReviewed: 0,
        wordsReviewed: 0,
        commentsAdded: 0,
        avgTimePerSegment: null,
        mostActiveDay: null,
        lastActivity: null,
      },
      productivity: {
        wordsPerDay: 0,
        segmentsPerDay: 0,
        activeDays: 0,
      },
    };
  }

  // Query segments directly using translatedBy/reviewedBy fields (not segmentHistory which may be empty)
  // Get segments translated by this user
  const translatedSegments = await db
    .select()
    .from(segments)
    .where(
      and(
        eq(segments.translatedBy, userId),
        inArray(segments.documentId, docIds),
        ...(startDate ? [gte(segments.translatedAt, startDate)] : []),
        ...(endDate ? [lte(segments.translatedAt, endDate)] : [])
      )
    );

  // Get segments reviewed by this user
  const reviewedSegments = await db
    .select()
    .from(segments)
    .where(
      and(
        eq(segments.reviewedBy, userId),
        inArray(segments.documentId, docIds),
        ...(startDate ? [gte(segments.reviewedAt, startDate)] : []),
        ...(endDate ? [lte(segments.reviewedAt, endDate)] : [])
      )
    );

  // Calculate statistics
  let segmentsTranslated = translatedSegments.length;
  let wordsTranslated = 0;
  let segmentsReviewed = reviewedSegments.length;
  let wordsReviewed = 0;

  const dailyActivity = new Map<string, number>();

  for (const segment of translatedSegments) {
    wordsTranslated += segment.targetText ? segment.targetText.split(/\s+/).filter(Boolean).length : 0;

    // Track daily activity
    if (segment.translatedAt) {
      const dateKey = segment.translatedAt.toISOString().split('T')[0] || '';
      if (dateKey) {
        dailyActivity.set(dateKey, (dailyActivity.get(dateKey) || 0) + 1);
      }
    }
  }

  for (const segment of reviewedSegments) {
    wordsReviewed += segment.targetText ? segment.targetText.split(/\s+/).filter(Boolean).length : 0;

    // Track daily activity
    if (segment.reviewedAt) {
      const dateKey = segment.reviewedAt.toISOString().split('T')[0] || '';
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

  // Get last activity (most recent translatedAt or reviewedAt)
  let lastActivity: Date | null = null;
  for (const segment of translatedSegments) {
    if (segment.translatedAt && (!lastActivity || segment.translatedAt > lastActivity)) {
      lastActivity = segment.translatedAt;
    }
  }
  for (const segment of reviewedSegments) {
    if (segment.reviewedAt && (!lastActivity || segment.reviewedAt > lastActivity)) {
      lastActivity = segment.reviewedAt;
    }
  }

  // Get user's role from project membership or org membership
  const project = await findProjectById(projectId);
  let role = 'Member';

  if (project) {
    // Check project membership first
    const [projectMember] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));

    if (projectMember) {
      role = formatRole(projectMember.role);
    } else {
      // Fall back to org membership
      const [orgMember] = await db
        .select({ role: orgMemberships.role })
        .from(orgMemberships)
        .where(and(eq(orgMemberships.orgId, project.orgId), eq(orgMemberships.userId, userId)));

      if (orgMember) {
        role = formatRole(orgMember.role);
      }
    }
  }

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    role,
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

  // Get contributors from segments (translatedBy and reviewedBy fields)
  const segmentIds = segmentsList.map((s) => s.id);

  // Get unique contributors (translators)
  const translatorContributions = segmentIds.length > 0 ? await db
    .select({
      userId: users.id,
      userName: users.name,
      segmentCount: sql<number>`count(*)::int`,
    })
    .from(segments)
    .innerJoin(users, eq(segments.translatedBy, users.id))
    .where(inArray(segments.id, segmentIds))
    .groupBy(users.id, users.name) : [];

  // Get unique contributors (reviewers)
  const reviewerContributions = segmentIds.length > 0 ? await db
    .select({
      userId: users.id,
      userName: users.name,
      segmentCount: sql<number>`count(*)::int`,
    })
    .from(segments)
    .innerJoin(users, eq(segments.reviewedBy, users.id))
    .where(inArray(segments.id, segmentIds))
    .groupBy(users.id, users.name) : [];

  // Merge contributions from both sources
  const contributorMap = new Map<string, { userId: string; userName: string; segmentCount: number }>();
  for (const c of translatorContributions) {
    contributorMap.set(c.userId, { userId: c.userId, userName: c.userName, segmentCount: c.segmentCount });
  }
  for (const c of reviewerContributions) {
    const existing = contributorMap.get(c.userId);
    if (existing) {
      existing.segmentCount += c.segmentCount;
    } else {
      contributorMap.set(c.userId, { userId: c.userId, userName: c.userName, segmentCount: c.segmentCount });
    }
  }
  const contributors = Array.from(contributorMap.values());

  // Calculate match statistics from tracked data
  const segmentsWithTmMatch = segmentsList.filter((s) => s.matchSource === 'tm' && s.matchPercent);
  const segmentsWithAiTranslation = segmentsList.filter((s) => s.matchSource === 'ai');

  const averageMatchPercentage = segmentsWithTmMatch.length > 0
    ? Math.round(segmentsWithTmMatch.reduce((sum, s) => sum + (s.matchPercent || 0), 0) / segmentsWithTmMatch.length)
    : 0;

  // Get project info for role lookup
  const project = await findProjectById(doc.projectId);

  // Get roles for all contributors
  const contributorsWithRoles = await Promise.all(
    contributors.map(async (c) => {
      let role = 'Contributor';

      if (project) {
        // Check project membership first
        const [projectMember] = await db
          .select({ role: projectMembers.role })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, doc.projectId), eq(projectMembers.userId, c.userId)));

        if (projectMember) {
          role = formatRole(projectMember.role);
        } else {
          // Fall back to org membership
          const [orgMember] = await db
            .select({ role: orgMemberships.role })
            .from(orgMemberships)
            .where(and(eq(orgMemberships.orgId, project.orgId), eq(orgMemberships.userId, c.userId)));

          if (orgMember) {
            role = formatRole(orgMember.role);
          }
        }
      }

      return {
        userId: c.userId,
        userName: c.userName,
        role,
        segmentsContributed: c.segmentCount,
      };
    })
  );

  return {
    documentId: doc.id,
    documentName: doc.name,
    totalSegments,
    sourceWords,
    targetWords,
    completionPercentage,
    averageMatchPercentage,
    tmMatchCount: segmentsWithTmMatch.length,
    aiTranslationCount: segmentsWithAiTranslation.length,
    mtUsageCount: segmentsWithAiTranslation.length, // Keep for backward compatibility
    qaIssueCount: 0, // TODO: Track QA issues
    commentCount: commentStats?.count ?? 0,
    timeSpent: null, // TODO: Calculate from segment history timestamps
    contributors: contributorsWithRoles,
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

  if (docIds.length === 0) {
    return [];
  }

  // Build date filters for segments
  const translatedDateFilters = [];
  const reviewedDateFilters = [];
  const commentDateFilters = [];

  if (startDate) {
    translatedDateFilters.push(gte(segments.translatedAt, startDate));
    reviewedDateFilters.push(gte(segments.reviewedAt, startDate));
    commentDateFilters.push(gte(segmentComments.createdAt, startDate));
  }
  if (endDate) {
    translatedDateFilters.push(lte(segments.translatedAt, endDate));
    reviewedDateFilters.push(lte(segments.reviewedAt, endDate));
    commentDateFilters.push(lte(segmentComments.createdAt, endDate));
  }

  // Get daily translation activity
  const translationTimeline = await db
    .select({
      date: sql<string>`date(${segments.translatedAt})`,
      segmentsCompleted: sql<number>`count(*)::int`,
      wordsTranslated: sql<number>`coalesce(sum(array_length(regexp_split_to_array(${segments.targetText}, '\\s+'), 1)), 0)::int`,
      activeUsers: sql<number>`count(distinct ${segments.translatedBy})::int`,
    })
    .from(segments)
    .where(
      and(
        inArray(segments.documentId, docIds),
        sql`${segments.translatedAt} is not null`,
        ...translatedDateFilters
      )
    )
    .groupBy(sql`date(${segments.translatedAt})`)
    .orderBy(asc(sql`date(${segments.translatedAt})`));

  // Get daily review activity
  const reviewTimeline = await db
    .select({
      date: sql<string>`date(${segments.reviewedAt})`,
      segmentsReviewed: sql<number>`count(*)::int`,
      activeUsers: sql<number>`count(distinct ${segments.reviewedBy})::int`,
    })
    .from(segments)
    .where(
      and(
        inArray(segments.documentId, docIds),
        sql`${segments.reviewedAt} is not null`,
        ...reviewedDateFilters
      )
    )
    .groupBy(sql`date(${segments.reviewedAt})`)
    .orderBy(asc(sql`date(${segments.reviewedAt})`));

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
        ...commentDateFilters
      )
    )
    .groupBy(sql`date(${segmentComments.createdAt})`)
    .orderBy(asc(sql`date(${segmentComments.createdAt})`));

  // Merge all timelines into a single view
  const timelineMap = new Map<string, ProjectTimeline>();

  for (const t of translationTimeline) {
    if (t.date) {
      timelineMap.set(t.date, {
        date: t.date,
        segmentsCompleted: t.segmentsCompleted,
        wordsTranslated: t.wordsTranslated || 0,
        commentsAdded: 0,
        activeUsers: t.activeUsers,
      });
    }
  }

  for (const r of reviewTimeline) {
    if (r.date) {
      const existing = timelineMap.get(r.date);
      if (existing) {
        existing.segmentsCompleted += r.segmentsReviewed;
        // Combine unique active users (approximation)
        existing.activeUsers = Math.max(existing.activeUsers, r.activeUsers);
      } else {
        timelineMap.set(r.date, {
          date: r.date,
          segmentsCompleted: r.segmentsReviewed,
          wordsTranslated: 0,
          commentsAdded: 0,
          activeUsers: r.activeUsers,
        });
      }
    }
  }

  for (const c of commentTimeline) {
    if (c.date) {
      const existing = timelineMap.get(c.date);
      if (existing) {
        existing.commentsAdded = c.commentsAdded;
      } else {
        timelineMap.set(c.date, {
          date: c.date,
          segmentsCompleted: 0,
          wordsTranslated: 0,
          commentsAdded: c.commentsAdded,
          activeUsers: 1,
        });
      }
    }
  }

  // Sort by date and return
  return Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
