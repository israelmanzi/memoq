import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import PDFDocumentKit from 'pdfkit';
import type { PdfStructureMetadataV2 } from './pdf-parser.service.js';

// ============================================================================
// Interfaces
// ============================================================================

export interface PdfExportSegment {
  sourceText: string;
  targetText: string | null;
}

export interface PdfExportOptions {
  segments: PdfExportSegment[];
  filename: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface PdfInPlaceExportOptions {
  originalPdfBuffer: Buffer;
  segments: PdfExportSegment[];
  structureMetadata: PdfStructureMetadataV2;
}

export interface PdfExportResult {
  content: Buffer;
  mimeType: string;
  extension: string;
}

// ============================================================================
// Layout-Preserving Export (using pdf-lib)
// ============================================================================

/**
 * Export PDF by overlaying translated text on the original PDF.
 * Preserves original layout, images, and formatting.
 */
export async function exportToPdfInPlace(options: PdfInPlaceExportOptions): Promise<PdfExportResult> {
  const { originalPdfBuffer, segments, structureMetadata } = options;

  // Load the original PDF
  const pdfDoc = await PDFDocument.load(originalPdfBuffer, {
    ignoreEncryption: true,
  });

  // Register fontkit for custom font support
  pdfDoc.registerFontkit(fontkit);

  // Get standard font (Helvetica supports basic Latin)
  // For full Unicode, we'd need to embed a custom font
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();

  // Process each segment
  for (const mapping of structureMetadata.segmentMappings) {
    const segment = segments[mapping.segmentIndex];
    if (!segment) continue;

    const targetText = segment.targetText ?? segment.sourceText;
    if (!targetText || targetText === mapping.originalText) continue;

    // Get positions for this segment
    for (const pos of mapping.positions) {
      const pageIndex = pos.pageNumber - 1;
      const page = pages[pageIndex];
      if (!page) continue;

      // PDF coordinates: Y increases upward from bottom
      // pos.y is the baseline position from PDF.js (also bottom-up)
      const fontSize = Math.max(pos.height * 0.9, 8); // Slightly smaller to fit

      // Draw white rectangle to cover original text
      page.drawRectangle({
        x: pos.x - 1,
        y: pos.y - 2,
        width: pos.width + 4,
        height: pos.height + 4,
        color: rgb(1, 1, 1), // White
      });

      // Draw translated text
      try {
        page.drawText(targetText, {
          x: pos.x,
          y: pos.y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          maxWidth: pos.width * 1.5, // Allow some overflow
        });
      } catch {
        // Font might not support all characters - skip this segment
        // In production, we'd use a Unicode font
      }
    }
  }

  const outputBuffer = await pdfDoc.save();

  return {
    content: Buffer.from(outputBuffer),
    mimeType: 'application/pdf',
    extension: 'pdf',
  };
}

// ============================================================================
// Standard Export (using PDFKit) - Improved with better formatting
// ============================================================================

/**
 * Generate a new PDF with translated text.
 * Used as fallback when original PDF is not available.
 */
export async function exportToPdf(options: PdfExportOptions): Promise<PdfExportResult> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentKit({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: options.filename,
        Author: 'OXY Translation Management System',
      },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve({
        content: Buffer.concat(chunks),
        mimeType: 'application/pdf',
        extension: 'pdf',
      });
    });
    doc.on('error', reject);

    // Title
    doc.fontSize(18).font('Helvetica-Bold');
    doc.text(options.filename, { align: 'center' });
    doc.moveDown(0.5);

    // Language info
    doc.fontSize(10).font('Helvetica');
    doc.fillColor('#666666');
    doc.text(`${options.sourceLanguage} → ${options.targetLanguage}`, { align: 'center' });
    doc.moveDown(1);

    // Horizontal line
    doc
      .strokeColor('#cccccc')
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .stroke();
    doc.moveDown(1);

    // Content
    doc.fillColor('#000000');
    doc.fontSize(11).font('Helvetica');

    // Group segments into paragraphs (consecutive segments on same line)
    let currentParagraph: string[] = [];

    for (let i = 0; i < options.segments.length; i++) {
      const segment = options.segments[i];
      if (!segment) continue;

      const text = segment.targetText || segment.sourceText;
      currentParagraph.push(text);

      // Check if next segment starts a new paragraph (simple heuristic)
      const nextSegment = options.segments[i + 1];
      const isEndOfParagraph =
        !nextSegment ||
        text.endsWith('.') ||
        text.endsWith('!') ||
        text.endsWith('?') ||
        text.endsWith(':');

      if (isEndOfParagraph && currentParagraph.length > 0) {
        // Check if we need a new page
        if (doc.y > doc.page.height - 100) {
          doc.addPage();
        }

        const paragraphText = currentParagraph.join(' ');
        doc.text(paragraphText, {
          align: 'justify',
          lineGap: 4,
          paragraphGap: 8,
        });
        doc.moveDown(0.3);
        currentParagraph = [];
      }
    }

    // Handle any remaining text
    if (currentParagraph.length > 0) {
      const paragraphText = currentParagraph.join(' ');
      doc.text(paragraphText, {
        align: 'justify',
        lineGap: 4,
      });
    }

    // Footer with page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(9).fillColor('#999999');
      doc.text(`Page ${i + 1} of ${range.count}`, 50, doc.page.height - 30, {
        align: 'center',
        width: doc.page.width - 100,
      });
    }

    doc.end();
  });
}

