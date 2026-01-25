import { api } from './client';
import type { TranslationMemory, TranslationUnit, TMMatch } from '@memoq/shared';

export interface CreateTMInput {
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TMWithStats extends TranslationMemory {
  unitCount: number;
  lastUpdated: string | null;
}

export interface AddUnitInput {
  sourceText: string;
  targetText: string;
  contextPrev?: string;
  contextNext?: string;
  metadata?: Record<string, unknown>;
}

export const tmApi = {
  list: (orgId: string) => api.get<{ items: TranslationMemory[] }>(`/tm/org/${orgId}`),

  get: (tmId: string) => api.get<TMWithStats>(`/tm/${tmId}`),

  create: (orgId: string, data: CreateTMInput) => api.post<TranslationMemory>(`/tm/org/${orgId}`, data),

  update: (tmId: string, name: string) => api.patch<TranslationMemory>(`/tm/${tmId}`, { name }),

  delete: (tmId: string) => api.delete(`/tm/${tmId}`),

  // Units
  listUnits: (tmId: string, limit = 100, offset = 0) =>
    api.get<{ items: TranslationUnit[]; total: number }>(`/tm/${tmId}/units?limit=${limit}&offset=${offset}`),

  addUnit: (tmId: string, data: AddUnitInput) => api.post<TranslationUnit>(`/tm/${tmId}/units`, data),

  addUnitsBulk: (tmId: string, units: AddUnitInput[]) =>
    api.post<{ imported: number }>(`/tm/${tmId}/units/bulk`, { units }),

  deleteUnit: (tmId: string, unitId: string) => api.delete(`/tm/${tmId}/units/${unitId}`),

  // Matching
  findMatches: (orgId: string, sourceText: string, minMatchPercent = 50) =>
    api.post<{ matches: TMMatch[] }>(`/tm/org/${orgId}/match`, { sourceText, minMatchPercent }),

  findMatchesInTMs: (tmIds: string[], sourceText: string, minMatchPercent = 50) =>
    api.post<{ matches: TMMatch[] }>('/tm/match', { tmIds, sourceText, minMatchPercent }),
};
