import {
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  ExtractPDFParams,
  ExtractElementType,
  ExtractPDFJob,
  ExtractPDFResult,
} from '@adobe/pdfservices-node-sdk';
import AdmZip from 'adm-zip';
import { Readable } from 'stream';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ============================================================================
// Types - Adobe JSON Output Structure
// ============================================================================

interface AdobeFontInfo {
  alt_family_name?: string;
  embedded?: boolean;
  encoding?: string;
  family_name?: string;
  font_type?: string;
  italic?: boolean;
  monospaced?: boolean;
  name?: string;
  subset?: boolean;
  weight?: number;
}

interface AdobeElement {
  /** XPath-like path: "//Document/H1", "//Document/P[2]", "//Document/Table" */
  Path: string;
  /** Text content (only for text elements) */
  Text?: string;
  /** Bounding box [left, bottom, right, top] in 72 dpi coordinates */
  Bounds?: [number, number, number, number];
  /** Font information */
  Font?: AdobeFontInfo;
  /** Text size in points */
  TextSize?: number;
  /** Page number (0-indexed in some versions, 1-indexed in others) */
  Page?: number;
  /** Additional attributes like LineHeight, TextAlign, etc. */
  attributes?: {
    LineHeight?: number;
    TextAlign?: string;
    SpaceAfter?: number;
    TextPosition?: string;
  };
  /** For tables: path to extracted CSV/XLSX file */
  filePaths?: string[];
}

interface AdobePage {
  pageNumber: number;
  width: number;
  height: number;
  rotation?: number;
}

interface AdobeExtractResult {
  version: string;
  extended_metadata: {
    ID?: string;
    pdf_version?: string;
    pdfa_compliance?: string;
    is_encrypted?: boolean;
    has_acroform?: boolean;
    pdfua_compliance?: string;
    [key: string]: unknown;
  };
  elements: AdobeElement[];
  pages: AdobePage[];
}

// ============================================================================
// Public Types
// ============================================================================

export interface AdobePdfSegment {
  /** Extracted text content */
  sourceText: string;
  /** XPath for document structure (e.g., "//Document/H1", "//Document/P[2]") */
  path: string;
  /** Element type: H1, H2, H3, H4, H5, H6, P, Li, Table, Lbl, Span, etc. */
  elementType: string;
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Bounding box [left, bottom, right, top] */
  bounds?: [number, number, number, number];
  /** Font information */
  font?: {
    name: string;
    size: number;
    weight?: number;
    italic?: boolean;
  };
}

export interface AdobePdfParseResult {
  segments: AdobePdfSegment[];
  pageCount: number;
  metadata: {
    version: string;
    pages: Array<{ width: number; height: number }>;
    pdfVersion?: string;
    isEncrypted?: boolean;
  };
}

// ============================================================================
// Client Management
// ============================================================================

let pdfServices: PDFServices | null = null;

function getPdfServices(): PDFServices {
  if (!pdfServices) {
    if (!env.ADOBE_PDF_SERVICES_CLIENT_ID || !env.ADOBE_PDF_SERVICES_CLIENT_SECRET) {
      throw new Error('Adobe PDF Services credentials not configured');
    }

    const credentials = new ServicePrincipalCredentials({
      clientId: env.ADOBE_PDF_SERVICES_CLIENT_ID,
      clientSecret: env.ADOBE_PDF_SERVICES_CLIENT_SECRET,
    });

    pdfServices = new PDFServices({ credentials });
  }
  return pdfServices;
}

/**
 * Check if Adobe PDF Services is configured and available
 */
