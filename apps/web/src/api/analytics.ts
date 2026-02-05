/**
 * Analytics API
 */

import { api } from './client';

// Leverage Analysis Types
export interface MatchDistribution {
  count: number;
  words: number;
  percentage: number;
}

export interface LeverageAnalysis {
  documentId: string;
  documentName: string;
  totalSegments: number;
  totalWords: number;
  matchDistribution: {
    exact: MatchDistribution; // 100%
    fuzzyHigh: MatchDistribution; // 95-99%
    fuzzyMid: MatchDistribution; // 85-94%
    fuzzyLow: MatchDistribution; // 75-84%
    noMatch: MatchDistribution; // <75%
    repetitions: MatchDistribution; // Duplicates
  };
  estimatedEffort: {
    exact: number;
    fuzzyHigh: number;
    fuzzyMid: number;
    fuzzyLow: number;
    noMatch: number;
    repetitions: number;
    totalWeightedWords: number;
  };
}

// Project Statistics Types
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
    createdAt: string;
    deadline: string | null;
    daysRemaining: number | null;
    isOverdue: boolean;
  };
}

// User Productivity Types
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
    avgTimePerSegment: number | null;
    mostActiveDay: string | null;
    lastActivity: string | null;
  };
  productivity: {
    wordsPerDay: number;
    segmentsPerDay: number;
    activeDays: number;
  };
}

// Document Analytics Types
export interface Contributor {
  userId: string;
  userName: string;
  role: string;
  segmentsContributed: number;
}

export interface DocumentAnalytics {
  documentId: string;
  documentName: string;
  totalSegments: number;
  sourceWords: number;
  targetWords: number;
  completionPercentage: number;
  averageMatchPercentage: number;
  tmMatchCount?: number; // Segments with TM matches
  aiTranslationCount?: number; // Segments translated by AI
  mtUsageCount: number; // Legacy field, kept for compatibility
  qaIssueCount: number;
  commentCount: number;
  timeSpent: number | null;
  contributors: Contributor[];
}

// Project Timeline Types
export interface ProjectTimelineEntry {
  date: string;
  segmentsCompleted: number;
  wordsTranslated: number;
  commentsAdded: number;
  activeUsers: number;
}

export const analyticsApi = {
  /**
   * Analyze TM leverage for a document
   */
  async analyzeLeverage(
    documentId: string,
    projectId: string
  ): Promise<LeverageAnalysis> {
    return api.post('/analytics/leverage-analysis', {
      documentId,
      projectId,
    });
  },

  /**
   * Get project statistics
   */
  async getProjectStatistics(projectId: string): Promise<ProjectStatistics> {
    return api.get(`/analytics/project/${projectId}/statistics`);
  },

  /**
   * Get user productivity metrics
   */
  async getUserProductivity(
    projectId: string,
    userId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<UserProductivity> {
    return api.post(`/analytics/project/${projectId}/productivity`, {
      userId,
      startDate,
      endDate,
    });
  },

  /**
   * Get team productivity metrics
   */
  async getTeamProductivity(projectId: string): Promise<UserProductivity[]> {
    return api.get(`/analytics/project/${projectId}/team-productivity`);
  },

  /**
   * Get document analytics
   */
  async getDocumentAnalytics(documentId: string): Promise<DocumentAnalytics> {
    return api.get(`/analytics/document/${documentId}/analytics`);
  },

  /**
   * Get project timeline
   */
  async getProjectTimeline(
    projectId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ProjectTimelineEntry[]> {
    return api.post(`/analytics/project/${projectId}/timeline`, {
      startDate,
      endDate,
    });
  },
};
