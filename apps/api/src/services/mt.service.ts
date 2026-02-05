/**
 * Machine Translation Service - DeepL Integration
 */

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ============================================================================
// Configuration
// ============================================================================

const DEEPL_API_KEY = env.DEEPL_API_KEY;
const DEEPL_API_URL = DEEPL_API_KEY?.startsWith('free:')
  ? 'https://api-free.deepl.com/v2'
  : 'https://api.deepl.com/v2';

/**
 * Check if MT is enabled
 */
export function isMTEnabled(): boolean {
  return !!DEEPL_API_KEY;
}

// ============================================================================
// Types
// ============================================================================

export interface MTTranslateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  preserveFormatting?: boolean;
}

export interface MTTranslateResult {
  translatedText: string;
  detectedSourceLanguage?: string;
}

export interface MTBatchResult {
  translations: Array<{
    index: number;
    translatedText: string;
  }>;
  detectedSourceLanguage?: string;
}

export interface MTUsage {
  characterCount: number;
  characterLimit: number;
}

// ============================================================================
// Language Mapping
// ============================================================================

// Map our language codes to DeepL language codes
const LANGUAGE_MAP: Record<string, string> = {
  'en': 'EN',
  'en-us': 'EN-US',
  'en-gb': 'EN-GB',
  'de': 'DE',
  'fr': 'FR',
  'es': 'ES',
  'it': 'IT',
  'nl': 'NL',
  'pl': 'PL',
  'pt': 'PT-PT',
  'pt-br': 'PT-BR',
  'ru': 'RU',
  'ja': 'JA',
  'zh': 'ZH',
  'ko': 'KO',
  'ar': 'AR',
  'cs': 'CS',
  'da': 'DA',
  'el': 'EL',
  'fi': 'FI',
  'hu': 'HU',
  'id': 'ID',
  'nb': 'NB',
  'ro': 'RO',
  'sk': 'SK',
  'sv': 'SV',
  'tr': 'TR',
  'uk': 'UK',
};

function mapLanguageCode(code: string): string {
  const normalized = code.toLowerCase();
  return LANGUAGE_MAP[normalized] || code.toUpperCase();
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Translate a single text using DeepL
 */
export async function translateText(
  text: string,
  options: MTTranslateOptions
): Promise<MTTranslateResult> {
  if (!DEEPL_API_KEY) {
    throw new Error('DeepL API key not configured. Set DEEPL_API_KEY environment variable.');
  }

  const sourceLang = mapLanguageCode(options.sourceLanguage);
  const targetLang = mapLanguageCode(options.targetLanguage);

  try {
    const response = await fetch(`${DEEPL_API_URL}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY.replace('free:', '')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLang,
        target_lang: targetLang,
        preserve_formatting: options.preserveFormatting ?? true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error }, 'DeepL API error');

      // Provide user-friendly error messages for common errors
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
      }
      if (response.status === 456) {
        throw new Error('Translation quota exceeded. Contact your administrator.');
      }
      if (response.status === 403) {
        throw new Error('Invalid API key. Machine translation is misconfigured.');
      }
      throw new Error(`DeepL API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      translations: Array<{ text: string; detected_source_language?: string }>;
    };

    const firstTranslation = data.translations?.[0];
    if (!firstTranslation) {
      throw new Error('No translation returned from DeepL');
    }

    return {
      translatedText: firstTranslation.text,
      detectedSourceLanguage: firstTranslation.detected_source_language,
    };
  } catch (error) {
    logger.error({ error }, 'MT translation failed');
    throw error;
  }
}

/**
 * Translate multiple texts in a batch using DeepL
 * More efficient for multiple segments
 */
export async function translateBatch(
  texts: string[],
  options: MTTranslateOptions
): Promise<MTBatchResult> {
  if (!DEEPL_API_KEY) {
    throw new Error('DeepL API key not configured. Set DEEPL_API_KEY environment variable.');
  }

  if (texts.length === 0) {
    return { translations: [] };
  }

  const sourceLang = mapLanguageCode(options.sourceLanguage);
  const targetLang = mapLanguageCode(options.targetLanguage);

  try {
    logger.info({ count: texts.length, sourceLang, targetLang }, 'Starting batch MT translation');

    const response = await fetch(`${DEEPL_API_URL}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY.replace('free:', '')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: texts,
        source_lang: sourceLang,
        target_lang: targetLang,
        preserve_formatting: options.preserveFormatting ?? true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error }, 'DeepL API error');

      // Provide user-friendly error messages for common errors
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
      }
      if (response.status === 456) {
        throw new Error('Translation quota exceeded. Contact your administrator.');
      }
      if (response.status === 403) {
        throw new Error('Invalid API key. Machine translation is misconfigured.');
      }
      throw new Error(`DeepL API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      translations: Array<{ text: string; detected_source_language?: string }>;
    };

    logger.info({ count: data.translations.length }, 'Batch MT translation complete');

    return {
      translations: data.translations.map((t, index) => ({
        index,
        translatedText: t.text,
      })),
      detectedSourceLanguage: data.translations[0]?.detected_source_language,
    };
  } catch (error) {
    logger.error({ error }, 'Batch MT translation failed');
    throw error;
  }
}

/**
 * Get DeepL usage statistics
 */
export async function getUsage(): Promise<MTUsage> {
  if (!DEEPL_API_KEY) {
    throw new Error('DeepL API key not configured');
  }

  try {
    const response = await fetch(`${DEEPL_API_URL}/usage`, {
      method: 'GET',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY.replace('free:', '')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`DeepL API error: ${response.status}`);
    }

    const data = await response.json() as {
      character_count: number;
      character_limit: number;
    };

    return {
      characterCount: data.character_count,
      characterLimit: data.character_limit,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get MT usage');
    throw error;
  }
}

/**
 * Get supported languages from DeepL
 */
export async function getSupportedLanguages(): Promise<Array<{ code: string; name: string }>> {
  if (!DEEPL_API_KEY) {
    throw new Error('DeepL API key not configured');
  }

  try {
    const response = await fetch(`${DEEPL_API_URL}/languages?type=target`, {
      method: 'GET',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY.replace('free:', '')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`DeepL API error: ${response.status}`);
    }

    const data = await response.json() as Array<{ language: string; name: string }>;

    return data.map(lang => ({
      code: lang.language.toLowerCase(),
      name: lang.name,
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to get supported languages');
    throw error;
  }
}