export function isAdobePdfEnabled(): boolean {
  return !!(env.ADOBE_PDF_SERVICES_CLIENT_ID && env.ADOBE_PDF_SERVICES_CLIENT_SECRET);
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract text and structure from a PDF using Adobe PDF Extract API.
 *
 * For digital PDFs (with embedded text layers), Adobe uses the native text
 * directly - no OCR, 100% accuracy. For scanned PDFs, it applies OCR.
 *
 * The API preserves semantic structure (headings, paragraphs, lists, tables)
 * and determines correct reading order using AI.
 */
export async function extractPdfWithAdobe(buffer: Buffer): Promise<AdobePdfParseResult> {
  const services = getPdfServices();

  logger.info({ size: buffer.length }, 'Starting Adobe PDF extraction');

  // Convert Buffer to ReadableStream for the SDK
  const readStream = Readable.from(buffer);

  // Upload the PDF to Adobe's cloud
  const inputAsset = await services.upload({
    readStream,
    mimeType: MimeType.PDF,
  });

  // Configure extraction parameters - extract text with structure
  const params = new ExtractPDFParams({
    elementsToExtract: [ExtractElementType.TEXT],
    // Note: Can also add ExtractElementType.TABLES for table extraction
  });

  // Create and submit the extraction job
  const job = new ExtractPDFJob({ inputAsset, params });
  const pollingURL = await services.submit({ job });

  // Wait for job completion
  const jobResult = await services.getJobResult({
    pollingURL,
    resultType: ExtractPDFResult,
  });

  // Get the result asset (ZIP file containing structuredData.json)
  const resultAsset = jobResult.result?.resource;
  if (!resultAsset) {
    throw new Error('Adobe PDF extraction returned no result');
  }

  // Download the result
  const streamAsset = await services.getContent({ asset: resultAsset });

  // Collect chunks from the stream
  const chunks: Buffer[] = [];
  for await (const chunk of streamAsset.readStream) {
    chunks.push(Buffer.from(chunk));
  }
  const zipBuffer = Buffer.concat(chunks);

  // Extract structuredData.json from the ZIP
  const zip = new AdmZip(zipBuffer);
  const jsonEntry = zip.getEntry('structuredData.json');
  if (!jsonEntry) {
    throw new Error('structuredData.json not found in Adobe extraction result');
  }

  const extractResult: AdobeExtractResult = JSON.parse(
    jsonEntry.getData().toString('utf-8')
  );

  logger.info(
    {
      elements: extractResult.elements.length,
      pages: extractResult.pages.length,
      version: extractResult.version,
    },
    'Adobe PDF extraction completed'
  );

  // Convert Adobe's output to our segment format
  return convertToSegments(extractResult);
}

// ============================================================================
// Conversion to Segments
// ============================================================================

/**
 * Convert Adobe's extraction result to translation segments.
 *
 * Adobe provides semantic elements with XPath-like paths:
 * - //Document/H1, //Document/H2 - Headings
 * - //Document/P, //Document/P[2] - Paragraphs
 * - //Document/L/LI/Lbl - List item labels
 * - //Document/L/LI/LBody - List item body
 * - //Document/Table - Tables
 * - //Document/Figure - Figures (images)
 */
function convertToSegments(result: AdobeExtractResult): AdobePdfParseResult {
  const segments: AdobePdfSegment[] = [];

  for (const element of result.elements) {
    // Skip elements without text content
    if (!element.Text?.trim()) continue;

    // Parse element type from Path
    // e.g., "//Document/H1" -> "H1", "//Document/P[2]" -> "P"
    const pathParts = element.Path.split('/');
    const lastPart = pathParts[pathParts.length - 1] || 'P';
    const elementType = lastPart.replace(/\[\d+\]$/, ''); // Remove index suffix

    // Skip headers and footers (they repeat and aren't translatable content)
    if (element.Path.includes('/Artifact') ||
        element.Path.includes('/Header') ||
        element.Path.includes('/Footer')) {
      continue;
    }

    // Determine page number (Adobe may use 0-indexed or 1-indexed)
    let pageNumber = element.Page ?? 0;
    if (pageNumber === 0 && result.pages.length > 0) {
      pageNumber = 1; // Default to page 1 if not specified
    }
    // Ensure 1-indexed for consistency
    if (pageNumber === 0) pageNumber = 1;

    segments.push({
      sourceText: element.Text.trim(),
      path: element.Path,
      elementType,
      pageNumber,
      bounds: element.Bounds,
      font: element.Font ? {
        name: element.Font.name || element.Font.family_name || 'unknown',
        size: element.TextSize || 12,
        weight: element.Font.weight,
        italic: element.Font.italic,
      } : undefined,
    });
  }

  return {
    segments,
    pageCount: result.pages.length,
    metadata: {
      version: result.version,
      pages: result.pages.map(p => ({ width: p.width, height: p.height })),
      pdfVersion: result.extended_metadata.pdf_version,
      isEncrypted: result.extended_metadata.is_encrypted,
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get element hierarchy level from path.
 * Useful for determining nesting depth of elements.
 */
export function getElementDepth(path: string): number {
  return (path.match(/\//g) || []).length - 2; // Subtract 2 for "//Document"
}

/**
 * Check if element is a heading
 */
export function isHeading(elementType: string): boolean {
  return /^H[1-6]$/.test(elementType);
}

/**
 * Check if element is a list item
 */
export function isListItem(elementType: string): boolean {
  return ['Li', 'LI', 'Lbl', 'LBody'].includes(elementType);
}

/**
 * Check if element is a table
 */
export function isTable(elementType: string): boolean {
  return ['Table', 'TR', 'TD', 'TH'].includes(elementType);
}
