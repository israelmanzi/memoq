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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Search</h1>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search segments, TM entries, and terms..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={inputValue.trim().length < 2}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Search
        </button>
      </form>

      {/* Results */}
      {initialQuery.length >= 2 && (
        <>
          {/* Tabs */}
          <div className="border-b border-gray-200">
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
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Searching...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">
                Error: {(error as Error).message}
              </div>
            ) : getTotalCount(data) === 0 ? (
              <div className="text-center py-8 text-gray-500">
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
                    className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        Segment
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">
                          <span className="font-medium">Source:</span>{' '}
                          <HighlightedText text={segment.sourceText} query={initialQuery} />
                        </div>
                        {segment.targetText && (
                          <div className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">Target:</span>{' '}
                            <HighlightedText text={segment.targetText} query={initialQuery} />
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-2">
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
                    className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        TM Entry
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">
                          <span className="font-medium">Source:</span>{' '}
                          <HighlightedText text={unit.sourceText} query={initialQuery} />
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">Target:</span>{' '}
                          <HighlightedText text={unit.targetText} query={initialQuery} />
                        </div>
                        <div className="text-xs text-gray-400 mt-2">{unit.tmName}</div>
                      </div>
                    </div>
                  </Link>
                ))}

                {/* Terms */}
                {filtered.terms.map((term) => (
                  <Link
                    key={`term-${term.id}`}
                    to="/tb"
                    className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Term
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">
                          <HighlightedText text={term.sourceTerm} query={initialQuery} />
                          <span className="mx-2 text-gray-400">&rarr;</span>
                          <HighlightedText text={term.targetTerm} query={initialQuery} />
                        </div>
                        {term.definition && (
                          <div className="text-sm text-gray-500 mt-1">{term.definition}</div>
                        )}
                        <div className="text-xs text-gray-400 mt-2">{term.tbName}</div>
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
        <div className="text-center py-12 text-gray-500">
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
      className={`py-3 px-1 border-b-2 text-sm font-medium ${
        active
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {children}
      <span
        className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
          active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
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
          <mark key={i} className="bg-yellow-200 px-0.5 rounded">
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
