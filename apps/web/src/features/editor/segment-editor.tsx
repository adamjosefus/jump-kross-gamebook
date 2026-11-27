import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import {
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  WidgetType,
  type Command,
} from '@codemirror/view';
import { THEMES, type Theme } from '@gamebook/core';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

import type { DraftSegment } from './draft';
import {
  dividerLine,
  dividerTheme,
  docToSegments,
  isDivider,
  isNoteLine,
  segmentsToDoc,
} from './segment-doc';

/** Marks the editor focused or not; the divider under the cursor shows its text only while it is. */
const setFocused = StateEffect.define<boolean>();

const focused = StateField.define<boolean>({
  create: () => false,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setFocused)) {
        return effect.value;
      }
    }

    return value;
  },
});

/** The line where a divider sits, found from its widget's element at the time of the event. */
const lineOfWidget = (view: EditorView, dom: HTMLElement) =>
  view.state.doc.lineAt(view.posAtDOM(dom));

/** The line between two segments: a chip with the theme of the segment under it, then a rule. */
class DividerWidget extends WidgetType {
  readonly theme: Theme | undefined;

  constructor(theme: Theme | undefined) {
    super();
    this.theme = theme;
  }

  override eq(other: DividerWidget): boolean {
    return other.theme === this.theme;
  }

  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'cm-divider';
    const select = document.createElement('select');
    select.className = 'cm-divider-theme';
    select.title = 'Téma segmentu';
    for (const theme of THEMES) {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = theme;
      select.append(option);
    }

    select.value = this.theme ?? 'default';
    select.addEventListener('change', () => {
      const line = lineOfWidget(view, dom);
      const theme = THEMES.find((name) => {
        return name === select.value;
      });
      view.dispatch({ changes: { from: line.from, to: line.to, insert: dividerLine(theme) } });
    });
    const rule = document.createElement('span');
    rule.className = 'cm-divider-rule';
    dom.append(select, rule);
    return dom;
  }

  /** The chip takes its own clicks; the editor does not move the cursor for them. */
  override ignoreEvent(): boolean {
    return true;
  }
}

const NOTE_LINE = Decoration.line({ class: 'cm-note' });

/**
 * Dividers drawn as widgets, except the one under the cursor, which shows its text to edit; note
 * lines dimmed. Block widgets have to come from a state field.
 */
const decorate = (state: EditorState): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  const editing = new Set(
    state.field(focused)
      ? state.selection.ranges.map((range) => {
          return state.doc.lineAt(range.head).number;
        })
      : [],
  );
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (isDivider(line.text)) {
      if (!editing.has(number)) {
        builder.add(
          line.from,
          line.to,
          Decoration.replace({ widget: new DividerWidget(dividerTheme(line.text)), block: true }),
        );
      }

      continue;
    }

    if (isNoteLine(line.text)) {
      builder.add(line.from, line.from, NOTE_LINE);
    }
  }

  return builder.finish();
};

const segmentLines = StateField.define<DecorationSet>({
  create: decorate,
  update: (value, transaction) => {
    const refocused = transaction.effects.some((effect) => {
      return effect.is(setFocused);
    });
    if (transaction.docChanged || transaction.selection !== undefined || refocused) {
      return decorate(transaction.state);
    }

    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** The first segment keeps its divider, so its theme can be set like any other's. */
const keepFirstDivider = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged || isDivider(transaction.newDoc.line(1).text)) {
    return transaction;
  }

  return [transaction, { changes: { from: 0, insert: '===\n' }, sequential: true }];
});

/**
 * Backspace at the start of a segment, or on a divider's line, removes the divider: the segment
 * joins the one above. The first segment has no segment above to join.
 */
const joinWithPrevious: Command = (view) => {
  const { state } = view;
  const selection = state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = state.doc.lineAt(selection.head);
  if (selection.head !== line.from || line.number === 1) {
    return false;
  }

  if (isDivider(line.text)) {
    view.dispatch({ changes: { from: line.from - 1, to: line.to } });
    return true;
  }

  const previous = state.doc.line(line.number - 1);
  if (!isDivider(previous.text)) {
    return false;
  }

  if (previous.number > 1) {
    view.dispatch({ changes: { from: previous.from, to: line.from } });
  }

  return true;
};

/** Delete at the end of a segment removes the next divider: the segment under joins this one. */
const joinWithNext: Command = (view) => {
  const { state } = view;
  const selection = state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = state.doc.lineAt(selection.head);
  if (selection.head !== line.to || line.number === state.doc.lines) {
    return false;
  }

  const next = state.doc.line(line.number + 1);
  if (!isDivider(next.text)) {
    return false;
  }

  view.dispatch({ changes: { from: line.to, to: next.to } });
  return true;
};

/** Enter on a divider's line opens a line under it instead of cutting the divider in two. */
const leaveDivider: Command = (view) => {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  if (!isDivider(line.text)) {
    return false;
  }

  view.dispatch({
    changes: { from: line.to, insert: '\n' },
    selection: { anchor: line.to + 1 },
    scrollIntoView: true,
  });
  return true;
};

/** The divider of the segment the line `number` is in. */
const dividerAbove = (doc: Text, number: number) => {
  for (let current = number; current >= 1; current -= 1) {
    const line = doc.line(current);
    if (isDivider(line.text)) {
      return line;
    }
  }

  return undefined;
};

/** A slash command: `/` and its name at the start of a line. */
const SLASH = /^\/[\p{L}\p{N} ]*$/u;

