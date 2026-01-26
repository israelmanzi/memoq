import { useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, keymap, placeholder as cmPlaceholder, ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';

// Term highlight decoration
const termMark = Decoration.mark({ class: 'cm-term-highlight' });

// State field to track term positions for highlighting
const termHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Decorations are updated via effects
    for (const e of tr.effects) {
      if (e.is(setTermHighlights)) {
        return e.value;
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Effect to update term highlights
const setTermHighlights = StateEffect.define<DecorationSet>();

// Custom theme for the translation editor - utilitarian design
const translationEditorTheme = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    backgroundColor: '#FAFAFA',
  },
  '.cm-content': {
    padding: '6px 8px',
    minHeight: '40px',
    caretColor: '#2F6FED',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-line': {
    padding: '1px 0',
  },
  '.cm-placeholder': {
    color: '#8A939F',
  },
  '.cm-term-highlight': {
    textDecoration: 'underline',
    textDecorationColor: '#C88719',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: '2px',
    backgroundColor: 'rgba(200, 135, 25, 0.1)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(47, 111, 237, 0.2) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(47, 111, 237, 0.3) !important',
  },
  '.cm-cursor': {
    borderLeftColor: '#2F6FED',
    borderLeftWidth: '1px',
  },
});

// Base extensions for the editor
const baseExtensions = [
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
  EditorView.lineWrapping,
  termHighlightField,
  translationEditorTheme,
];

export interface TermMatch {
  sourceTerm: string;
  targetTerm: string;
  position?: { start: number; end: number };
}

export interface TranslationEditorProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSelectionChange?: (selectedText: string) => void;
  onConfirm?: () => void;
  onSave?: () => void;
  placeholder?: string;
  sourceText?: string;
  terms?: TermMatch[];
  disabled?: boolean;
  className?: string;
  minHeight?: number;
}

export function TranslationEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  onSelectionChange,
  onConfirm,
  onSave,
  placeholder = 'Enter translation...',
  sourceText,
  terms = [],
  disabled = false,
  className = '',
  minHeight = 60,
}: TranslationEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onConfirmRef = useRef(onConfirm);
  const onSaveRef = useRef(onSave);

  // Keep refs updated
  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;
    onConfirmRef.current = onConfirm;
    onSaveRef.current = onSave;
  }, [onChange, onSelectionChange, onConfirm, onSave]);

  // Custom keymap for translation shortcuts
  const translationKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: 'Ctrl-Enter',
          mac: 'Cmd-Enter',
          run: () => {
            onConfirmRef.current?.();
            return true;
          },
        },
        {
          key: 'Ctrl-s',
          mac: 'Cmd-s',
          run: () => {
            onSaveRef.current?.();
            return true;
          },
          preventDefault: true,
        },
      ]),
    []
  );

  // Update listener extension
  const updateListener = useMemo(
    () =>
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          onChangeRef.current(newValue);
        }
        if (update.selectionSet) {
          const { from, to } = update.state.selection.main;
          if (from !== to) {
            const selectedText = update.state.doc.sliceString(from, to);
            onSelectionChangeRef.current?.(selectedText);
          }
        }
      }),
    []
  );

  // Focus/blur handlers
  const focusHandlers = useMemo(
    () =>
      EditorView.domEventHandlers({
        focus: () => {
          onFocus?.();
        },
        blur: () => {
          onBlur?.();
        },
      }),
    [onFocus, onBlur]
  );

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions,
        translationKeymap,
        updateListener,
        focusHandlers,
        cmPlaceholder(placeholder),
        EditorState.readOnly.of(disabled),
        EditorView.editable.of(!disabled),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [disabled, placeholder]); // Only recreate on these changes

  // Update value from outside
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // Update term highlights
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const text = view.state.doc.toString().toLowerCase();
    const builder = new RangeSetBuilder<Decoration>();
    const positions: Array<{ from: number; to: number }> = [];

    // Find all term positions
    for (const term of terms) {
      const searchTerm = term.sourceTerm.toLowerCase();
      let pos = 0;
      while ((pos = text.indexOf(searchTerm, pos)) !== -1) {
        positions.push({ from: pos, to: pos + searchTerm.length });
        pos += 1;
      }
    }

    // Sort positions and add decorations
    positions.sort((a, b) => a.from - b.from);
    for (const { from, to } of positions) {
      builder.add(from, to, termMark);
    }

    view.dispatch({
      effects: setTermHighlights.of(builder.finish()),
    });
  }, [terms, value]);

  // Public method to insert text at cursor or replace selection
  const insertText = useCallback((text: string, replace = false) => {
    const view = viewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;

    if (replace) {
      // Replace entire content
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: text,
        },
        selection: { anchor: text.length },
      });
    } else {
      // Insert at cursor or replace selection
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
    }

    view.focus();
  }, []);

  // Expose insert method via ref-like pattern
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as any).insertText = insertText;
      (containerRef.current as any).focus = () => viewRef.current?.focus();
    }
  }, [insertText]);

  // Calculate min height based on source text
  const calculatedMinHeight = sourceText
    ? Math.max(minHeight, Math.ceil(sourceText.length / 60) * 18)
    : minHeight;

  return (
    <div
      ref={containerRef}
      className={`translation-editor border overflow-hidden focus-within:ring-1 focus-within:ring-accent ${
        disabled ? 'bg-surface-panel opacity-60' : 'bg-surface-alt'
      } ${className}`}
      style={{ minHeight: calculatedMinHeight }}
    />
  );
}

// Helper type for accessing editor methods from parent
export interface TranslationEditorRef {
  insertText: (text: string, replace?: boolean) => void;
  focus: () => void;
}

// Helper to get editor ref methods from container element
export function getEditorRef(container: HTMLDivElement | null): TranslationEditorRef | null {
  if (!container) return null;
  const el = container as any;
  if (el.insertText && el.focus) {
    return { insertText: el.insertText, focus: el.focus };
  }
  return null;
}
