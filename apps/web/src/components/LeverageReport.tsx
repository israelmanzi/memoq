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
    enabled: false, // Only run when triggered
  });

  const handleAnalyze = () => {
    setIsOpen(true);
    refetch();
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleAnalyze}
        className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary-hover transition-colors"
      >
        Analyze Leverage
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 bg-surface">
          <div>
            <h2 className="text-lg font-semibold text-text">Translation Memory Leverage Analysis</h2>
            <p className="text-sm text-text-secondary mt-1">
              {documentName || analysis?.documentName || 'Document'}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-text-secondary hover:text-text p-2 rounded hover:bg-surface-hover"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-text-secondary">Analyzing TM matches...</p>
            </div>
          )}

          {error && (
            <div className="bg-danger-bg border border-danger text-danger rounded p-4">
              <p className="font-medium">Analysis Failed</p>
              <p className="text-sm mt-1">{(error as Error).message}</p>
            </div>
          )}

          {analysis && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-panel rounded-lg p-4">
                  <p className="text-text-secondary text-sm">Total Segments</p>
                  <p className="text-2xl font-bold text-text mt-1">{analysis.totalSegments.toLocaleString()}</p>
                </div>
                <div className="bg-surface-panel rounded-lg p-4">
                  <p className="text-text-secondary text-sm">Total Words</p>
                  <p className="text-2xl font-bold text-text mt-1">{analysis.totalWords.toLocaleString()}</p>
                </div>
              </div>

              {/* Match Distribution */}
              <div>
                <h3 className="font-semibold text-text mb-3">TM Match Distribution</h3>
                <div className="space-y-2">
                  <MatchRow
                    label="100% Matches (Exact)"
                    color="bg-green-500"
                    data={analysis.matchDistribution.exact}
                    effortWords={analysis.estimatedEffort.exact}
                    effortPercent={0}
                  />
                  <MatchRow
                    label="95-99% Matches (High Fuzzy)"
                    color="bg-blue-500"
                    data={analysis.matchDistribution.fuzzyHigh}
                    effortWords={analysis.estimatedEffort.fuzzyHigh}
                    effortPercent={25}
                  />
                  <MatchRow
                    label="85-94% Matches (Mid Fuzzy)"
                    color="bg-yellow-500"
                    data={analysis.matchDistribution.fuzzyMid}
                    effortWords={analysis.estimatedEffort.fuzzyMid}
                    effortPercent={50}
                  />
                  <MatchRow
                    label="75-84% Matches (Low Fuzzy)"
                    color="bg-orange-500"
                    data={analysis.matchDistribution.fuzzyLow}
                    effortWords={analysis.estimatedEffort.fuzzyLow}
                    effortPercent={75}
                  />
                  <MatchRow
                    label="<75% Matches (No Match)"
                    color="bg-red-500"
                    data={analysis.matchDistribution.noMatch}
                    effortWords={analysis.estimatedEffort.noMatch}
                    effortPercent={100}
                  />
                  <MatchRow
                    label="Repetitions (Internal Duplicates)"
                    color="bg-purple-500"
                    data={analysis.matchDistribution.repetitions}
                    effortWords={analysis.estimatedEffort.repetitions}
                    effortPercent={10}
                  />
                </div>
              </div>

              {/* Estimated Effort */}
              <div className="bg-surface-panel rounded-lg p-4">
                <h3 className="font-semibold text-text mb-2">Estimated Translation Effort</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-primary">
                    {analysis.estimatedEffort.totalWeightedWords.toLocaleString()}
                  </span>
                  <span className="text-text-secondary">weighted words</span>
                </div>
                <p className="text-sm text-text-secondary mt-2">
                  Industry standard weights: 100%=0%, 95-99%=25%, 85-94%=50%, 75-84%=75%, &lt;75%=100%, Reps=10%
                </p>
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-sm text-text-secondary">
                    <strong>TM Leverage:</strong>{' '}
                    {(
                      ((analysis.totalWords - analysis.estimatedEffort.totalWeightedWords) /
                        analysis.totalWords) *
                      100
                    ).toFixed(1)}
                    % savings from translation memory
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="text-xs text-text-secondary bg-surface-panel rounded p-3">
                <p className="font-medium text-text mb-1">How to interpret:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>100% matches:</strong> Exact matches from TM - can be auto-filled</li>
                  <li><strong>95-99% matches:</strong> Minor differences - quick edits needed</li>
                  <li><strong>85-94% matches:</strong> Moderate differences - partial translation</li>
                  <li><strong>75-84% matches:</strong> Significant differences - mostly manual work</li>
                  <li><strong>&lt;75% matches:</strong> New content - full translation required</li>
                  <li><strong>Repetitions:</strong> Duplicate segments within document - translate once, reuse</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3">
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text rounded hover:bg-surface-hover transition-colors"
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
  effortWords: number;
  effortPercent: number;
}

function MatchRow({ label, color, data, effortWords, effortPercent }: MatchRowProps) {
  return (
    <div className="bg-surface-panel rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded ${color}`}></div>
          <span className="text-sm font-medium text-text">{label}</span>
        </div>
        <span className="text-xs text-text-secondary">
          {data.percentage}% of segments
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-text-secondary text-xs">Segments</p>
          <p className="font-medium text-text">{data.count.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-text-secondary text-xs">Words</p>
          <p className="font-medium text-text">{data.words.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-text-secondary text-xs">Effort ({effortPercent}%)</p>
          <p className="font-medium text-text">{effortWords.toLocaleString()}</p>
        </div>
      </div>

      {/* Visual bar */}
      {data.percentage > 0 && (
        <div className="mt-2 h-2 bg-surface rounded-full overflow-hidden">
          <div
            className={`h-full ${color} transition-all duration-500`}
            style={{ width: `${data.percentage}%` }}
          ></div>
        </div>
      )}
    </div>
  );
}
