import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ============================================================================
// Configuration
// ============================================================================

const PDF_CONVERTER_URL = env.PDF_CONVERTER_URL;

/**
 * Check if document conversion is enabled
 */
export function isConversionEnabled(): boolean {
  return !!PDF_CONVERTER_URL;
}

// ============================================================================
// PDF to DOCX Conversion
// ============================================================================

export interface PdfToDocxResult {
  docxBuffer: Buffer;
}

export interface PdfToDocxOptions {
  /** Original filename (for logging and conversion service) */
  filename?: string;
}

/**
 * Convert a PDF file to DOCX format using the PDF converter microservice (LibreOffice).
 * Returns the DOCX buffer for further processing.
 */
export async function convertPdfToDocx(
  pdfBuffer: Buffer,
  options: PdfToDocxOptions = {}
): Promise<PdfToDocxResult> {
  if (!PDF_CONVERTER_URL) {
    throw new Error('Document conversion is not configured. Set PDF_CONVERTER_URL environment variable.');
  }

  const { filename = 'document.pdf' } = options;

  // Ensure filename has .pdf extension for the conversion service
  const pdfFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;

  try {
    logger.info({ size: pdfBuffer.length, filename: pdfFilename }, 'Starting PDF to DOCX conversion (LibreOffice)');

    const formData = new FormData();
    formData.append('file', new Blob([pdfBuffer]), pdfFilename);

    const response = await fetch(`${PDF_CONVERTER_URL}/convert/pdf-to-docx`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' })) as { detail?: string };
      throw new Error(`PDF conversion failed: ${errorData.detail || response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const docxBuffer = Buffer.from(arrayBuffer);

    logger.info({ inputSize: pdfBuffer.length, outputSize: docxBuffer.length }, 'PDF to DOCX conversion completed');

    return { docxBuffer };
  } catch (error) {
    logger.error({ error }, 'PDF to DOCX conversion failed');
    throw new Error(`PDF to DOCX conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// DOCX to PDF Conversion
// ============================================================================

export interface DocxToPdfResult {
  pdfBuffer: Buffer;
}

export interface DocxToPdfOptions {
  /** Original filename (for logging and conversion service) */
  filename?: string;
}

/**
 * Convert a DOCX file to PDF format using the PDF converter microservice (LibreOffice).
 * Returns the PDF buffer.
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer,
  options: DocxToPdfOptions = {}
): Promise<DocxToPdfResult> {
  if (!PDF_CONVERTER_URL) {
    throw new Error('Document conversion is not configured. Set PDF_CONVERTER_URL environment variable.');
  }

  const { filename = 'document.docx' } = options;

  // Ensure filename has .docx extension for the conversion service
  const docxFilename = filename.toLowerCase().endsWith('.docx') ? filename : `${filename}.docx`;

  try {
    logger.info({ size: docxBuffer.length, filename: docxFilename }, 'Starting DOCX to PDF conversion (LibreOffice)');

    const formData = new FormData();
    formData.append('file', new Blob([docxBuffer]), docxFilename);

    const response = await fetch(`${PDF_CONVERTER_URL}/convert/docx-to-pdf`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' })) as { detail?: string };
      throw new Error(`DOCX to PDF conversion failed: ${errorData.detail || response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    logger.info({ inputSize: docxBuffer.length, outputSize: pdfBuffer.length }, 'DOCX to PDF conversion completed');

    return { pdfBuffer };
  } catch (error) {
    logger.error({ error }, 'DOCX to PDF conversion failed');
    throw new Error(`DOCX to PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check if the PDF converter service is healthy
 */
export async function checkConverterHealth(): Promise<{ healthy: boolean; version?: string; engine?: string }> {
  if (!PDF_CONVERTER_URL) {
    return { healthy: false };
  }

  try {
    const response = await fetch(`${PDF_CONVERTER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      return { healthy: false };
    }

    const data = await response.json() as { status: string; version: string; engine?: string };
    return {
      healthy: data.status === 'healthy',
      version: data.version,
      engine: data.engine,
    };
  } catch {
    return { healthy: false };
  }
}
