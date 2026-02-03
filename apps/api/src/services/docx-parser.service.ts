import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'crypto';

// ============================================================================
// Interfaces
// ============================================================================

export interface DocxParagraphMeta {
  index: number;
  segmentIndices: number[];
  style?: string;
  formatting?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  };
}

/**
 * Location of a text node within the DOCX XML structure.
 * Uses indices for reliable lookup during in-place replacement.
 */
export interface TextNodeLocation {
  /** Index of the paragraph (w:p) within w:body, 0-based */
  paragraphIndex: number;
  /** Index of the run (w:r) within the paragraph, 0-based */
  runIndex: number;
  /** Index of the text element (w:t) within the run, 0-based */
  textIndex: number;
  /** Character offset within this w:t where the segment text starts */
  charStart: number;
  /** Character offset within this w:t where the segment text ends */
  charEnd: number;
  /** Whether this node has xml:space="preserve" */
  preserveSpace?: boolean;
}

/**
 * Represents a line break (w:br) element within a run.
 */
export interface LineBreakLocation {
  /** Index of the paragraph (w:p) within w:body, 0-based */
  paragraphIndex: number;
  /** Index of the run (w:r) within the paragraph, 0-based */
  runIndex: number;
  /** Index of the w:br element within the run, 0-based */
  breakIndex: number;
  /** Character offset in the combined paragraph text where this break occurs */
  charOffset: number;
}

/**
 * Maps a segment to its source text node locations.
 * A segment may span multiple text nodes (runs) due to inline formatting.
 */
export interface SegmentTextMapping {
  /** Segment index (matches segments table segmentIndex) */
  segmentIndex: number;
  /** Ordered list of text node locations that comprise this segment */
  textNodes: TextNodeLocation[];
  /** The original extracted text (for verification during export) */
  originalText: string;
  /** Line breaks within this segment (relative to segment start) */
  lineBreaks?: LineBreakLocation[];
  /** Leading whitespace that was trimmed (to restore on export) */
  leadingWhitespace?: string;
  /** Trailing whitespace that was trimmed (to restore on export) */
  trailingWhitespace?: string;
}

/** Legacy v1 metadata format (for backwards compatibility) */
export interface DocxStructureMetadataV1 {
  version: 1;
  paragraphs: DocxParagraphMeta[];
}

/** New v2 metadata format with text node mappings for in-place replacement */
export interface DocxStructureMetadataV2 {
  version: 2;
  paragraphs: DocxParagraphMeta[];
  /** Per-segment text node mappings for in-place replacement */
  segmentMappings: SegmentTextMapping[];
  /** SHA-256 hash of original document.xml for integrity verification */
  documentXmlHash: string;
}

export type DocxStructureMetadata = DocxStructureMetadataV1 | DocxStructureMetadataV2;

export interface DocxParseResult {
  segments: Array<{ sourceText: string; targetText?: string }>;
  structureMetadata: DocxStructureMetadataV2;
}

// ============================================================================
// Internal Types
// ============================================================================

interface RunTextInfo {
  runIndex: number;
  textIndex: number;
  text: string;
  charStart: number; // Start offset in the combined paragraph text
  charEnd: number;   // End offset in the combined paragraph text
  preserveSpace?: boolean;
}

interface RunBreakInfo {
  runIndex: number;
  breakIndex: number;
  charOffset: number; // Offset in the combined paragraph text
}

interface ParagraphTextResult {
  text: string;
  runTexts: RunTextInfo[];
  lineBreaks: RunBreakInfo[];
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Recursively extract all paragraph elements from a node.
 * This handles text boxes (w:txbxContent), drawings, and nested structures
 * that LibreOffice creates when converting PDFs.
 */
function extractAllParagraphs(node: any, result: any[] = []): any[] {
  if (!node || typeof node !== 'object') return result;

  // If this is an array, process each element
  if (Array.isArray(node)) {
    for (const item of node) {
      extractAllParagraphs(item, result);
    }
    return result;
  }

  // Check for paragraph elements
  if (node['w:p']) {
    const paras = Array.isArray(node['w:p']) ? node['w:p'] : [node['w:p']];
    result.push(...paras);
  }

  // Recursively search all properties for nested paragraphs
  // This catches text boxes (w:txbxContent), drawings, shapes, etc.
  // Skip 'w:p' since we already processed it above
  for (const key of Object.keys(node)) {
    if (key.startsWith('@_') || key === 'w:p') continue; // Skip attributes and already-processed w:p

    const value = node[key];
    if (value && typeof value === 'object') {
      extractAllParagraphs(value, result);
    }
  }

  return result;
}

/**
 * Parse a DOCX file and extract text segments with structure metadata.
 * Returns v2 metadata with text node mappings for in-place replacement.
 */
export async function parseDocx(buffer: Buffer): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

