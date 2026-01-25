import type { TermMatch } from '@oxy/shared';

interface HighlightedTextProps {
  text: string;
  termMatches: TermMatch[];
  onTermClick?: (term: TermMatch) => void;
}

export function HighlightedText({ text, termMatches, onTermClick }: HighlightedTextProps) {
  if (!termMatches || termMatches.length === 0) {
    return <span>{text}</span>;
  }

  // Sort matches by position and merge overlapping ones
  const sortedMatches = [...termMatches].sort((a, b) => a.position.start - b.position.start);
  const mergedMatches: TermMatch[] = [];

  for (const match of sortedMatches) {
    const last = mergedMatches[mergedMatches.length - 1];
    if (last && match.position.start < last.position.end) {
      // Overlapping - keep the longer one or the first one
      if (match.position.end > last.position.end) {
        mergedMatches[mergedMatches.length - 1] = match;
      }
    } else {
      mergedMatches.push(match);
    }
  }

  // Build segments with highlighted terms
  const segments: Array<{ text: string; match?: TermMatch }> = [];
  let lastEnd = 0;

  for (const match of mergedMatches) {
    // Add text before this match
    if (match.position.start > lastEnd) {
      segments.push({ text: text.slice(lastEnd, match.position.start) });
    }

    // Add the matched term
    segments.push({
      text: text.slice(match.position.start, match.position.end),
      match,
    });

    lastEnd = match.position.end;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    segments.push({ text: text.slice(lastEnd) });
  }

  return (
    <span>
      {segments.map((segment, index) =>
        segment.match ? (
          <span
            key={index}
            className="underline decoration-orange-400 decoration-2 underline-offset-2 cursor-pointer hover:bg-orange-100 transition-colors"
            title={`${segment.match.sourceTerm} → ${segment.match.targetTerm}`}
            onClick={(e) => {
              e.stopPropagation();
              // Only insert if user isn't selecting text
              const selection = window.getSelection();
              if (selection && selection.toString().trim()) {
                return; // User is selecting text, don't insert
              }
              onTermClick?.(segment.match!);
            }}
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  );
}
