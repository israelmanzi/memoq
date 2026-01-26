import { XMLBuilder } from 'fast-xml-parser';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { DocxStructureMetadata } from './docx-parser.service.js';

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
 * Export document as DOCX format
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
