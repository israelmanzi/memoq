import { XMLBuilder } from 'fast-xml-parser';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { logger } from '../config/logger.js';
import { replaceTextInDocx, replaceTextInPdf, isConversionEnabled } from './conversion.service.js';
import type {
  DocxStructureMetadata,
  DocxStructureMetadataV2,
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
  filename?: string;
}

export interface PdfExportOptions {
  originalPdfBuffer: Buffer;
  segments: ExportSegment[];
  filename?: string;
}

export type ExportFormat = 'txt' | 'xliff' | 'docx' | 'pdf';

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
 * Export document as DOCX format (fallback rebuild method)
 * This is used when in-place replacement is not available.
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
// In-Place DOCX Export (preserves formatting via Python service)
// ============================================================================

/**
 * Export DOCX by replacing text using the Python service (python-docx-replace).
 * This preserves all formatting, styles, images, tables, etc.
 *
 * The Python service handles text split across multiple runs properly,
 * which is the main challenge with DOCX text replacement.
 */
export async function exportToDocxInPlace(options: InPlaceExportOptions): Promise<ExportResult> {
  const { originalDocxBuffer, segments, structureMetadata, filename } = options;

  // Check if conversion service is available
  if (!isConversionEnabled()) {
    throw new Error(
      'Document conversion service is not configured. ' +
      'Set PDF_CONVERTER_URL environment variable to enable in-place DOCX export.'
    );
  }

  // Build replacements map: source text -> target text
  const replacements: Record<string, string> = {};

  for (const mapping of structureMetadata.segmentMappings) {
    const segment = segments[mapping.segmentIndex];
    if (!segment) continue;

    const targetText = segment.targetText;
    if (!targetText) continue;

    // Skip if no change
    if (targetText === segment.sourceText || targetText === mapping.originalText) {
      continue;
    }

    // Use originalText as key (this is what's actually in the document)
    replacements[mapping.originalText] = targetText;
  }

  const replacementCount = Object.keys(replacements).length;
  logger.info({ replacements: replacementCount, filename }, 'Preparing DOCX text replacements');

  if (replacementCount === 0) {
    logger.info('No replacements needed, returning original document');
    return {
      content: originalDocxBuffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
    };
  }

  // Call Python service to do the replacement
  const result = await replaceTextInDocx(originalDocxBuffer, replacements, { filename });

  return {
    content: result.docxBuffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  };
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
  return ['txt', 'xliff', 'docx', 'pdf'];
}

/**
 * Get export formats available for a specific file type
 */
export function getExportFormatsForFileType(fileType: string): ExportFormat[] {
  const baseFormats: ExportFormat[] = ['txt', 'xliff'];

  if (fileType === 'docx') {
    return [...baseFormats, 'docx'];
  }

  if (fileType === 'pdf') {
    return [...baseFormats, 'pdf'];
  }

  return baseFormats;
}

// ============================================================================
// PDF Export (direct text replacement using PyMuPDF)
// ============================================================================

/**
 * Export PDF by replacing text directly in the original PDF using PyMuPDF.
 * This preserves the original layout and formatting.
 */
export async function exportToPdfInPlace(options: PdfExportOptions): Promise<ExportResult> {
  const { originalPdfBuffer, segments, filename } = options;

  // Check if conversion service is available
  if (!isConversionEnabled()) {
    throw new Error(
      'Document conversion service is not configured. ' +
      'Set PDF_CONVERTER_URL environment variable to enable PDF export.'
    );
  }

  // Build replacements map: source text -> target text
  const replacements: Record<string, string> = {};

  for (const segment of segments) {
    const targetText = segment.targetText;
    if (!targetText) continue;

    // Skip if no change
    if (targetText === segment.sourceText) {
      continue;
    }

    replacements[segment.sourceText] = targetText;
  }

  const replacementCount = Object.keys(replacements).length;
  logger.info({ replacements: replacementCount, filename }, 'Preparing PDF text replacements');

  if (replacementCount === 0) {
    logger.info('No replacements needed, returning original PDF');
    return {
      content: originalPdfBuffer,
      mimeType: 'application/pdf',
      extension: 'pdf',
    };
  }

  // Call Python service to do the replacement
  const result = await replaceTextInPdf(originalPdfBuffer, replacements, { filename });

  return {
    content: result.pdfBuffer,
    mimeType: 'application/pdf',
    extension: 'pdf',
  };
}
