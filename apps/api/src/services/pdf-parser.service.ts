import { getDocumentProxy } from 'unpdf';
import { createHash } from 'crypto';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Position and dimensions of a text item in the PDF
 */
export interface PdfTextPosition {
  /** X coordinate (left edge) */
  x: number;
  /** Y coordinate (baseline) */
  y: number;
  /** Width of the text */
  width: number;
  /** Height of the text (font size) */
  height: number;
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Font name used */
  fontName?: string;
}

/**
 * Maps a segment to its source text positions in the PDF.
 * A segment may span multiple text items.
 */
export interface PdfSegmentMapping {
  segmentIndex: number;
  /** Positions of text items that make up this segment */
  positions: PdfTextPosition[];
  /** Original text (for verification) */
  originalText: string;
}

/** Legacy v1 metadata (no position tracking) */
export interface PdfStructureMetadataV1 {
  version: 1;
  pageCount: number;
}

/** V2 metadata with position tracking for layout preservation */
export interface PdfStructureMetadataV2 {
  version: 2;
  pageCount: number;
  /** Per-segment position mappings */
  segmentMappings: PdfSegmentMapping[];
  /** Page dimensions for each page */
  pageDimensions: Array<{ width: number; height: number }>;
  /** Hash of the PDF content for integrity */
  contentHash: string;
}

export type PdfStructureMetadata = PdfStructureMetadataV1 | PdfStructureMetadataV2;

export interface PdfParseResult {
  segments: Array<{ sourceText: string; targetText?: string }>;
  pageCount: number;
  structureMetadata: PdfStructureMetadataV2;
}

// ============================================================================
// Internal Types
// ============================================================================

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  pageNumber: number;
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse a PDF file and extract text segments with position metadata.
 * Returns v2 metadata with text positions for layout-preserving export.
 */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const data = new Uint8Array(buffer);

  // Create content hash for integrity verification
  const contentHash = createHash('sha256').update(buffer).digest('hex');

  const pdf = await getDocumentProxy(data);
  const pageCount = pdf.numPages;

  const allTextItems: TextItem[] = [];
  const pageDimensions: Array<{ width: number; height: number }> = [];

  // Extract text with positions from each page
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    pageDimensions.push({
      width: viewport.width,
      height: viewport.height,
    });

    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      // Skip non-text items
      if (!('str' in item) || !item.str.trim()) continue;

      const textItem = item as any;
      const transform = textItem.transform || [1, 0, 0, 1, 0, 0];

      // Extract position from transform matrix
      // transform = [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const x = transform[4] ?? 0;
      const y = transform[5] ?? 0;
      const height = Math.abs(transform[3]) || Math.abs(transform[0]) || 12; // Font size
      const width = textItem.width || item.str.length * height * 0.5;

      allTextItems.push({
        str: item.str,
        x,
        y,
        width,
        height,
        fontName: textItem.fontName || 'unknown',
        pageNumber: pageNum,
      });
    }
  }

  // Group text items into lines based on Y position
  const lines = groupIntoLines(allTextItems);

  // Build segments from lines with position tracking
  const segments: Array<{ sourceText: string }> = [];
  const segmentMappings: PdfSegmentMapping[] = [];
  let segmentIndex = 0;

  for (const line of lines) {
    const lineText = line.items.map(item => item.str).join(' ').trim();
    if (!lineText) continue;

    // Split line into sentences
    const sentences = splitIntoSentences(lineText);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      // Map sentence back to original text items
      const positions = mapSentenceToPositions(trimmed, line.items);

      segments.push({ sourceText: trimmed });
      segmentMappings.push({
        segmentIndex,
        positions,
        originalText: trimmed,
      });
      segmentIndex++;
    }
  }

  return {
    segments,
    pageCount,
    structureMetadata: {
      version: 2,
      pageCount,
      segmentMappings,
      pageDimensions,
      contentHash,
    },
  };
}

// ============================================================================
// Text Grouping
// ============================================================================

interface TextLine {
  y: number;
  pageNumber: number;
  items: TextItem[];
}

/**
 * Group text items into lines based on Y position.
 * Items on the same line (within tolerance) are grouped together.
 */
function groupIntoLines(items: TextItem[]): TextLine[] {
  if (items.length === 0) return [];

  // Sort by page, then by Y (descending - top to bottom), then by X
  const sorted = [...items].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    // PDF Y coordinates increase upward, so we want descending for top-to-bottom
    if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: TextLine[] = [];
  let currentLine: TextLine | null = null;
  const yTolerance = 5; // Pixels tolerance for same line

  for (const item of sorted) {
    if (
      !currentLine ||
      currentLine.pageNumber !== item.pageNumber ||
      Math.abs(currentLine.y - item.y) > yTolerance
    ) {
      // Start new line
      currentLine = {
        y: item.y,
        pageNumber: item.pageNumber,
        items: [],
      };
      lines.push(currentLine);
    }

    currentLine.items.push(item);
  }

  // Sort items within each line by X position
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
  }

  return lines;
}

/**
 * Map a sentence back to its source text positions.
 */
function mapSentenceToPositions(sentence: string, lineItems: TextItem[]): PdfTextPosition[] {
  const positions: PdfTextPosition[] = [];

  // Simple approach: find items that contain parts of the sentence
  let searchText = sentence;

  for (const item of lineItems) {
    if (!searchText) break;

    const itemText = item.str.trim();
    if (!itemText) continue;

    // Check if this item's text is part of what we're looking for
    const firstWord = searchText.split(' ')[0] || '';
    if (searchText.startsWith(itemText) || itemText.includes(firstWord)) {
      positions.push({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        pageNumber: item.pageNumber,
        fontName: item.fontName,
      });

      // Remove matched text from search
      if (searchText.startsWith(itemText)) {
        searchText = searchText.slice(itemText.length).trim();
      }
    }
  }

  // If we couldn't map precisely, use the first item's position as fallback
  if (positions.length === 0 && lineItems.length > 0) {
    const first = lineItems[0];
    if (first) {
      positions.push({
        x: first.x,
        y: first.y,
        width: first.width,
        height: first.height,
        pageNumber: first.pageNumber,
        fontName: first.fontName,
      });
    }
  }

  return positions;
}

// ============================================================================
// Sentence Splitting
// ============================================================================

/**
 * Split text into sentences using simple heuristics.
 */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Check for sentence end: punctuation followed by space and capital letter (or end)
    if (
      (text[i] === '.' || text[i] === '!' || text[i] === '?') &&
      (i + 1 >= text.length ||
        (text[i + 1] === ' ' && i + 2 < text.length && /[A-Z\u00C0-\u024F]/.test(text[i + 2] ?? '')))
    ) {
      sentences.push(current.trim());
      current = '';
      if (i + 1 < text.length && text[i + 1] === ' ') {
        i++; // Skip the space
      }
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  // If no sentence breaks found, return the whole text
  if (sentences.length === 0 && text.trim()) {
    return [text.trim()];
  }

  return sentences;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Type guard for v2 PDF metadata
 */
export function isPdfV2Metadata(metadata: any): metadata is PdfStructureMetadataV2 {
  return (
    metadata &&
    metadata.version === 2 &&
    Array.isArray(metadata.segmentMappings) &&
    Array.isArray(metadata.pageDimensions) &&
    typeof metadata.contentHash === 'string'
  );
}
