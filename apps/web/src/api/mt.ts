/**
 * Machine Translation API
 */

import { api } from './client';

export interface MTStatus {
  enabled: boolean;
  provider: string | null;
  message?: string;
  usage?: {
    used: number;
    limit: number;
    percentUsed: number;
  };
}

export interface MTTranslateResult {
  segmentId: string;
  sourceText: string;
  translatedText: string;
  detectedSourceLanguage?: string;
}

export interface MTBatchResult {
  translated: number;
  detectedSourceLanguage?: string;
}

export const mtApi = {
  /**
   * Get MT service status
   */
  async getStatus(): Promise<MTStatus> {
    return api.get('/mt/status');
  },

  /**
   * Translate a single segment
   */
  async translateSegment(segmentId: string): Promise<MTTranslateResult> {
    return api.post('/mt/translate/segment', { segmentId });
  },

  /**
   * Translate multiple segments in batch
   */
  async translateBatch(
    documentId: string,
    options?: { segmentIds?: string[]; overwrite?: boolean }
  ): Promise<MTBatchResult> {
    return api.post('/mt/translate/batch', {
      documentId,
      segmentIds: options?.segmentIds,
      overwrite: options?.overwrite ?? false,
    });
  },

  /**
   * Get supported languages
   */
  async getLanguages(): Promise<{ languages: Array<{ code: string; name: string }> }> {
    return api.get('/mt/languages');
  },
};
