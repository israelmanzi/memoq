/**
 * QA (Quality Assurance) Checks Service
 *
 * Provides automated quality checks for translation segments:
 * - Empty target
 * - Numbers mismatch
 * - Punctuation mismatch
 * - Terminology consistency
 * - Length difference
 */

import { logger } from '../config/logger.js';

// ============================================================================
// Types
// ============================================================================

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
  terminology?: Array<{ source: string; target: string }>;
}

export interface SegmentForQA {
  id: string;
  segmentIndex: number;
  sourceText: string;
  targetText: string | null;
  status?: string;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<QACheckOptions, 'terminology'>> & { terminology: Array<{ source: string; target: string }> } = {
  checkEmptyTarget: true,
  checkNumbers: true,
  checkPunctuation: true,
  checkTerminology: true,
  checkLength: true,
  checkUntranslated: true,
  maxLengthDifferencePercent: 50,
  terminology: [],
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract numbers from text (including decimals and formatted numbers)
 */
function extractNumbers(text: string): string[] {
  // Match various number formats: 123, 1,234, 1.234, 12.34, etc.
  const matches = text.match(/\d+([.,]\d+)*/g) || [];
  // Normalize: remove thousand separators, keep decimals
  return matches.map(n => n.replace(/,(?=\d{3})/g, ''));
}

/**
 * Extract ending punctuation from text
 */
function getEndingPunctuation(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const lastChar = trimmed[trimmed.length - 1];
  if (lastChar && /[.!?。！？،؟:;]/.test(lastChar)) {
    return lastChar;
  }
  return null;
}

/**
 * Check if text looks untranslated (same as source or very similar)
 */
function looksUntranslated(source: string, target: string): boolean {
  const normalizedSource = source.toLowerCase().trim();
  const normalizedTarget = target.toLowerCase().trim();

  // Exact match
  if (normalizedSource === normalizedTarget) {
    return true;
  }

  // Very high similarity (> 95%)
  const similarity = calculateSimilarity(normalizedSource, normalizedTarget);
  return similarity > 0.95;
}

/**
 * Simple similarity calculation (Jaccard-ish for words)
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Calculate word count for a text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ============================================================================
// QA Check Functions
// ============================================================================

/**
 * Check for empty target
 */
function checkEmptyTarget(segment: SegmentForQA): QAIssue | null {
  if (!segment.targetText || segment.targetText.trim() === '') {
    return {
      type: 'empty_target',
      severity: 'error',
      message: 'Target text is empty',
    };
  }
  return null;
}

/**
 * Check for numbers mismatch
 */
function checkNumbers(segment: SegmentForQA): QAIssue | null {
  if (!segment.targetText) return null;

  const sourceNumbers = extractNumbers(segment.sourceText);
  const targetNumbers = extractNumbers(segment.targetText);

  // Check if all source numbers are in target
  const missingNumbers = sourceNumbers.filter(n => !targetNumbers.includes(n));
  const extraNumbers = targetNumbers.filter(n => !sourceNumbers.includes(n));

  if (missingNumbers.length > 0 || extraNumbers.length > 0) {
    return {
      type: 'numbers_mismatch',
      severity: 'warning',
      message: 'Numbers in source and target do not match',
      details: {
        expected: sourceNumbers.join(', ') || '(none)',
        found: targetNumbers.join(', ') || '(none)',
      },
    };
  }
  return null;
}

/**
 * Check for punctuation mismatch (ending punctuation)
 */
function checkPunctuation(segment: SegmentForQA): QAIssue | null {
  if (!segment.targetText) return null;

  const sourcePunct = getEndingPunctuation(segment.sourceText);
  const targetPunct = getEndingPunctuation(segment.targetText);

  // Only flag if source has punctuation but target doesn't (or vice versa)
  // Different punctuation marks are often OK in different languages
  if (sourcePunct && !targetPunct) {
    return {
      type: 'punctuation_mismatch',
      severity: 'info',
      message: 'Target is missing ending punctuation',
      details: {
        expected: sourcePunct,
        found: '(none)',
      },
    };
  }

  if (!sourcePunct && targetPunct) {
    return {
      type: 'punctuation_mismatch',
      severity: 'info',
      message: 'Target has ending punctuation but source does not',
      details: {
        expected: '(none)',
        found: targetPunct,
      },
    };
  }

  return null;
}

/**
 * Check for terminology consistency
 */
function checkTerminology(
  segment: SegmentForQA,
  terminology: Array<{ source: string; target: string }>
): QAIssue[] {
  if (!segment.targetText || terminology.length === 0) return [];

  const issues: QAIssue[] = [];
  const sourceLower = segment.sourceText.toLowerCase();
  const targetLower = segment.targetText.toLowerCase();

  for (const term of terminology) {
    const sourceTermLower = term.source.toLowerCase();
    const targetTermLower = term.target.toLowerCase();

    // Check if source contains the source term
    if (sourceLower.includes(sourceTermLower)) {
      // Check if target contains the expected target term
      if (!targetLower.includes(targetTermLower)) {
        issues.push({
          type: 'terminology_mismatch',
          severity: 'warning',
          message: `Terminology: "${term.source}" should be translated as "${term.target}"`,
          details: {
            expected: term.target,
          },
        });
      }
    }
  }

  return issues;
}

/**
 * Check for significant length difference
 */
function checkLength(segment: SegmentForQA, maxDifferencePercent: number): QAIssue | null {
  if (!segment.targetText) return null;

  const sourceWords = countWords(segment.sourceText);
  const targetWords = countWords(segment.targetText);

  if (sourceWords === 0) return null;

  const difference = Math.abs(targetWords - sourceWords);
  const percentDifference = (difference / sourceWords) * 100;

  if (percentDifference > maxDifferencePercent) {
    return {
      type: 'length_difference',
      severity: 'info',
      message: `Target length differs significantly from source (${Math.round(percentDifference)}% difference)`,
      details: {
        expected: `~${sourceWords} words`,
        found: `${targetWords} words`,
      },
    };
  }

  return null;
}

/**
 * Check if segment looks untranslated
 */
function checkUntranslated(segment: SegmentForQA): QAIssue | null {
  if (!segment.targetText) return null;

  if (looksUntranslated(segment.sourceText, segment.targetText)) {
    return {
      type: 'untranslated',
      severity: 'warning',
      message: 'Target text appears to be untranslated (same as source)',
    };
  }

  return null;
}

// ============================================================================
// Main QA Functions
// ============================================================================

/**
 * Run QA checks on a single segment
 */
export function checkSegment(
  segment: SegmentForQA,
  options: QACheckOptions = {}
): QACheckResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const issues: QAIssue[] = [];

  // Run enabled checks
  if (opts.checkEmptyTarget) {
    const issue = checkEmptyTarget(segment);
    if (issue) issues.push(issue);
  }

  // Only run these checks if target is not empty
  if (segment.targetText && segment.targetText.trim()) {
    if (opts.checkNumbers) {
      const issue = checkNumbers(segment);
      if (issue) issues.push(issue);
    }

    if (opts.checkPunctuation) {
      const issue = checkPunctuation(segment);
      if (issue) issues.push(issue);
    }

    if (opts.checkTerminology && opts.terminology.length > 0) {
      const termIssues = checkTerminology(segment, opts.terminology);
      issues.push(...termIssues);
    }

    if (opts.checkLength) {
      const issue = checkLength(segment, opts.maxLengthDifferencePercent);
      if (issue) issues.push(issue);
    }

    if (opts.checkUntranslated) {
      const issue = checkUntranslated(segment);
      if (issue) issues.push(issue);
    }
  }

  return {
    segmentId: segment.id,
    segmentIndex: segment.segmentIndex,
    issues,
    passed: issues.filter(i => i.severity === 'error').length === 0,
  };
}

/**
 * Run QA checks on all segments in a document
 */
export function checkDocument(
  documentId: string,
  segments: SegmentForQA[],
  options: QACheckOptions = {}
): QADocumentResult {
  logger.info({ documentId, segmentCount: segments.length }, 'Running QA checks on document');

  const results: QACheckResult[] = [];
  const issuesByType: Record<QACheckType, number> = {
    empty_target: 0,
    numbers_mismatch: 0,
    punctuation_mismatch: 0,
    terminology_mismatch: 0,
    length_difference: 0,
    untranslated: 0,
  };
  const issuesBySeverity: Record<QASeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };

