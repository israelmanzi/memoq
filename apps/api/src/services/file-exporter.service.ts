import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import { createHash } from 'crypto';
import type {
  DocxStructureMetadata,
  DocxStructureMetadataV2,
  SegmentTextMapping,
  TextNodeLocation,
} from './docx-parser.service.js';

export interface ExportSegment {
  sourceText: string;
  targetText: string | null;
  status?: string;
}

export interface ExportOptions {
  filename: string;
  sourceLanguage: string;
  targetLanguage: string;
  segments: ExportSegment[];
  originalContent?: string | null;
  fileType: string;
  structureMetadata?: DocxStructureMetadata | null;
}

export interface InPlaceExportOptions {
  originalDocxBuffer: Buffer;
  segments: ExportSegment[];
  structureMetadata: DocxStructureMetadataV2;
}

export type ExportFormat = 'txt' | 'xliff' | 'docx';

export interface ExportResult {
  content: string | Buffer;
  mimeType: string;
  extension: string;
}

/**
 * Export document to specified format
 */
export async function exportDocument(
  options: ExportOptions,
  format: ExportFormat
): Promise<ExportResult> {
  switch (format) {
    case 'txt':
      return exportToTxt(options);
    case 'xliff':
      return exportToXliff(options);
    case 'docx':
      return exportToDocx(options);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Export document as plain text (target text only, one segment per line)
 */
function exportToTxt(options: ExportOptions): ExportResult {
  const lines = options.segments.map((seg) => seg.targetText || '');
  const content = lines.join('\n');

  return {
    content,
    mimeType: 'text/plain',
    extension: 'txt',
  };
}

/**
 * Export document as XLIFF 1.2 format
 */
function exportToXliff(options: ExportOptions): ExportResult {
  const transUnits = options.segments.map((seg, idx) => ({
    '@_id': `tu-${idx + 1}`,
    '@_approved': seg.status && ['reviewed_1', 'reviewed_2', 'locked'].includes(seg.status) ? 'yes' : 'no',
    source: seg.sourceText,
    target: {
      '@_state': mapStatusToXliffState(seg.status),
      '#text': seg.targetText || '',
    },
  }));

  const xliffDoc = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8',
    },
    xliff: {
      '@_version': '1.2',
      '@_xmlns': 'urn:oasis:names:tc:xliff:document:1.2',
      file: {
        '@_original': options.filename,
        '@_source-language': options.sourceLanguage,
        '@_target-language': options.targetLanguage,
        '@_datatype': 'plaintext',
        body: {
          'trans-unit': transUnits,
        },
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    format: true,
    suppressBooleanAttributes: false,
  });

  const content = builder.build(xliffDoc);

  return {
    content,
    mimeType: 'application/xliff+xml',
    extension: 'xliff',
  };
}

/**
 * Map segment status to XLIFF state attribute
 */
function mapStatusToXliffState(status: string | undefined): string {
  switch (status) {
    case 'untranslated':
      return 'new';
    case 'draft':
      return 'needs-translation';
    case 'translated':
      return 'translated';
    case 'reviewed_1':
    case 'reviewed_2':
      return 'signed-off';
    case 'locked':
      return 'final';
    default:
      return 'new';
  }
}

/**
 * Export document as DOCX format (legacy rebuild method)
 * This is used as a fallback when in-place replacement is not available.
 */
async function exportToDocx(options: ExportOptions): Promise<ExportResult> {
  const metadata = options.structureMetadata;

  let paragraphs: Paragraph[];

  if (metadata && metadata.paragraphs.length > 0) {
    // Reconstruct using structure metadata
    paragraphs = metadata.paragraphs.map((para) => {
      const segmentTexts = para.segmentIndices
        .map((si) => options.segments[si]?.targetText || options.segments[si]?.sourceText || '')
        .join(' ');

      return new Paragraph({
        children: [
          new TextRun({
            text: segmentTexts,
            bold: para.formatting?.bold,
            italics: para.formatting?.italic,
          }),
        ],
      });
    });
  } else {
    // No metadata - create simple paragraphs from segments
    paragraphs = options.segments.map(
      (seg) =>
        new Paragraph({
          children: [
            new TextRun({
              text: seg.targetText || seg.sourceText,
            }),
          ],
        })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return {
    content: buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  };
}

// ============================================================================
// In-Place DOCX Export (preserves formatting)
// ============================================================================

/**
 * Export DOCX by modifying the original file in-place.
 * This preserves all formatting, styles, images, tables, etc.
 */
export async function exportToDocxInPlace(options: InPlaceExportOptions): Promise<ExportResult> {
  const { originalDocxBuffer, segments, structureMetadata } = options;

  // 1. Load and verify the original DOCX
  const zip = await JSZip.loadAsync(originalDocxBuffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

  // 2. Verify integrity - ensure document hasn't changed since parsing
  const currentHash = createHash('sha256').update(documentXml).digest('hex');
  if (currentHash !== structureMetadata.documentXmlHash) {
    throw new Error(
      'Document integrity check failed: the original file has been modified since parsing. ' +
      'Please re-upload the document to use in-place export.'
    );
  }

  // 3. Parse XML preserving order and whitespace
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    preserveOrder: true,
    trimValues: false,
  });

  const doc = parser.parse(documentXml);

  // 4. Apply text replacements using segment mappings
  for (const mapping of structureMetadata.segmentMappings) {
    const segment = segments[mapping.segmentIndex];
    if (!segment) continue;

    // Only replace if there's an actual translation
    // If targetText is null/undefined or equals sourceText, skip to preserve original formatting
    const targetText = segment.targetText;
    if (!targetText || targetText === segment.sourceText) {
      // No translation - keep original document text unchanged
      continue;
    }

    applySegmentReplacement(doc, mapping, targetText);
  }

  // 5. Rebuild XML
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    preserveOrder: true,
    format: false, // Don't add formatting whitespace
  });

  const newDocumentXml = builder.build(doc);

  // 6. Replace document.xml in the ZIP and return
  zip.file('word/document.xml', newDocumentXml);
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    content: outputBuffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  };
}

