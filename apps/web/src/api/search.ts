import { api } from './client';

export interface SegmentSearchResult {
  id: string;
  sourceText: string;
  targetText: string | null;
  status: string;
  documentId: string;
  documentName: string;
  projectId: string;
  projectName: string;
}

export interface TMUnitSearchResult {
  id: string;
  sourceText: string;
  targetText: string;
  tmId: string;
  tmName: string;
}

export interface TermSearchResult {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  definition: string | null;
  tbId: string;
  tbName: string;
}

export interface SearchResults {
  query: string;
  segments: {
    items: SegmentSearchResult[];
    total: number;
  };
  tmUnits: {
    items: TMUnitSearchResult[];
    total: number;
  };
  terms: {
    items: TermSearchResult[];
    total: number;
  };
}

export interface TypedSearchResults<T> {
  query: string;
  type: string;
  items: T[];
  total: number;
}

export type SearchType = 'all' | 'segments' | 'tm' | 'terms';

export const searchApi = {
  search: (orgId: string, query: string, type: SearchType = 'all', limit = 20) => {
    const params = new URLSearchParams({
      q: query,
      type,
      limit: String(limit),
    });
    return api.get<SearchResults>(`/search/org/${orgId}?${params}`);
  },

  searchSegments: (orgId: string, query: string, limit = 20) => {
    const params = new URLSearchParams({
      q: query,
      type: 'segments',
      limit: String(limit),
    });
    return api.get<TypedSearchResults<SegmentSearchResult>>(`/search/org/${orgId}?${params}`);
  },

  searchTMUnits: (orgId: string, query: string, limit = 20) => {
    const params = new URLSearchParams({
      q: query,
      type: 'tm',
      limit: String(limit),
    });
    return api.get<TypedSearchResults<TMUnitSearchResult>>(`/search/org/${orgId}?${params}`);
  },

  searchTerms: (orgId: string, query: string, limit = 20) => {
    const params = new URLSearchParams({
      q: query,
      type: 'terms',
      limit: String(limit),
    });
    return api.get<TypedSearchResults<TermSearchResult>>(`/search/org/${orgId}?${params}`);
  },
};