  let totalIssues = 0;
  let segmentsWithIssues = 0;

  for (const segment of segments) {
    const result = checkSegment(segment, options);
    results.push(result);

    if (result.issues.length > 0) {
      segmentsWithIssues++;
      totalIssues += result.issues.length;

      for (const issue of result.issues) {
        issuesByType[issue.type]++;
        issuesBySeverity[issue.severity]++;
      }
    }
  }

  logger.info({
    documentId,
    totalSegments: segments.length,
    segmentsWithIssues,
    totalIssues,
    errors: issuesBySeverity.error,
    warnings: issuesBySeverity.warning,
  }, 'QA checks complete');

  return {
    documentId,
    totalSegments: segments.length,
    segmentsWithIssues,
    totalIssues,
    issuesByType,
    issuesBySeverity,
    results,
  };
}

/**
 * Get a summary of QA issues for display
 */
export function getQASummary(result: QADocumentResult): string {
  const parts: string[] = [];

  if (result.issuesBySeverity.error > 0) {
    parts.push(`${result.issuesBySeverity.error} error(s)`);
  }
  if (result.issuesBySeverity.warning > 0) {
    parts.push(`${result.issuesBySeverity.warning} warning(s)`);
  }
  if (result.issuesBySeverity.info > 0) {
    parts.push(`${result.issuesBySeverity.info} info`);
  }

  if (parts.length === 0) {
    return 'All checks passed';
  }

  return parts.join(', ');
}
