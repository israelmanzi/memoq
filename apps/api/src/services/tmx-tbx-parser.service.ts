import { XMLParser } from 'fast-xml-parser';

export interface TMXUnit {
  sourceText: string;
  targetText: string;
  metadata?: Record<string, unknown>;
}

export interface TMXParseResult {
  units: TMXUnit[];
  sourceLanguage?: string;
  targetLanguage?: string;
  warnings: string[];
}

export interface TBXTerm {
  sourceTerm: string;
  targetTerm: string;
  definition?: string;
}

export interface TBXParseResult {
  terms: TBXTerm[];
  sourceLanguage?: string;
  targetLanguage?: string;
  warnings: string[];
}

export interface ParseOptions {
  expectedSourceLanguage?: string;
  expectedTargetLanguage?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  preserveOrder: false,
});

/**
 * Parse TMX (Translation Memory eXchange) file
 *
 * TMX 1.4 structure:
 * <tmx>
 *   <header srclang="en" />
 *   <body>
 *     <tu>
 *       <tuv xml:lang="en"><seg>Hello</seg></tuv>
 *       <tuv xml:lang="de"><seg>Hallo</seg></tuv>
 *     </tu>
 *   </body>
 * </tmx>
 */
export function parseTMX(buffer: Buffer, options?: ParseOptions): TMXParseResult {
  const xml = buffer.toString('utf-8');
  const warnings: string[] = [];
  const units: TMXUnit[] = [];

  let doc: any;
  try {
    doc = xmlParser.parse(xml);
  } catch (error: any) {
    throw new Error(`Invalid XML: ${error.message}`);
  }

  const tmx = doc.tmx;
  if (!tmx) {
    throw new Error('Invalid TMX file: missing <tmx> root element');
  }

  // Extract source language from header
  const header = tmx.header;
  let sourceLanguage = header?.['@_srclang'] || header?.['@_xml:lang'];

  // Get body
  const body = tmx.body;
  if (!body) {
    throw new Error('Invalid TMX file: missing <body> element');
  }

  // Get translation units
  const tuArray = body.tu;
  if (!tuArray) {
    return { units: [], sourceLanguage, warnings: ['No translation units found in TMX file'] };
  }

  const tus = Array.isArray(tuArray) ? tuArray : [tuArray];
  let targetLanguage: string | undefined;
  let skipped = 0;

  for (const tu of tus) {
    const tuvArray = tu.tuv;
    if (!tuvArray) {
      skipped++;
      continue;
    }

    const tuvs = Array.isArray(tuvArray) ? tuvArray : [tuvArray];

    // Build a map of language -> segment text
    const langMap = new Map<string, string>();

    for (const tuv of tuvs) {
      const lang = normalizeLanguage(tuv['@_xml:lang'] || tuv['@_lang']);
      if (!lang) continue;

      const seg = tuv.seg;
      const text = extractText(seg);
      if (text) {
        langMap.set(lang, text);
      }
    }

    // Determine source and target languages
    const langs = Array.from(langMap.keys());

    if (langs.length < 2) {
      skipped++;
      continue;
    }

    // If we have a known source language, use it; otherwise use first lang
    let srcLang = sourceLanguage;
    if (!srcLang || !langMap.has(normalizeLanguage(srcLang))) {
      srcLang = langs[0];
    }
    srcLang = normalizeLanguage(srcLang);

    // Find target language (first language that's not source)
    const tgtLang = langs.find(l => normalizeLanguage(l) !== srcLang);
    if (!tgtLang) {
      skipped++;
      continue;
    }

    if (!sourceLanguage) {
      sourceLanguage = srcLang;
    }
    if (!targetLanguage) {
      targetLanguage = tgtLang;
    }

    const sourceText = langMap.get(srcLang) || langMap.get(normalizeLanguage(srcLang));
    const targetText = langMap.get(tgtLang) || langMap.get(normalizeLanguage(tgtLang));

    if (sourceText && targetText) {
      units.push({
        sourceText,
        targetText,
      });
    } else {
      skipped++;
    }
  }

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} translation unit(s) due to missing source or target`);
  }

  // Check for language mismatch
  if (options?.expectedSourceLanguage && sourceLanguage) {
    if (normalizeLanguage(options.expectedSourceLanguage) !== normalizeLanguage(sourceLanguage)) {
      warnings.push(`Source language mismatch: expected "${options.expectedSourceLanguage}", got "${sourceLanguage}"`);
    }
  }
  if (options?.expectedTargetLanguage && targetLanguage) {
    if (normalizeLanguage(options.expectedTargetLanguage) !== normalizeLanguage(targetLanguage)) {
      warnings.push(`Target language mismatch: expected "${options.expectedTargetLanguage}", got "${targetLanguage}"`);
    }
  }

  return { units, sourceLanguage, targetLanguage, warnings };
}

/**
 * Parse TBX (TermBase eXchange) file
 *
 * TBX structure (simplified):
 * <martif>
 *   <text>
 *     <body>
 *       <termEntry>
 *         <langSet xml:lang="en">
 *           <tig><term>computer</term></tig>
 *           <descrip type="definition">...</descrip>
 *         </langSet>
 *         <langSet xml:lang="de">
 *           <tig><term>Computer</term></tig>
 *         </langSet>
 *       </termEntry>
 *     </body>
 *   </text>
 * </martif>
 */
export function parseTBX(buffer: Buffer, options?: ParseOptions): TBXParseResult {
  const xml = buffer.toString('utf-8');
  const warnings: string[] = [];
  const terms: TBXTerm[] = [];

  let doc: any;
  try {
    doc = xmlParser.parse(xml);
  } catch (error: any) {
    throw new Error(`Invalid XML: ${error.message}`);
  }

  // TBX can have different root elements: martif, TBX, tbx
  const root = doc.martif || doc.TBX || doc.tbx;
  if (!root) {
    throw new Error('Invalid TBX file: missing root element (expected <martif> or <TBX>)');
  }

  // Navigate to body
  const text = root.text;
  const body = text?.body || root.body;
  if (!body) {
    throw new Error('Invalid TBX file: missing <body> element');
  }

  // Get term entries
  const termEntryArray = body.termEntry || body.conceptEntry;
  if (!termEntryArray) {
    return { terms: [], warnings: ['No term entries found in TBX file'] };
  }

  const entries = Array.isArray(termEntryArray) ? termEntryArray : [termEntryArray];
  let sourceLanguage: string | undefined;
  let targetLanguage: string | undefined;
  let skipped = 0;

  for (const entry of entries) {
    const langSetArray = entry.langSet;
    if (!langSetArray) {
      skipped++;
      continue;
    }

    const langSets = Array.isArray(langSetArray) ? langSetArray : [langSetArray];

    // Build a map of language -> { term, definition }
    const langMap = new Map<string, { term: string; definition?: string }>();

    for (const langSet of langSets) {
      const lang = normalizeLanguage(langSet['@_xml:lang'] || langSet['@_lang']);
      if (!lang) continue;

      // Get term from tig or ntig (term information group)
      const tig = langSet.tig || langSet.ntig;
      const tigArray = Array.isArray(tig) ? tig : (tig ? [tig] : []);

      let termText: string | undefined;
      for (const t of tigArray) {
        const term = t.term;
        termText = extractText(term);
        if (termText) break;
      }

      // Also check for direct term element (some TBX variants)
      if (!termText && langSet.term) {
        termText = extractText(langSet.term);
      }

      // Get definition if available
      let definition: string | undefined;
      const descrip = langSet.descrip;
      if (descrip) {
        const descripArray = Array.isArray(descrip) ? descrip : [descrip];
        for (const d of descripArray) {
          if (d['@_type'] === 'definition' || !d['@_type']) {
            definition = extractText(d);
            if (definition) break;
          }
        }
      }

      if (termText) {
        langMap.set(lang, { term: termText, definition });
      }
    }

    const langs = Array.from(langMap.keys());
    if (langs.length < 2) {
      skipped++;
      continue;
    }

    // Determine source and target
    if (!sourceLanguage) {
      sourceLanguage = langs[0];
    }
    const srcLang = normalizeLanguage(sourceLanguage);
    const tgtLang = langs.find(l => normalizeLanguage(l) !== srcLang);

    if (!tgtLang) {
      skipped++;
      continue;
    }

    if (!targetLanguage) {
      targetLanguage = tgtLang;
    }

    const sourceEntry = langMap.get(srcLang) || (sourceLanguage ? langMap.get(sourceLanguage) : undefined);
    const targetEntry = langMap.get(tgtLang) || (targetLanguage ? langMap.get(targetLanguage) : undefined);

    if (sourceEntry?.term && targetEntry?.term) {
      terms.push({
        sourceTerm: sourceEntry.term,
        targetTerm: targetEntry.term,
        definition: sourceEntry.definition || targetEntry.definition,
      });
    } else {
      skipped++;
    }
  }

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} term entry(ies) due to missing source or target`);
  }

  // Check for language mismatch
  if (options?.expectedSourceLanguage && sourceLanguage) {
    if (normalizeLanguage(options.expectedSourceLanguage) !== normalizeLanguage(sourceLanguage)) {
      warnings.push(`Source language mismatch: expected "${options.expectedSourceLanguage}", got "${sourceLanguage}"`);
    }
  }
  if (options?.expectedTargetLanguage && targetLanguage) {
    if (normalizeLanguage(options.expectedTargetLanguage) !== normalizeLanguage(targetLanguage)) {
      warnings.push(`Target language mismatch: expected "${options.expectedTargetLanguage}", got "${targetLanguage}"`);
    }
  }

  return { terms, sourceLanguage, targetLanguage, warnings };
}

/**
 * Normalize language code for comparison
 * e.g., "en-US" -> "en", "EN" -> "en"
 */
function normalizeLanguage(lang: string | undefined): string {
  if (!lang) return '';
  // Take first part before hyphen/underscore and lowercase
  return lang.split(/[-_]/)[0]?.toLowerCase() || lang.toLowerCase();
}

/**
 * Extract text content from XML element
 */
function extractText(element: any): string {
  if (!element) return '';

  if (typeof element === 'string') {
    return element.trim();
  }

  if (typeof element === 'number') {
    return String(element);
  }

  if (typeof element === 'object') {
    // Simple text content
    if (element['#text'] !== undefined) {
      return String(element['#text']).trim();
    }

    // Recursively extract text from nested elements
    let text = '';
    for (const key of Object.keys(element)) {
      if (key.startsWith('@_')) continue; // Skip attributes

      const value = element[key];
      if (typeof value === 'string') {
        text += value;
      } else if (Array.isArray(value)) {
        text += value.map(extractText).join('');
      } else if (typeof value === 'object' && value !== null) {
        text += extractText(value);
      }
    }
    return text.trim();
  }

  return '';
}
