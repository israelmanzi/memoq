import { XMLParser } from 'fast-xml-parser';
import { parseDocx, type DocxStructureMetadata, type DocxStructureMetadataV2 } from './docx-parser.service.js';
import { parsePdf, type PdfStructureMetadata } from './pdf-parser.service.js';
import { isConversionEnabled, convertPdfToDocx } from './conversion.service.js';
import { isAdobePdfEnabled, extractPdfWithAdobe, type AdobePdfParseResult } from './adobe-pdf.service.js';
import { logger } from '../config/logger.js';

export interface ParsedSegment {
  sourceText: string;
  targetText?: string;
}

export interface ParseResult {
  segments: ParsedSegment[];
  sourceLanguage?: string;
  targetLanguage?: string;
  originalName?: string;
  structureMetadata?: DocxStructureMetadata | PdfStructureMetadata;
  pageCount?: number;
  isBinary?: boolean;
  // For PDFs converted to DOCX, store the converted DOCX buffer
  convertedDocxBuffer?: Buffer;
  convertedDocxMetadata?: DocxStructureMetadataV2;
  // For Adobe PDF extraction
  adobeMetadata?: AdobePdfParseResult['metadata'];
  /** Indicates which extraction method was used */
  extractionMethod?: 'adobe' | 'libreoffice' | 'unpdf';
}

/**
 * Parse a file buffer into segments based on file type
 */
export async function parseFile(
  buffer: Buffer,
  filename: string,
  fileType: string
): Promise<ParseResult> {
  const normalizedType = fileType.toLowerCase();

  switch (normalizedType) {
    case 'txt':
    case 'text/plain':
      return parseTxt(buffer);

    case 'xliff':
    case 'xlf':
    case 'application/xliff+xml':
    case 'application/x-xliff+xml':
      return parseXliff(buffer, filename);

    case 'sdlxliff':
      return parseXliff(buffer, filename); // SDL XLIFF is similar enough

    case 'docx':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const docxResult = await parseDocx(buffer);
      return {
        segments: docxResult.segments,
        structureMetadata: docxResult.structureMetadata,
        isBinary: true,
        originalName: filename,
      };
    }

    case 'pdf':
    case 'application/pdf': {
      // Priority 1: LibreOffice PDF to DOCX conversion (best for round-trip fidelity)
      // This gives us a DOCX we can modify in-place and export back to PDF
      if (isConversionEnabled()) {
        try {
          logger.info('Converting PDF to DOCX for round-trip fidelity (LibreOffice)');
          const conversionResult = await convertPdfToDocx(buffer, { filename });

          // Parse the converted DOCX (which has proper text position tracking)
          const docxResult = await parseDocx(conversionResult.docxBuffer);

          return {
            segments: docxResult.segments,
            structureMetadata: docxResult.structureMetadata,
            isBinary: true,
            originalName: filename,
            // Store converted DOCX for later export
            convertedDocxBuffer: conversionResult.docxBuffer,
            convertedDocxMetadata: docxResult.structureMetadata,
            extractionMethod: 'libreoffice',
          };
        } catch (conversionError) {
          logger.warn({ error: conversionError }, 'PDF to DOCX conversion failed, trying Adobe');
          // Fall through to Adobe
        }
      }

      // Priority 2: Adobe PDF Extract API (good extraction but no round-trip DOCX)
      if (isAdobePdfEnabled()) {
        try {
          logger.info('Using Adobe PDF Extract API for text extraction');
          const adobeResult = await extractPdfWithAdobe(buffer);

          return {
            segments: adobeResult.segments.map(seg => ({
              sourceText: seg.sourceText,
            })),
            pageCount: adobeResult.pageCount,
            adobeMetadata: adobeResult.metadata,
            isBinary: true,
            originalName: filename,
            extractionMethod: 'adobe',
          };
        } catch (adobeError) {
          logger.warn({ error: adobeError }, 'Adobe PDF extraction failed, falling back to unpdf');
          // Fall through to unpdf
        }
      }

      // Priority 3: Direct PDF parsing with unpdf (least accurate but no external dependency)
      logger.info('Using direct PDF parsing (unpdf)');
      const pdfResult = await parsePdf(buffer);
      return {
        segments: pdfResult.segments,
        pageCount: pdfResult.pageCount,
        structureMetadata: pdfResult.structureMetadata,
        isBinary: true,
        originalName: filename,
        extractionMethod: 'unpdf',
      };
    }

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Parse plain text file - split into segments by sentence/paragraph
 */
function parseTxt(buffer: Buffer): ParseResult {
  const text = buffer.toString('utf-8');

  // Split by double newlines (paragraphs) or single newlines
  const lines = text
    .split(/\n\n+|\r\n\r\n+/)
    .flatMap((para) => para.split(/\n|\r\n/))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Further split long lines by sentence boundaries
  const segments: ParsedSegment[] = [];

  for (const line of lines) {
    if (line.length > 500) {
      // Split long lines by sentence
      const sentences = splitIntoSentences(line);
      for (const sentence of sentences) {
        if (sentence.trim()) {
          segments.push({ sourceText: sentence.trim() });
        }
      }
    } else {
      segments.push({ sourceText: line });
    }
  }

  return { segments };
}

/**
 * Simple sentence splitter
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space and capital letter
  // This is a simple heuristic - production would use cldr-segmentation
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Check for sentence end
    if (
      (text[i] === '.' || text[i] === '!' || text[i] === '?') &&
      i + 1 < text.length &&
      text[i + 1] === ' ' &&
      i + 2 < text.length &&
      /[A-Z]/.test(text[i + 2] ?? '')
    ) {
      sentences.push(current.trim());
      current = '';
      i++; // Skip the space
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences;
}

/**
 * Parse XLIFF 1.2/2.0 file
 */
function parseXliff(buffer: Buffer, filename: string): ParseResult {
  const xml = buffer.toString('utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    preserveOrder: false,
  });

  const doc = parser.parse(xml);

  // Find the xliff root element (may be namespaced)
  const xliffRoot = doc.xliff || doc['xliff:xliff'];

  if (!xliffRoot) {
    throw new Error('Could not parse XLIFF file - no xliff root element found');
  }

  // Check version to determine parser
  const version = xliffRoot['@_version'];

  if (version?.startsWith('2')) {
    return parseXliff20(xliffRoot, filename);
  }

  // Default to XLIFF 1.2 parser
  return parseXliff12(xliffRoot, filename);
}

