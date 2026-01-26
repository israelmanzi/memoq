import PDFDocument from 'pdfkit';

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

export interface PdfExportResult {
  content: Buffer;
  mimeType: string;
  extension: string;
}

/**
 * Generate a PDF with translated text
 */
export async function exportToPdf(options: PdfExportOptions): Promise<PdfExportResult> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: options.filename,
        Author: 'OXY Translation Management System',
      },
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

    for (const segment of options.segments) {
      const text = segment.targetText || segment.sourceText;

      // Check if we need a new page
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }

      doc.text(text, {
        align: 'left',
        lineGap: 4,
      });
      doc.moveDown(0.5);
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