  // Hash the original XML for integrity verification during export
  const documentXmlHash = createHash('sha256').update(documentXml).digest('hex');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    preserveOrder: false,
  });

  const doc = parser.parse(documentXml);

  // Navigate to document body
  const body = doc['w:document']?.['w:body'];
  if (!body) {
    throw new Error('Invalid DOCX: missing document body');
  }

  const segments: Array<{ sourceText: string }> = [];
  const paragraphs: DocxParagraphMeta[] = [];
  const segmentMappings: SegmentTextMapping[] = [];

  // Extract all paragraphs, including those in text boxes and nested structures
  // LibreOffice creates text boxes (w:txbxContent) when converting PDFs
  const paras = extractAllParagraphs(body);

  // Track seen paragraph texts to avoid duplicates
  // LibreOffice sometimes creates duplicate content in text boxes
  const seenParagraphTexts = new Set<string>();

  let segmentIndex = 0;

  for (let paraIndex = 0; paraIndex < paras.length; paraIndex++) {
    const para = paras[paraIndex];
    const { text: paraText, runTexts, lineBreaks: paraLineBreaks } = extractParagraphTextWithPositions(para);

    if (!paraText.trim()) {
      continue; // Skip empty paragraphs
    }

    // Skip non-translatable content
    const trimmedText = paraText.trim();

    // Skip duplicate paragraphs (LibreOffice sometimes creates duplicates in text boxes)
    if (seenParagraphTexts.has(trimmedText)) {
      continue;
    }
    seenParagraphTexts.add(trimmedText);

    // Skip page numbers (e.g., "1", "Page 1", "Page 1 of 5", "- 1 -", etc.)
    if (/^[-–—]?\s*\d+\s*[-–—]?$/.test(trimmedText) || // Just a number with optional dashes
        /^(Page|Pg\.?|P\.?)\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(trimmedText)) { // "Page X" or "Page X of Y"
      continue;
    }

    // Skip "preserve" markers and similar non-content
    if (/^(preserve|reserved?|placeholder)$/i.test(trimmedText)) {
      continue;
    }

    // Get paragraph style and formatting
    const pStyle = para['w:pPr']?.['w:pStyle']?.['@_w:val'];
    const formatting = extractParagraphFormatting(para);

    // Check if this is a heading - headings should be their own segment
    // Detection criteria:
    // 1. Has a heading style (Heading1, Heading2, Title, etc.)
    // 2. OR is bold AND short (less than 100 chars) AND doesn't end with sentence punctuation
    // 3. OR has larger font size (>= 28 half-points = 14pt) AND is short
    const hasHeadingStyle = pStyle && /^(Heading|Title|Subtitle|TOC|heading)/i.test(pStyle);
    const trimmedParaText = paraText.trim();
    const isShortText = trimmedParaText.length < 100;
    const noSentenceEnd = !trimmedParaText.match(/[.!?:;]$/);
    const isBoldHeading = formatting?.bold && isShortText && noSentenceEnd;
    const isLargeFontHeading = formatting?.fontSize && formatting.fontSize >= 28 && isShortText && noSentenceEnd;
    const isHeading = hasHeadingStyle || isBoldHeading || isLargeFontHeading;

    // Split paragraph into sentences (unless it's a heading)
    const sentences = isHeading ? [paraText] : splitIntoSentences(paraText);
    const segmentIndices: number[] = [];

    let searchOffset = 0;

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      // Find where this sentence appears in the paragraph text
      // Use the original (untrimmed) sentence to find exact position
      const originalStart = paraText.indexOf(sentence, searchOffset);
      const sentenceStart = originalStart !== -1 ? originalStart : paraText.indexOf(trimmedSentence, searchOffset);

      if (sentenceStart === -1) {
        // Fallback: sentence not found (shouldn't happen normally)
        segments.push({ sourceText: trimmedSentence });
        segmentMappings.push({
          segmentIndex,
          textNodes: [],
          originalText: trimmedSentence,
        });
        segmentIndices.push(segmentIndex);
        segmentIndex++;
        continue;
      }

      // Calculate actual trimmed position
      const leadingWs = sentence.substring(0, sentence.length - sentence.trimStart().length);
      const trailingWs = sentence.substring(sentence.trimEnd().length);
      const trimmedStart = sentenceStart + leadingWs.length;
      const trimmedEnd = trimmedStart + trimmedSentence.length;
      searchOffset = sentenceStart + sentence.length;

      // Map sentence to text nodes
      const textNodes: TextNodeLocation[] = [];
      for (const rt of runTexts) {
        // Check if this run's text overlaps with the trimmed sentence
        if (rt.charEnd > trimmedStart && rt.charStart < trimmedEnd) {
          // Calculate the character offsets within this specific w:t element
          const nodeCharStart = Math.max(0, trimmedStart - rt.charStart);
          const nodeCharEnd = Math.min(rt.text.length, trimmedEnd - rt.charStart);

          textNodes.push({
            paragraphIndex: paraIndex,
            runIndex: rt.runIndex,
            textIndex: rt.textIndex,
            charStart: nodeCharStart,
            charEnd: nodeCharEnd,
            preserveSpace: rt.preserveSpace,
          });
        }
      }

      // Find line breaks within this segment's range
      const segmentLineBreaks: LineBreakLocation[] = [];
      for (const lb of paraLineBreaks) {
        if (lb.charOffset >= trimmedStart && lb.charOffset < trimmedEnd) {
          segmentLineBreaks.push({
            paragraphIndex: paraIndex,
            runIndex: lb.runIndex,
            breakIndex: lb.breakIndex,
            charOffset: lb.charOffset - trimmedStart, // Relative to segment start
          });
        }
      }

      segments.push({ sourceText: trimmedSentence });
      segmentMappings.push({
        segmentIndex,
        textNodes,
        originalText: trimmedSentence,
        lineBreaks: segmentLineBreaks.length > 0 ? segmentLineBreaks : undefined,
        leadingWhitespace: leadingWs || undefined,
        trailingWhitespace: trailingWs || undefined,
      });
      segmentIndices.push(segmentIndex);
      segmentIndex++;
    }

    if (segmentIndices.length > 0) {
      paragraphs.push({
        index: paraIndex,
        segmentIndices,
        style: pStyle,
        formatting,
      });
    }
  }

  return {
    segments,
    structureMetadata: {
      version: 2,
      paragraphs,
      segmentMappings,
      documentXmlHash,
    },
  };
}