/**
 * Parse XLIFF 1.2 format
 */
function parseXliff12(xliff: any, filename: string): ParseResult {
  const segments: ParsedSegment[] = [];
  let sourceLanguage: string | undefined;
  let targetLanguage: string | undefined;

  // Handle single file or array of files
  const files = Array.isArray(xliff.file) ? xliff.file : [xliff.file];

  for (const file of files) {
    if (!file) continue;

    sourceLanguage = sourceLanguage || file['@_source-language'];
    targetLanguage = targetLanguage || file['@_target-language'];

    const body = file.body;
    if (!body) continue;

    // Handle trans-unit elements
    const transUnits = extractTransUnits(body);

    for (const tu of transUnits) {
      const source = extractTextContent(tu.source);
      const target = extractTextContent(tu.target);

      if (source) {
        segments.push({
          sourceText: source,
          targetText: target || undefined,
        });
      }
    }
  }

  return {
    segments,
    sourceLanguage,
    targetLanguage,
    originalName: filename,
  };
}

/**
 * Parse XLIFF 2.0 format
 */
function parseXliff20(xliff: any, filename: string): ParseResult {
  const segments: ParsedSegment[] = [];
  let sourceLanguage: string | undefined;
  let targetLanguage: string | undefined;

  sourceLanguage = xliff['@_srcLang'];
  targetLanguage = xliff['@_trgLang'];

  // Handle single file or array of files
  const files = Array.isArray(xliff.file) ? xliff.file : [xliff.file];

  for (const file of files) {
    if (!file) continue;

    // XLIFF 2.0 uses unit instead of trans-unit
    const units = extractUnits(file);

    for (const unit of units) {
      // Each unit can have multiple segments
      const unitSegments = Array.isArray(unit.segment)
        ? unit.segment
        : unit.segment
          ? [unit.segment]
          : [];

      for (const seg of unitSegments) {
        const source = extractTextContent(seg.source);
        const target = extractTextContent(seg.target);

        if (source) {
          segments.push({
            sourceText: source,
            targetText: target || undefined,
          });
        }
      }
    }
  }

  return {
    segments,
    sourceLanguage,
    targetLanguage,
    originalName: filename,
  };
}

