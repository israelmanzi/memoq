import { useState, useEffect } from 'react';
import { useSearch, useNavigate, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { searchApi, type SearchResults } from '../api';
import { useOrgStore } from '../stores/org';

type TabType = 'all' | 'segments' | 'tm' | 'terms';

export function SearchPage() {
  const navigate = useNavigate();
  const searchParams = useSearch({ from: '/protected/search' });
  const { currentOrg } = useOrgStore();

  const initialQuery = (searchParams as { q?: string }).q || '';
  const [inputValue, setInputValue] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<TabType>('all');

  // Update input when URL changes
  useEffect(() => {
    setInputValue(initialQuery);
  }, [initialQuery]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', currentOrg?.id, initialQuery],
    queryFn: () => searchApi.search(currentOrg!.id, initialQuery, 'all', 50),
    enabled: !!currentOrg && initialQuery.length >= 2,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim().length >= 2) {
      navigate({ to: '/search', search: { q: inputValue.trim() } });
    }
  };

  const getTotalCount = (results: SearchResults | undefined) => {
    if (!results) return 0;
    return results.segments.total + results.tmUnits.total + results.terms.total;
  };

  const getFilteredResults = () => {
    if (!data) return { segments: [], tmUnits: [], terms: [] };

    switch (activeTab) {
      case 'segments':
        return { segments: data.segments.items, tmUnits: [], terms: [] };
      case 'tm':
        return { segments: [], tmUnits: data.tmUnits.items, terms: [] };
      case 'terms':
        return { segments: [], tmUnits: [], terms: data.terms.items };
      default:
        return {
          segments: data.segments.items,
          tmUnits: data.tmUnits.items,
          terms: data.terms.items,
        };
    }
  };

  const filtered = getFilteredResults();

  return (
    <div className="p-4 bg-surface min-h-full">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-text">Search</h1>
        <p className="text-xs text-text-muted" title="Search across all translation content">
          Find segments, TM entries, and terminology
        </p>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search segments, TM entries, and terms..."
            className="w-full px-3 py-1.5 text-sm bg-surface-alt border border-border text-text focus:border-accent focus:outline-none"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={inputValue.trim().length < 2}
          className="px-4 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Search
        </button>
      </form>

      {/* Results */}
      {initialQuery.length >= 2 && (
        <>
          {/* Tabs */}
          <div className="border-b border-border mb-4">
            <nav className="-mb-px flex gap-4">
              <TabButton
                active={activeTab === 'all'}
                onClick={() => setActiveTab('all')}
                count={getTotalCount(data)}
              >
                All
              </TabButton>
              <TabButton
                active={activeTab === 'segments'}
                onClick={() => setActiveTab('segments')}
                count={data?.segments.total ?? 0}
              >
                Segments
              </TabButton>
              <TabButton
                active={activeTab === 'tm'}
                onClick={() => setActiveTab('tm')}
                count={data?.tmUnits.total ?? 0}
              >
                TM Entries
              </TabButton>
              <TabButton
                active={activeTab === 'terms'}
                onClick={() => setActiveTab('terms')}
                count={data?.terms.total ?? 0}
              >
                Terms
              </TabButton>
            </nav>
          </div>

          {/* Results List */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="text-center py-8 text-text-muted text-sm">Searching...</div>
            ) : error ? (
              <div className="text-center py-8 text-danger text-sm">
                Error: {(error as Error).message}
              </div>
            ) : getTotalCount(data) === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">
                No results found for "{initialQuery}"
              </div>
            ) : (
              <>
                {/* Segments */}
                {filtered.segments.map((segment) => (
                  <Link
                    key={`segment-${segment.id}`}
                    to="/documents/$documentId"
                    params={{ documentId: segment.documentId }}
                    className="block bg-surface-alt border border-border p-3 hover:border-accent transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-2xs font-medium bg-accent/10 text-accent">
                        Segment
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-text">
                          <span className="font-medium text-text-muted">Source:</span>{' '}
                          <HighlightedText text={segment.sourceText} query={initialQuery} />
                        </div>
                        {segment.targetText && (
                          <div className="text-xs text-text-secondary mt-1">
                            <span className="font-medium text-text-muted">Target:</span>{' '}
                            <HighlightedText text={segment.targetText} query={initialQuery} />
                          </div>
                        )}
                        <div className="text-2xs text-text-muted mt-1.5">
                          {segment.documentName} &bull; {segment.projectName}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}

                {/* TM Units */}
                {filtered.tmUnits.map((unit) => (
                  <Link
                    key={`tm-${unit.id}`}
                    to="/tm"
                    className="block bg-surface-alt border border-border p-3 hover:border-accent transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-2xs font-medium bg-accent-muted/10 text-accent-muted">
                        TM Entry
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-text">
                          <span className="font-medium text-text-muted">Source:</span>{' '}
                          <HighlightedText text={unit.sourceText} query={initialQuery} />
                        </div>
                        <div className="text-xs text-text-secondary mt-1">
                          <span className="font-medium text-text-muted">Target:</span>{' '}
                          <HighlightedText text={unit.targetText} query={initialQuery} />
                        </div>
                        <div className="text-2xs text-text-muted mt-1.5">{unit.tmName}</div>
                      </div>
                    </div>
                  </Link>
                ))}

                {/* Terms */}
                {filtered.terms.map((term) => (
                  <Link
                    key={`term-${term.id}`}
                    to="/tb"
                    className="block bg-surface-alt border border-border p-3 hover:border-accent transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-2xs font-medium bg-success/10 text-success">
                        Term
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-text">
                          <HighlightedText text={term.sourceTerm} query={initialQuery} />
                          <span className="mx-2 text-text-muted">&rarr;</span>
                          <HighlightedText text={term.targetTerm} query={initialQuery} />
                        </div>
                        {term.definition && (
                          <div className="text-xs text-text-muted mt-1">{term.definition}</div>
                        )}
                        <div className="text-2xs text-text-muted mt-1.5">{term.tbName}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* Initial State */}
      {initialQuery.length < 2 && (
        <div className="text-center py-12 text-text-muted text-sm">
          Enter at least 2 characters to search
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`py-2 px-1 border-b-2 text-xs font-medium transition-colors ${
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-text-muted hover:text-text hover:border-border'
      }`}
    >
      {children}
      <span
        className={`ml-1.5 py-0.5 px-1.5 text-2xs ${
          active ? 'bg-accent/10 text-accent' : 'bg-surface-panel text-text-muted'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-warning/30 px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