// ============================================================================
// Text Extraction
// ============================================================================

/**
 * Recursively extract all text content from a node.
 * This is a fallback for unusual document structures.
 */
function extractAllTextFromNode(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;

  if (Array.isArray(node)) {
    return node.map(item => extractAllTextFromNode(item)).join('');
  }

  if (typeof node === 'object') {
    // Check for text content
    if (node['#text'] !== undefined) {
      return String(node['#text']);
    }

    // Check for w:t elements
    if (node['w:t']) {
      const t = node['w:t'];
      if (typeof t === 'string') return t;
      if (t && t['#text'] !== undefined) return String(t['#text']);
      if (Array.isArray(t)) {
        return t.map(item => {
          if (typeof item === 'string') return item;
          if (item && item['#text'] !== undefined) return String(item['#text']);
          return '';
        }).join('');
      }
    }

    // Recursively search all properties
    let text = '';
    for (const key of Object.keys(node)) {
      if (key.startsWith('@_')) continue; // Skip attributes
      text += extractAllTextFromNode(node[key]);
    }
    return text;
  }

  return String(node);
}

/**
 * Recursively find all run elements (w:r) in a paragraph.
 * LibreOffice may nest runs in additional structures.
 */
function findAllRuns(node: any, result: any[] = []): any[] {
  if (!node || typeof node !== 'object') return result;

  if (Array.isArray(node)) {
    for (const item of node) {
      findAllRuns(item, result);
    }
    return result;
  }

  // Check for run elements
  if (node['w:r']) {
    const runs = Array.isArray(node['w:r']) ? node['w:r'] : [node['w:r']];
    result.push(...runs);
  }

  // Recursively search nested structures (but not into nested paragraphs)
  for (const key of Object.keys(node)) {
    if (key.startsWith('@_') || key === 'w:p') continue; // Skip attributes and nested paragraphs

    const value = node[key];
    if (value && typeof value === 'object') {
      findAllRuns(value, result);
    }
  }

  return result;
}

/**
 * Extract text content from a paragraph element with position tracking.
 * Preserves exact spacing and tracks line breaks.
 */
