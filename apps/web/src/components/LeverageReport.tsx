/**
 * Leverage Report Component
 * Shows TM match distribution and estimated effort for a document
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';

interface LeverageReportProps {
  documentId: string;
  projectId: string;
  documentName?: string;
}

export function LeverageReport({ documentId, projectId, documentName }: LeverageReportProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: analysis, isLoading, error, refetch } = useQuery({
    queryKey: ['leverage-analysis', documentId, projectId],
    queryFn: () => analyticsApi.analyzeLeverage(documentId, projectId),
    enabled: false,
  });

  const handleAnalyze = () => {
    setIsOpen(true);
    refetch();
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleAnalyze}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text hover:bg-surface-hover"
        title="Analyze TM leverage"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span className="hidden sm:inline">Leverage</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-alt border border-border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-surface-panel border-b border-border">
          <div>
            <h2 className="text-sm font-medium text-text">TM Leverage Analysis</h2>
            <p className="text-2xs text-text-muted">
              {documentName || analysis?.documentName || 'Document'}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-text-muted hover:text-text hover:bg-surface-hover"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-3">
          {isLoading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin h-6 w-6 border-b-2 border-accent"></div>
              <p className="mt-2 text-xs text-text-muted">Analyzing TM matches...</p>
            </div>
          )}

          {error && (
            <div className="p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
              Analysis failed: {(error as Error).message}
            </div>
          )}

          {analysis && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-surface-panel p-2 border border-border">
                  <div className="text-2xs text-text-muted">Total Segments</div>
                  <div className="text-lg font-medium text-text">{analysis.totalSegments.toLocaleString()}</div>
                </div>
                <div className="bg-surface-panel p-2 border border-border">
                  <div className="text-2xs text-text-muted">Total Words</div>
                  <div className="text-lg font-medium text-text">{analysis.totalWords.toLocaleString()}</div>
                </div>
              </div>

              {/* Match Distribution */}
              <div>
                <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  Match Distribution
                </div>
                <div className="space-y-1">
                  <MatchRow
                    label="100% (Exact)"
                    color="bg-success"
                    data={analysis.matchDistribution.exact}
                    effortPercent={0}
                  />
                  <MatchRow
                    label="95-99% (High)"
                    color="bg-accent"
                    data={analysis.matchDistribution.fuzzyHigh}
                    effortPercent={25}
                  />
                  <MatchRow
                    label="85-94% (Mid)"
                    color="bg-warning"
                    data={analysis.matchDistribution.fuzzyMid}
                    effortPercent={50}
                  />
                  <MatchRow
                    label="75-84% (Low)"
                    color="bg-warning"
                    data={analysis.matchDistribution.fuzzyLow}
                    effortPercent={75}
                  />
                  <MatchRow
                    label="<75% (No match)"
                    color="bg-danger"
                    data={analysis.matchDistribution.noMatch}
                    effortPercent={100}
                  />
                  <MatchRow
                    label="Repetitions"
                    color="bg-accent-muted"
                    data={analysis.matchDistribution.repetitions}
                    effortPercent={10}
                  />
                </div>
              </div>

              {/* Estimated Effort */}
              <div className="bg-surface-panel p-3 border border-border">
                <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  Estimated Effort
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-accent">
                    {analysis.estimatedEffort.totalWeightedWords.toLocaleString()}
                  </span>
                  <span className="text-xs text-text-muted">weighted words</span>
                </div>
                <div className="mt-2 pt-2 border-t border-border-light">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">TM Leverage</span>
                    <span className="font-medium text-success">
                      {(((analysis.totalWords - analysis.estimatedEffort.totalWeightedWords) / analysis.totalWords) * 100).toFixed(1)}% savings
                    </span>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="text-2xs text-text-muted bg-surface-panel p-2 border border-border">
                <span className="font-medium text-text-secondary">Effort weights: </span>
                100%=0%, 95-99%=25%, 85-94%=50%, 75-84%=75%, &lt;75%=100%, Reps=10%
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-border bg-surface-panel">
          <button
            onClick={() => setIsOpen(false)}
            className="px-3 py-1.5 text-xs text-text-secondary hover:text-text hover:bg-surface-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface MatchRowProps {
  label: string;
  color: string;
  data: { count: number; words: number; percentage: number };
  effortPercent: number;
}

function MatchRow({ label, color, data, effortPercent }: MatchRowProps) {
  if (data.count === 0) return null;

  return (
    <div className="flex items-center gap-2 py-1 border-b border-border-light last:border-0">
      <div className={`w-2 h-2 ${color}`}></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text">{label}</span>
          <span className="text-text-muted">{data.percentage}%</span>
        </div>
        <div className="flex items-center gap-3 text-2xs text-text-muted">
          <span>{data.count} seg</span>
          <span>{data.words.toLocaleString()} words</span>
          <span className="text-text-secondary">{effortPercent}% effort</span>
        </div>
      </div>
      {/* Mini bar */}
      {data.percentage > 0 && (
        <div className="w-16 h-1 bg-surface overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${data.percentage}%` }}></div>
        </div>
      )}
    </div>
  );
}
