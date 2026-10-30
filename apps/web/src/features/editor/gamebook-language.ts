import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
  type StringStream,
} from '@codemirror/language';
import { linter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { parseDocument, type ParseOptions } from '@gamebook/core';
import { tags as t } from '@lezer/highlight';

interface State {
  /** Brace depth inside a node config that spans several lines. */
  configDepth: number;
}

const objectToken = (stream: StringStream, state: State): string | null => {
  if (stream.eatSpace()) return null;
  if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string';
  if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
  if (stream.match(/^(true|false)\b/)) return 'bool';
  if (stream.match(/^[\p{L}_$][\p{L}\p{N}_$]*(?=\s*:)/u)) return 'propertyName';
  const ch = stream.next();
  if (ch === '{') state.configDepth++;
  if (ch === '}') state.configDepth--;
  return ch === '{' || ch === '}' ? 'brace' : 'punctuation';
};

/**
 * Highlighting only. Structure and errors come from the real parser via the linter, so the two
 * can never disagree about what is valid.
 */
const gamebookStream = StreamLanguage.define<State>({
  name: 'gamebook',
  startState: () => ({ configDepth: 0 }),
  token(stream, state) {
    if (state.configDepth > 0) return objectToken(stream, state);
    if (stream.sol()) {
      if (stream.match(/^---[ \t]*\S+?[ \t]*---/)) return 'heading';
      if (stream.match(/^[ \t]*-[ \t]+(?=.*\[[^\]]*\])/)) return 'list';
    }
    if (stream.match(/^\[[A-Za-z0-9_]*\]/)) return 'link';
    if (stream.match(/^<\/?(if|else)\b[^>]*>/)) return 'keyword';
    if (stream.peek() === '{') return objectToken(stream, state);
    if (stream.match(/^\*\*[^*]+\*\*/)) return 'strong';
    if (stream.match(/^\*[^*]+\*/)) return 'emphasis';
    if (stream.match(/^`[^`]+`/)) return 'monospace';
    stream.next();
    return null;
  },
  tokenTable: {
    heading: t.heading,
    list: t.list,
    link: t.link,
    keyword: t.keyword,
    propertyName: t.propertyName,
    string: t.string,
    number: t.number,
    bool: t.bool,
    brace: t.brace,
    punctuation: t.punctuation,
    strong: t.strong,
    emphasis: t.emphasis,
    monospace: t.monospace,
  },
});

// Colors are CSS variables (`--syntax-*` in index.css), so they follow light and dark mode.
const highlight = HighlightStyle.define([
  {
    tag: t.heading,
    fontWeight: '700',
    color: 'var(--syntax-heading)',
    backgroundColor: 'var(--muted)',
  },
  { tag: t.list, fontWeight: '700', color: 'var(--syntax-choice)' },
  { tag: t.link, color: 'var(--syntax-target)', fontWeight: '600' },
  { tag: t.keyword, color: 'var(--syntax-keyword)' },
  { tag: t.propertyName, color: 'var(--syntax-property)' },
  { tag: [t.brace, t.punctuation], color: 'var(--muted-foreground)' },
  { tag: t.string, color: 'var(--syntax-string)' },
  { tag: [t.number, t.bool], color: 'var(--syntax-number)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.monospace, fontFamily: 'var(--font-mono, monospace)' },
]);

export const gamebookLanguage = (options: ParseOptions): Extension => [
  gamebookStream,
  syntaxHighlighting(highlight),
  linter(
    (view): CmDiagnostic[] => {
      const length = view.state.doc.length;
      return parseDocument(view.state.doc.toString(), options).diagnostics.map((d) => ({
        from: Math.min(d.from, length),
        to: Math.min(Math.max(d.to, d.from), length),
        severity: d.severity,
        message: d.message,
      }));
    },
    { delay: 250 },
  ),
];