function extractParagraphTextWithPositions(para: any): ParagraphTextResult {
  if (!para) return { text: '', runTexts: [], lineBreaks: [] };

  const textParts: string[] = [];
  const runTexts: RunTextInfo[] = [];
  const lineBreaks: RunBreakInfo[] = [];
  let currentOffset = 0;

  // Get runs (w:r elements) - these contain the actual text
  // First try direct children, then recursively search for nested runs
  let runs = Array.isArray(para['w:r']) ? para['w:r'] : para['w:r'] ? [para['w:r']] : [];

  // If no direct runs found, search recursively (LibreOffice nested structures)
  if (runs.length === 0) {
    runs = findAllRuns(para);
  }

  // If still no runs, try to extract text directly from w:t elements anywhere in the paragraph
  if (runs.length === 0) {
    const directText = extractAllTextFromNode(para);
    if (directText.trim()) {
      return {
        text: directText,
        runTexts: [{
          runIndex: 0,
          textIndex: 0,
          text: directText,
          charStart: 0,
          charEnd: directText.length,
          preserveSpace: false,
        }],
        lineBreaks: [],
      };
    }
  }

  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    const run = runs[runIndex];

    // Track line breaks (w:br) in this run - process them in order with text
    const brElements = Array.isArray(run['w:br']) ? run['w:br'] : run['w:br'] ? [run['w:br']] : [];

    // Get text from w:t elements
    const textElements = Array.isArray(run['w:t']) ? run['w:t'] : run['w:t'] ? [run['w:t']] : [];

    for (let textIndex = 0; textIndex < textElements.length; textIndex++) {
      const t = textElements[textIndex];
      let textContent = '';
      let preserveSpace = false;

      if (typeof t === 'string') {
        textContent = t;
      } else if (t && t['#text'] !== undefined) {
        textContent = String(t['#text']);
        // Check for xml:space="preserve" attribute
        preserveSpace = t['@_xml:space'] === 'preserve';
      } else if (t && typeof t === 'object') {
        // Text might be the value itself with preserve space attribute
        const textValue = Object.values(t).find((v) => typeof v === 'string');
        if (textValue) {
          textContent = textValue;
        }
        preserveSpace = t['@_xml:space'] === 'preserve';
      }

      if (!textContent) continue;

      const charStart = currentOffset;
      textParts.push(textContent);
      currentOffset += textContent.length;
      const charEnd = currentOffset;

      runTexts.push({
        runIndex,
        textIndex,
        text: textContent,
        charStart,
        charEnd,
        preserveSpace,
      });
    }

    // Handle tab characters (w:tab)
    if (run['w:tab']) {
      textParts.push('\t');
      currentOffset += 1;
    }

    // Handle line breaks (w:br) - track them for restoration during export
    for (let breakIndex = 0; breakIndex < brElements.length; breakIndex++) {
      lineBreaks.push({
        runIndex,
        breakIndex,
        charOffset: currentOffset,
      });
      // Add newline character to text for accurate position tracking
      textParts.push('\n');
      currentOffset += 1;
    }
  }

  return {
    text: textParts.join(''),
    runTexts,
    lineBreaks,
  };
}

/**
 * Extended formatting info for heading detection
 */
interface ExtendedFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number; // Font size in half-points (Word uses half-points)
}

/**
 * Extract formatting information from a paragraph
 */
function extractParagraphFormatting(para: any): ExtendedFormatting | undefined {
  const formatting: ExtendedFormatting = {};

  // Check first run for formatting (simplified - assumes consistent formatting)
  const runs = Array.isArray(para['w:r']) ? para['w:r'] : para['w:r'] ? [para['w:r']] : [];
  if (runs.length > 0) {
    const rPr = runs[0]['w:rPr'];
    if (rPr) {
      if (rPr['w:b'] !== undefined) formatting.bold = true;
      if (rPr['w:i'] !== undefined) formatting.italic = true;
      if (rPr['w:u'] !== undefined) formatting.underline = true;
      // Font size in half-points (e.g., 24 = 12pt)
      const szVal = rPr['w:sz']?.['@_w:val'];
      if (szVal) {
        formatting.fontSize = parseInt(szVal, 10);
      }
    }
  }

  return Object.keys(formatting).length > 0 ? formatting : undefined;
}

// ============================================================================
// Sentence Splitting
// ============================================================================

/**
 * Split text into sentences using simple heuristics.
 * Splits on sentence-ending punctuation followed by space and capital letter.
 */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Check for sentence end: . ! ? followed by space and capital letter (or end of text)
    if (
      (text[i] === '.' || text[i] === '!' || text[i] === '?') &&
      (i + 1 >= text.length ||
        (text[i + 1] === ' ' && i + 2 < text.length && /[A-Z\u00C0-\u024F]/.test(text[i + 2] ?? '')))
    ) {
      sentences.push(current.trim());
      current = '';
      if (i + 1 < text.length && text[i + 1] === ' ') {
        i++; // Skip the space after sentence
      }
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  // If no sentence breaks found, return the whole text as one segment
  if (sentences.length === 0 && text.trim()) {
    return [text.trim()];
  }

  return sentences;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Type guard to check if metadata is v2 format
 */
export function isV2Metadata(metadata: any): metadata is DocxStructureMetadataV2 {
  return (
    metadata &&
    metadata.version === 2 &&
    Array.isArray(metadata.segmentMappings) &&
    typeof metadata.documentXmlHash === 'string'
  );
}

/**
 * Type guard to check if metadata is v1 format
 */
export function isV1Metadata(metadata: any): metadata is DocxStructureMetadataV1 {
  return metadata && metadata.version === 1 && Array.isArray(metadata.paragraphs);
}