/**
 * Apply a segment's translation to its mapped text nodes.
 * Handles both single-node and multi-node segments.
 * Preserves whitespace and skips unchanged segments to prevent formatting corruption.
 */
function applySegmentReplacement(
  doc: any,
  mapping: SegmentTextMapping,
  targetText: string
): void {
  if (mapping.textNodes.length === 0) {
    // No text node mapping - skip (shouldn't happen normally)
    return;
  }

  // IMPORTANT: If target text equals original text, skip replacement entirely
  // This preserves exact original formatting for untranslated segments
  if (targetText === mapping.originalText) {
    return;
  }

  if (mapping.textNodes.length === 1) {
    // Simple case: single text node
    const loc = mapping.textNodes[0];
    if (loc) {
      applySingleNodeReplacement(doc, loc, targetText);
    }
  } else {
    // Complex case: text spans multiple nodes
    applyMultiNodeReplacement(doc, mapping.textNodes, targetText);
  }
}

/**
 * Replace text in a single text node.
 */
function applySingleNodeReplacement(
  doc: any,
  loc: TextNodeLocation,
  targetText: string
): void {
  const textNode = getTextNodePreserveOrder(doc, loc);
  if (!textNode) return;

  const originalText = getTextContent(textNode);

  // Replace the portion of text within charStart:charEnd
  const before = originalText.substring(0, loc.charStart);
  const after = originalText.substring(loc.charEnd);

  setTextContent(textNode, before + targetText + after);
}

/**
 * Replace text that spans multiple text nodes.
 * Strategy: Put all translated text in the first node, empty the middle nodes,
 * keep trailing content in the last node.
 */