/**
 * Extract trans-unit elements from XLIFF 1.2 body
 */
function extractTransUnits(body: any): any[] {
  const units: any[] = [];

  // Direct trans-unit children
  if (body['trans-unit']) {
    const tu = body['trans-unit'];
    units.push(...(Array.isArray(tu) ? tu : [tu]));
  }

  // trans-unit inside group elements
  if (body.group) {
    const groups = Array.isArray(body.group) ? body.group : [body.group];
    for (const group of groups) {
      if (group['trans-unit']) {
        const tu = group['trans-unit'];
        units.push(...(Array.isArray(tu) ? tu : [tu]));
      }
      // Nested groups
      if (group.group) {
        units.push(...extractTransUnits(group));
      }
    }
  }

  return units;
}

/**
 * Extract unit elements from XLIFF 2.0 file
 */
function extractUnits(file: any): any[] {
  const units: any[] = [];

  // Direct unit children
  if (file.unit) {
    const u = file.unit;
    units.push(...(Array.isArray(u) ? u : [u]));
  }

  // unit inside group elements
  if (file.group) {
    const groups = Array.isArray(file.group) ? file.group : [file.group];
    for (const group of groups) {
      if (group.unit) {
        const u = group.unit;
        units.push(...(Array.isArray(u) ? u : [u]));
      }
      // Nested groups - recursively extract
      if (group.group) {
        const nestedUnits = extractUnits(group);
        units.push(...nestedUnits);
      }
    }
  }

  return units;
}

/**
 * Extract text content from XLIFF source/target element
 * Handles both simple text and inline elements (g, x, ph, etc.)
 */
function extractTextContent(element: any): string {
  if (!element) return '';

  if (typeof element === 'string') {
    return element;
  }

  if (typeof element === 'object') {
    // Simple text content
    if (element['#text'] !== undefined) {
      return String(element['#text']);
    }

    // Flatten inline elements
    let text = '';
    for (const key of Object.keys(element)) {
      if (key.startsWith('@_')) continue; // Skip attributes

      const value = element[key];
      if (typeof value === 'string') {
        text += value;
      } else if (Array.isArray(value)) {
        text += value.map((v: any) => extractTextContent(v)).join('');
      } else if (typeof value === 'object') {
        text += extractTextContent(value);
      }
    }
    return text;
  }

  return String(element);
}

/**
 * Detect file type from filename or mime type
 */
export function detectFileType(filename: string, mimeType?: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'xliff' || ext === 'xlf' || ext === 'sdlxliff') {
    return 'xliff';
  }

  if (ext === 'txt') {
    return 'txt';
  }

  if (ext === 'docx') {
    return 'docx';
  }

  if (ext === 'pdf') {
    return 'pdf';
  }

  // Check mime type
  if (mimeType) {
    if (mimeType.includes('xliff')) return 'xliff';
    if (mimeType === 'text/plain') return 'txt';
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      return 'docx';
    if (mimeType === 'application/pdf') return 'pdf';
  }

  // Default to txt for unknown
  return 'txt';
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return ['txt', 'xliff', 'xlf', 'sdlxliff', 'docx', 'pdf'];
}

/**
 * Check if a file type is binary
 */
export function isBinaryFileType(fileType: string): boolean {
  return ['docx', 'pdf'].includes(fileType.toLowerCase());
}
