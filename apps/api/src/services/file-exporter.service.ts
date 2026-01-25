import { XMLBuilder } from 'fast-xml-parser';

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
}

export type ExportFormat = 'txt' | 'xliff';

/**
 * Export document to specified format
 */
export function exportDocument(
  options: ExportOptions,
  format: ExportFormat
): { content: string; mimeType: string; extension: string } {
  switch (format) {
    case 'txt':
      return exportToTxt(options);
    case 'xliff':
      return exportToXliff(options);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Export document as plain text (target text only, one segment per line)
 */
function exportToTxt(options: ExportOptions): {
  content: string;
  mimeType: string;
  extension: string;
} {
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
function exportToXliff(options: ExportOptions): {
  content: string;
  mimeType: string;
  extension: string;
} {
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
 * Export document as bilingual text (source | target format)
 */
export function exportToBilingualTxt(options: ExportOptions): {
  content: string;
  mimeType: string;
  extension: string;
} {
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
  return ['txt', 'xliff'];
}
