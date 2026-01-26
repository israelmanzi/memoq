import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfParseResult {
  segments: Array<{ sourceText: string; targetText?: string }>;
  pageCount: number;
}

/**
 * Parse a PDF file and extract text segments
 */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const data = new Uint8Array(buffer);

  const pdf = await getDocumentProxy(data);
  const { text: fullText } = await extractText(pdf, { mergePages: false });

  const segments: Array<{ sourceText: string }> = [];

  // fullText is an array of page texts when mergePages is false
  for (const pageText of fullText) {
    const cleanedText = pageText.replace(/\s+/g, ' ').trim();

    if (cleanedText) {
      // Split page text into sentences
      const sentences = splitIntoSentences(cleanedText);
      for (const sentence of sentences) {
        if (sentence.trim()) {
          segments.push({ sourceText: sentence.trim() });
        }
      }
    }
  }

  return {
    segments,
    pageCount: pdf.numPages,
  };
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Check for sentence end: punctuation followed by space and capital letter (or end)
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

  // If no sentence breaks found, return paragraphs based on double spaces or the whole text
  if (sentences.length === 0 && text.trim()) {
    const paragraphs = text.split(/\s{2,}/).filter((p) => p.trim());
    return paragraphs.length > 0 ? paragraphs : [text.trim()];
  }

  return sentences;
}
