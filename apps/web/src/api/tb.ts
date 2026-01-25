import { api } from './client';
import type { TermBase, Term, TermMatch } from '@memoq/shared';

export interface CreateTBInput {
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TBWithCreator extends TermBase {
  createdByName: string | null;
}

export interface TBWithStats extends TermBase {
  termCount: number;
}

export interface AddTermInput {
  sourceTerm: string;
  targetTerm: string;
  definition?: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export const tbApi = {
  list: (orgId: string, options?: PaginationParams) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString() ? `?${params}` : '';
    return api.get<{ items: TBWithCreator[]; total: number }>(`/tb/org/${orgId}${query}`);
  },

  get: (tbId: string) => api.get<TBWithStats>(`/tb/${tbId}`),

  create: (orgId: string, data: CreateTBInput) => api.post<TermBase>(`/tb/org/${orgId}`, data),

  update: (tbId: string, name: string) => api.patch<TermBase>(`/tb/${tbId}`, { name }),

  delete: (tbId: string) => api.delete(`/tb/${tbId}`),

  // Terms
  listTerms: (tbId: string, limit = 100, offset = 0, search?: string) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    return api.get<{ items: Term[]; total: number }>(`/tb/${tbId}/terms?${params}`);
  },

  addTerm: (tbId: string, data: AddTermInput) => api.post<Term>(`/tb/${tbId}/terms`, data),

  addTermsBulk: (tbId: string, terms: AddTermInput[]) =>
    api.post<{ imported: number }>(`/tb/${tbId}/terms/bulk`, { terms }),

  updateTerm: (tbId: string, termId: string, data: Partial<AddTermInput>) =>
    api.patch<Term>(`/tb/${tbId}/terms/${termId}`, data),

  deleteTerm: (tbId: string, termId: string) => api.delete(`/tb/${tbId}/terms/${termId}`),

  // Matching
  findTerms: (orgId: string, text: string) =>
    api.post<{ matches: TermMatch[] }>(`/tb/org/${orgId}/match`, { text }),

  findTermsInTBs: (tbIds: string[], text: string) =>
    api.post<{ matches: TermMatch[] }>('/tb/match', { tbIds, text }),
};