/** Replaces the typed command, from the start of its line to the cursor. */
const command = (
  label: string,
  detail: string,
  run: (view: EditorView, from: number, to: number) => void,
): Completion => ({
  label,
  detail,
  apply: (view, _completion, from, to) => {
    run(view, from - 1, to);
  },
});

const SLASH_COMMANDS: readonly Completion[] = [
  command('segment', 'Nový segment', (view, from, to) => {
    view.dispatch({ changes: { from, to, insert: '===\n' }, selection: { anchor: from + 4 } });
  }),
  command('poznámka', 'Poznámka k segmentu', (view, from, to) => {
    view.dispatch({ changes: { from, to, insert: '// ' }, selection: { anchor: from + 3 } });
  }),
  ...THEMES.map((theme) => {
    return command(`téma ${theme}`, 'Téma segmentu', (view, from, to) => {
      const divider = dividerAbove(view.state.doc, view.state.doc.lineAt(from).number);
      view.dispatch({
        changes: [
          ...(divider === undefined
            ? []
            : [{ from: divider.from, to: divider.to, insert: dividerLine(theme) }]),
          { from, to },
        ],
      });
    });
  }),
];

/** Offers the slash commands while a line holds only `/` and what follows it. */
const slashCommands = (context: CompletionContext): CompletionResult | null => {
  const line = context.state.doc.lineAt(context.pos);
  const typed = context.state.sliceDoc(line.from, context.pos);
  if (!SLASH.test(typed)) {
    return null;
  }

  return { from: line.from + 1, options: [...SLASH_COMMANDS], validFor: /^[\p{L}\p{N} ]*$/u };
};

/** Markdown with its marks left in place and dimmed: `**bold**` is bold with grey asterisks. */
const MARKDOWN_LOOK = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: tags.quote, fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--muted-foreground)', fontWeight: '400' },
]);

const LOOK = EditorView.theme({
  // The size comes from the element around, `fontSize` of the component.
  '&': { fontSize: 'inherit', color: 'var(--foreground)', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    lineHeight: '1.6',
  },
  '.cm-content': { padding: '0', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: '0' },
  '.cm-note': { color: 'var(--muted-foreground)', fontStyle: 'italic' },
  '.cm-divider': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 0 6px',
  },
  '.cm-divider-rule': { flex: '1', height: '1px', backgroundColor: 'var(--border)' },
  '.cm-divider-theme': {
    appearance: 'none',
    cursor: 'pointer',
    border: '1px solid var(--border)',
    borderRadius: '9999px',
    padding: '0 10px',
    fontFamily: 'var(--font-sans)',
    fontSize: '11px',
    lineHeight: '20px',
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--background)',
  },
  '.cm-divider-theme:hover': { color: 'var(--foreground)' },
  '.cm-tooltip': {
    border: '1px solid var(--border)',
    borderRadius: '8px',
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-sans)', fontSize: '13px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '.cm-completionDetail': { marginLeft: '12px', fontStyle: 'normal', opacity: '0.6' },
});

const extensions = (onDoc: (doc: string) => void): Extension => [
  focused,
  segmentLines,
  keepFirstDivider,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing)),
  history(),
  Prec.high(
    keymap.of([
      { key: 'Backspace', run: joinWithPrevious },
      { key: 'Delete', run: joinWithNext },
      { key: 'Enter', run: leaveDivider },
    ]),
  ),
  keymap.of([...defaultKeymap, ...historyKeymap]),
  // A `===` line under text would read as a heading underline; here it divides segments.
  markdown({ extensions: [{ remove: ['SetextHeading'] }] }),
  syntaxHighlighting(MARKDOWN_LOOK),
  autocompletion({ override: [slashCommands], icons: false }),
  EditorView.lineWrapping,
  LOOK,
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      onDoc(update.state.doc.toString());
    }
  }),
];

export interface SegmentEditorProps {
  readonly value: readonly DraftSegment[];
  readonly onChange?: (segments: readonly DraftSegment[]) => void;
  readonly autoFocus?: boolean;
  /** Of the text, in pixels. */
  readonly fontSize?: number;
  /** Replaces the default minimum height. */
  readonly className?: string;
}

/**
 * The segments of a node written as one text in a monospace font, like blocks in Notion: a `===`
 * line divides two segments and turns into a divider with the theme, `/` at the start of a line
 * offers commands, a line starting with `//` is a note.
 */
export const SegmentEditor = ({
  value,
  onChange,
  autoFocus,
  fontSize = 14,
  className,
}: SegmentEditorProps) => {
  const host = useRef<HTMLDivElement>(null);
  /** The segments the editor starts with; later values come in through the second effect. */
  const initial = useRef(value);
  const view = useRef<EditorView | null>(null);
  /** The text the editor holds, so an echo of its own change does not reset it. */
  const doc = useRef('');
  const change = useRef(onChange);

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    doc.current = segmentsToDoc(initial.current);
    const created = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: doc.current,
        // The cursor starts in the text, under the first divider.
        selection: { anchor: doc.current.indexOf('\n') + 1 },
        extensions: extensions((next) => {
          doc.current = next;
          change.current?.(docToSegments(next));
        }),
      }),
    });
    view.current = created;
    if (autoFocus === true) {
      created.focus();
    }

    return () => {
      created.destroy();
      view.current = null;
    };
  }, [autoFocus]);

  useEffect(() => {
    const next = segmentsToDoc(value);
    const current = view.current;
    if (current === null || segmentsToDoc(docToSegments(doc.current)) === next) {
      return;
    }

    doc.current = next;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: next } });
  }, [value]);

  return <div ref={host} className={className ?? 'min-h-24'} style={{ fontSize }} />;
};