// ============================================================================
// Bilingual PDF Export
// ============================================================================

/**
 * Generate a bilingual PDF with source and target text side by side.
 */
export async function exportToBilingualPdf(options: PdfExportOptions): Promise<PdfExportResult> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentKit({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: {
        Title: `${options.filename} (Bilingual)`,
        Author: 'OXY Translation Management System',
      },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve({
        content: Buffer.concat(chunks),
        mimeType: 'application/pdf',
        extension: 'pdf',
      });
    });
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const columnWidth = (pageWidth - 100) / 2;
    const leftColumnX = 40;
    const rightColumnX = leftColumnX + columnWidth + 20;

    // Title
    doc.fontSize(16).font('Helvetica-Bold');
    doc.text(options.filename, { align: 'center' });
    doc.moveDown(0.3);

    // Column headers
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#666666');
    doc.text(options.sourceLanguage, leftColumnX, doc.y, { width: columnWidth });
    doc.text(options.targetLanguage, rightColumnX, doc.y - doc.currentLineHeight(), { width: columnWidth });
    doc.moveDown(0.5);

    // Horizontal line
    const lineY = doc.y;
    doc
      .strokeColor('#cccccc')
      .lineWidth(1)
      .moveTo(40, lineY)
      .lineTo(pageWidth - 40, lineY)
      .stroke();
    doc.moveDown(0.5);

    // Content
    doc.fontSize(10).font('Helvetica').fillColor('#000000');

    for (const segment of options.segments) {
      const sourceText = segment.sourceText;
      const targetText = segment.targetText || '';

      // Check if we need a new page
      const estimatedHeight = Math.max(
        doc.heightOfString(sourceText, { width: columnWidth }),
        doc.heightOfString(targetText, { width: columnWidth })
      );

      if (doc.y + estimatedHeight > doc.page.height - 60) {
        doc.addPage();
        doc.y = 40;
      }

      const startY = doc.y;

      // Source text (left column)
      doc.fillColor('#333333');
      doc.text(sourceText, leftColumnX, startY, {
        width: columnWidth,
        align: 'left',
      });

      const sourceEndY = doc.y;

      // Target text (right column)
      doc.fillColor('#000000');
      doc.text(targetText, rightColumnX, startY, {
        width: columnWidth,
        align: 'left',
      });

      const targetEndY = doc.y;

      // Move to the bottom of whichever column is taller
      doc.y = Math.max(sourceEndY, targetEndY);
      doc.moveDown(0.3);

      // Light separator line
      doc
        .strokeColor('#eeeeee')
        .lineWidth(0.5)
        .moveTo(40, doc.y)
        .lineTo(pageWidth - 40, doc.y)
        .stroke();
      doc.moveDown(0.3);
    }

    // Footer with page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#999999');
      doc.text(`Page ${i + 1} of ${range.count}`, 40, doc.page.height - 25, {
        align: 'center',
        width: pageWidth - 80,
      });
    }

    doc.end();
  });
}
