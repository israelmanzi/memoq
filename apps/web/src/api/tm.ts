import { api, ApiError } from './client';
import type { TranslationMemory, TranslationUnit, TMMatch } from '@oxy/shared';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export interface CreateTMInput {
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TMWithCreator extends TranslationMemory {
  createdByName: string | null;
}

export interface TMWithStats extends TranslationMemory {
  unitCount: number;
  lastUpdated: string | null;
}

export interface TMDeleteInfo {
  unitCount: number;
  linkedProjects: Array<{ id: string; name: string }>;
}

export interface AddUnitInput {
  sourceText: string;
  targetText: string;
  contextPrev?: string;
  contextNext?: string;
  metadata?: Record<string, unknown>;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface TMXUploadResult {
  imported: number;
  sourceLanguage?: string;
  targetLanguage?: string;
  warnings: string[];
}

export const tmApi = {
  list: (orgId: string, options?: PaginationParams) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString() ? `?${params}` : '';
    return api.get<{ items: TMWithCreator[]; total: number }>(`/tm/org/${orgId}${query}`);
  },

  get: (tmId: string) => api.get<TMWithStats>(`/tm/${tmId}`),

  create: (orgId: string, data: CreateTMInput) => api.post<TranslationMemory>(`/tm/org/${orgId}`, data),

  update: (tmId: string, name: string) => api.patch<TranslationMemory>(`/tm/${tmId}`, { name }),

  delete: (tmId: string) => api.delete(`/tm/${tmId}`),

  getDeleteInfo: (tmId: string) => api.get<TMDeleteInfo>(`/tm/${tmId}/delete-info`),

  // Units
  listUnits: (tmId: string, limit = 100, offset = 0) =>
    api.get<{ items: TranslationUnit[]; total: number }>(`/tm/${tmId}/units?limit=${limit}&offset=${offset}`),

  addUnit: (tmId: string, data: AddUnitInput) => api.post<TranslationUnit>(`/tm/${tmId}/units`, data),

  addUnitsBulk: (tmId: string, units: AddUnitInput[]) =>
    api.post<{ imported: number }>(`/tm/${tmId}/units/bulk`, { units }),

  deleteUnit: (tmId: string, unitId: string) => api.delete(`/tm/${tmId}/units/${unitId}`),

  uploadTMX: async (tmId: string, file: File): Promise<TMXUploadResult> => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/tm/${tmId}/upload`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(response.status, data);
    }

    return data;
  },

  // Matching
  findMatches: (orgId: string, sourceText: string, minMatchPercent = 50) =>
    api.post<{ matches: TMMatch[] }>(`/tm/org/${orgId}/match`, { sourceText, minMatchPercent }),

  findMatchesInTMs: (tmIds: string[], sourceText: string, minMatchPercent = 50) =>
    api.post<{ matches: TMMatch[] }>('/tm/match', { tmIds, sourceText, minMatchPercent }),
};
