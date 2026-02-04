/**
 * QA (Quality Assurance) API
 */

import { api } from './client';

export type QACheckType =
  | 'empty_target'
  | 'numbers_mismatch'
  | 'punctuation_mismatch'
  | 'terminology_mismatch'
  | 'length_difference'
  | 'untranslated';

export type QASeverity = 'error' | 'warning' | 'info';

export interface QAIssue {
  type: QACheckType;
  severity: QASeverity;
  message: string;
  details?: {
    expected?: string;
    found?: string;
    position?: number;
  };
}

export interface QACheckResult {
  segmentId: string;
  segmentIndex: number;
  issues: QAIssue[];
  passed: boolean;
}

export interface QADocumentResult {
  documentId: string;
  totalSegments: number;
  segmentsWithIssues: number;
  totalIssues: number;
  issuesByType: Record<QACheckType, number>;
  issuesBySeverity: Record<QASeverity, number>;
  results: QACheckResult[];
}

export interface QACheckOptions {
  checkEmptyTarget?: boolean;
  checkNumbers?: boolean;
  checkPunctuation?: boolean;
  checkTerminology?: boolean;
  checkLength?: boolean;
  checkUntranslated?: boolean;
  maxLengthDifferencePercent?: number;
}

export const qaApi = {
  /**
   * Run QA checks on a document
   */
  async checkDocument(
    documentId: string,
    options?: QACheckOptions
  ): Promise<QADocumentResult> {
    return api.post(`/qa/document/${documentId}`, options || {});
  },

  /**
   * Run QA check on a single segment
   */
  async checkSegment(
    segmentId: string,
    options?: QACheckOptions
  ): Promise<QACheckResult> {
    return api.post('/qa/segment', { segmentId, options });
  },
};

/**
 * Get display label for QA check type
 */
export function getQACheckTypeLabel(type: QACheckType): string {
  const labels: Record<QACheckType, string> = {
    empty_target: 'Empty Target',
    numbers_mismatch: 'Numbers Mismatch',
    punctuation_mismatch: 'Punctuation',
    terminology_mismatch: 'Terminology',
    length_difference: 'Length Difference',
    untranslated: 'Untranslated',
  };
  return labels[type] || type;
}

/**
 * Get severity color class
 */
export function getQASeverityColor(severity: QASeverity): string {
  switch (severity) {
    case 'error':
      return 'text-danger';
    case 'warning':
      return 'text-warning';
    case 'info':
      return 'text-text-secondary';
    default:
      return 'text-text';
  }
}

/**
 * Get severity background color class
 */
export function getQASeverityBgColor(severity: QASeverity): string {
  switch (severity) {
    case 'error':
      return 'bg-danger-bg';
    case 'warning':
      return 'bg-warning-bg';
    case 'info':
      return 'bg-surface-panel';
    default:
      return 'bg-surface';
  }
}