function applyMultiNodeReplacement(
  doc: any,
  textNodes: TextNodeLocation[],
  targetText: string
): void {
  if (textNodes.length === 0) return;

  // Get all text nodes
  const nodes = textNodes.map((loc) => ({
    loc,
    node: getTextNodePreserveOrder(doc, loc),
  }));

  // Filter out any nodes we couldn't find
  const validNodes = nodes.filter((n) => n.node !== null);
  if (validNodes.length === 0) return;

  // First node: keep text before charStart, add all translated text
  const firstNode = validNodes[0];
  if (!firstNode) return;

  const firstOriginal = getTextContent(firstNode.node);
  const before = firstOriginal.substring(0, firstNode.loc.charStart);
  setTextContent(firstNode.node, before + targetText);

  // Middle nodes: empty them (but keep the run element for formatting preservation)
  for (let i = 1; i < validNodes.length - 1; i++) {
    const middleNode = validNodes[i];
    if (middleNode) {
      setTextContent(middleNode.node, '');
    }
  }

  // Last node (if different from first): keep only text after charEnd
  if (validNodes.length > 1) {
    const lastNode = validNodes[validNodes.length - 1];
    if (lastNode) {
      const lastOriginal = getTextContent(lastNode.node);
      const after = lastOriginal.substring(lastNode.loc.charEnd);
      setTextContent(lastNode.node, after);
    }
  }
}

/**
 * Navigate to a text node in the parsed XML structure (preserveOrder format).
 * The preserveOrder format uses arrays with :tagName keys.
 */
function getTextNodePreserveOrder(doc: any, loc: TextNodeLocation): any | null {
  try {
    // Find w:document
    const wDocument = findElementByTag(doc, 'w:document');
    if (!wDocument) return null;

    // Find w:body
    const wBody = findElementByTag(wDocument, 'w:body');
    if (!wBody) return null;

    // Find paragraph by index
    const paragraphs = findAllElementsByTag(wBody, 'w:p');
    const para = paragraphs[loc.paragraphIndex];
    if (!para) return null;

    // Find run by index
    const runs = findAllElementsByTag(para, 'w:r');
    const run = runs[loc.runIndex];
    if (!run) return null;

    // Find text element by index
    const texts = findAllElementsByTag(run, 'w:t');
    const textElement = texts[loc.textIndex];
    if (!textElement) return null;

    return textElement;
  } catch {
    return null;
  }
}

/**
 * Find an element by tag name in preserveOrder format.
 * In preserveOrder, elements are arrays containing objects with :tagName keys.
 */
function findElementByTag(parent: any, tagName: string): any | null {
  if (!Array.isArray(parent)) return null;

  for (const item of parent) {
    if (item && typeof item === 'object' && tagName in item) {
      return item[tagName];
    }
  }
  return null;
}

/**
 * Find all elements by tag name in preserveOrder format.
 */
function findAllElementsByTag(parent: any, tagName: string): any[] {
  if (!Array.isArray(parent)) return [];

  const results: any[] = [];
  for (const item of parent) {
    if (item && typeof item === 'object' && tagName in item) {
      results.push(item[tagName]);
    }
  }
  return results;
}

/**
 * Get text content from a w:t element (preserveOrder format).
 */
function getTextContent(textElement: any): string {
  if (!Array.isArray(textElement)) return '';

  for (const item of textElement) {
    if (item && typeof item === 'object' && '#text' in item) {
      return String(item['#text']);
    }
  }
  return '';
}

/**
 * Set text content in a w:t element (preserveOrder format).
 */
function setTextContent(textElement: any, newText: string): void {
  if (!Array.isArray(textElement)) return;

  for (const item of textElement) {
    if (item && typeof item === 'object' && '#text' in item) {
      item['#text'] = newText;
      return;
    }
  }

  // If no #text found, add it
  textElement.push({ '#text': newText });
}

/**
 * Export document as bilingual text (source | target format)
 */
export function exportToBilingualTxt(options: ExportOptions): ExportResult {
  const lines = options.segments.map(
    (seg) => `${seg.sourceText}\t${seg.targetText || ''}`
  );
  const content = lines.join('\n');

  return {
    content,
    mimeType: 'text/plain',
    extension: 'txt',
  };
}

/**
 * Get supported export formats
 */
export function getSupportedExportFormats(): ExportFormat[] {
  return ['txt', 'xliff', 'docx'];
}

/**
 * Get export formats available for a specific file type
 */
export function getExportFormatsForFileType(fileType: string): ExportFormat[] {
  const baseFormats: ExportFormat[] = ['txt', 'xliff'];

  if (fileType === 'docx') {
    return [...baseFormats, 'docx'];
  }

  return baseFormats;
}
