import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

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

export interface DocxStructureMetadata {
  version: number;
  paragraphs: DocxParagraphMeta[];
}

export interface DocxParseResult {
  segments: Array<{ sourceText: string; targetText?: string }>;
  structureMetadata: DocxStructureMetadata;
}

/**
 * Parse a DOCX file and extract text segments with structure metadata
 */
export async function parseDocx(buffer: Buffer): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

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

  // Get paragraphs - handle both single and array
  const paras = Array.isArray(body['w:p']) ? body['w:p'] : body['w:p'] ? [body['w:p']] : [];

  let segmentIndex = 0;

  for (let paraIndex = 0; paraIndex < paras.length; paraIndex++) {
    const para = paras[paraIndex];
    const paraText = extractParagraphText(para);

    if (!paraText.trim()) {
      continue; // Skip empty paragraphs
    }

    // Get paragraph style and formatting
    const pStyle = para['w:pPr']?.['w:pStyle']?.['@_w:val'];
    const formatting = extractParagraphFormatting(para);

    // Split long paragraphs into sentences
    const sentences = splitIntoSentences(paraText);
    const segmentIndices: number[] = [];

    for (const sentence of sentences) {
      if (sentence.trim()) {
        segments.push({ sourceText: sentence.trim() });
        segmentIndices.push(segmentIndex);
        segmentIndex++;
      }
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
      version: 1,
      paragraphs,
    },
  };
}

/**
 * Extract text content from a paragraph element
 */
function extractParagraphText(para: any): string {
  if (!para) return '';

  const texts: string[] = [];

  // Get runs (w:r elements) - these contain the actual text
  const runs = Array.isArray(para['w:r']) ? para['w:r'] : para['w:r'] ? [para['w:r']] : [];

  for (const run of runs) {
    // Get text from w:t elements
    const textElements = Array.isArray(run['w:t']) ? run['w:t'] : run['w:t'] ? [run['w:t']] : [];

    for (const t of textElements) {
      if (typeof t === 'string') {
        texts.push(t);
      } else if (t && t['#text'] !== undefined) {
        texts.push(String(t['#text']));
      } else if (t && typeof t === 'object') {
        // Text might be the value itself with preserve space attribute
        const textValue = Object.values(t).find((v) => typeof v === 'string');
        if (textValue) {
          texts.push(textValue);
        }
      }
    }

    // Handle tab characters
    if (run['w:tab']) {
      texts.push('\t');
    }

    // Handle line breaks within paragraph
    if (run['w:br']) {
      texts.push(' ');
    }
  }

  return texts.join('');
}

/**
 * Extract formatting information from a paragraph
 */
function extractParagraphFormatting(para: any): DocxParagraphMeta['formatting'] {
  const formatting: DocxParagraphMeta['formatting'] = {};

  // Check paragraph-level formatting
  const pPr = para['w:pPr'];
  if (pPr) {
    // Paragraph-level bold/italic are less common, but check anyway
  }

  // Check first run for formatting (simplified - assumes consistent formatting)
  const runs = Array.isArray(para['w:r']) ? para['w:r'] : para['w:r'] ? [para['w:r']] : [];
  if (runs.length > 0) {
    const rPr = runs[0]['w:rPr'];
    if (rPr) {
      if (rPr['w:b'] !== undefined) formatting.bold = true;
      if (rPr['w:i'] !== undefined) formatting.italic = true;
      if (rPr['w:u'] !== undefined) formatting.underline = true;
    }
  }

  return Object.keys(formatting).length > 0 ? formatting : undefined;
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Simple sentence splitting - split on sentence-ending punctuation
  // followed by space and capital letter or end of string
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Check for sentence end
    if (
      (text[i] === '.' || text[i] === '!' || text[i] === '?') &&
      (i + 1 >= text.length ||
        (text[i + 1] === ' ' && i + 2 < text.length && /[A-Z\u00C0-\u024F]/.test(text[i + 2] ?? '')))
    ) {
      sentences.push(current.trim());
      current = '';
      if (i + 1 < text.length && text[i + 1] === ' ') {
        i++; // Skip the space
      }
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  // If no sentence breaks found, return the whole text
  if (sentences.length === 0 && text.trim()) {
    return [text.trim()];
  }

  return sentences;
}
