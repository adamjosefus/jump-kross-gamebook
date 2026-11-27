import {
  autocompletion,
  closeCompletion,
  completionStatus,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, invertedEffects } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import {
  EditorState,
  Facet,
  MapMode,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
  type Range,
  Text,
  Transaction,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  WidgetType,
  type Command,
  type ViewUpdate,
} from '@codemirror/view';
import { THEMES, type Theme } from '@gamebook/core';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import type { DraftSegment } from './draft';
import { toggleMark, type InlineMark } from './markdown-marks';
import { dividerLine, dividerTheme, docToSegments, isDivider, segmentsToDoc } from './segment-doc';

/**
 * Whether the segments' themes are shown and set here. Without them a divider is a plain rule, the
 * first one is not drawn at all, and `/` offers no themes; the themes stay as they were.
 */
const withThemes = Facet.define<boolean, boolean>({
  combine: (values) => values.at(0) ?? true,
});

/**
 * Whether the first divider is left out: the first segment's theme is set outside the editor, on
 * a line of the page around it, and the text begins right at the top.
 */
const firstDividerOutside = Facet.define<boolean, boolean>({
  combine: (values) => values.at(0) ?? false,
});

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

/** A segment's note, kept by the start of its divider's line; the note is no part of the text. */
interface SegmentNote {
  readonly at: number;
  readonly text: string;
}

/** All the notes anew, as the segments given from outside have them. */
const setNotes = StateEffect.define<readonly SegmentNote[]>();

/** The note of the segment whose divider starts `at`, written in its popover; empty removes it. */
const writeNote = StateEffect.define<SegmentNote>();

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

/** Notes at the same divider joined into one, as when two segments join. */
const joined = (notes: readonly SegmentNote[]): readonly SegmentNote[] => {
  const byDivider = new Map<number, string>();
  for (const note of notes) {
    const before = byDivider.get(note.at);
    byDivider.set(note.at, before === undefined ? note.text : `${before}\n${note.text}`);
  }

  return [...byDivider].map(([at, text]) => ({ at, text }));
};

/**
 * The segments' notes, which move with their dividers as the text around changes. A divider's line
 * changed into no divider keeps its note, to take it back when it divides again, as when a `=` is
 * typed over; only a divider's line taken away hands its note to the segment above, as its text
 * goes there too.
 */
const segmentNotes = StateField.define<readonly SegmentNote[]>({
  create: () => [],
  update: (notes, transaction) => {
    let next = notes;
    if (transaction.docChanged) {
      const doc = transaction.newDoc;
      next = joined(
        notes.flatMap((note) => {
          // Gone with the divider's first character: the divider is taken away, not typed over.
          const kept = transaction.changes.mapPos(note.at, 1, MapMode.TrackAfter);
          if (kept !== null) {
            return [{ at: doc.lineAt(kept).from, text: note.text }];
          }

          const at = transaction.changes.mapPos(note.at, -1);
          const divider = dividerAbove(doc, doc.lineAt(at).number);
          return divider === undefined ? [] : [{ at: divider.from, text: note.text }];
        }),
      );
    }

    for (const effect of transaction.effects) {
      if (effect.is(setNotes)) {
        next = effect.value;
      }

      if (effect.is(writeNote)) {
        const others = next.filter((note) => {
          return note.at !== effect.value.at;
        });
        next = effect.value.text.trim() === '' ? others : [...others, effect.value];
      }
    }

    return next;
  },
});

/**
 * Undo and redo take the notes back as they were, as they do the text: the notes are no part of
 * the text, so the history keeps them as an effect.
 */
const notesInHistory = invertedEffects.of((transaction) => {
  const before = transaction.startState.field(segmentNotes);
  return before === transaction.state.field(segmentNotes) ? [] : [setNotes.of(before)];
});

/** The note of the segment whose divider starts `at`. */
const noteAt = (state: EditorState, at: number) =>
  state.field(segmentNotes).find((note) => {
    return note.at === at;
  })?.text;

/** The starts of the dividers' lines, in the order of the segments. */
const dividerStarts = (doc: Text): readonly number[] => {
  const starts: number[] = [];
  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number);
    if (isDivider(line.text)) {
      starts.push(line.from);
    }
  }

  return starts;
};

/** The notes of these segments, by the dividers of their text. */
const notesOfSegments = (doc: Text, segments: readonly DraftSegment[]): readonly SegmentNote[] =>
  dividerStarts(doc).flatMap((at, index) => {
    const text = segments[index]?.note;
    return text === undefined ? [] : [{ at, text }];
  });

/** The segments the editor holds: its text, and the notes by their dividers. */
const segmentsOf = (state: EditorState): readonly DraftSegment[] =>
  docToSegments(
    state.doc.toString(),
    dividerStarts(state.doc).map((at) => {
      return noteAt(state, at);
    }),
  );

/** The note icon, Tabler's „note“, drawn into the divider's button. */
const NOTE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 20l7 -7"/><path d="M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7"/></svg>';

/**
 * The line between two segments: a rule, then on the right a button with the note of the segment
 * under it, in a popover, and a picker of its theme. The default theme's picker and a segment's
 * missing note show only while the pointer is over the line, or they have the keyboard's focus:
 * a plain segment needs no word about them.
 */
class DividerWidget extends WidgetType {
  readonly theme: Theme | undefined;
  readonly note: string | undefined;

  constructor(theme: Theme | undefined, note: string | undefined) {
    super();
    this.theme = theme;
    this.note = note;
  }

  override eq(other: DividerWidget): boolean {
    return other.theme === this.theme && other.note === this.note;
  }

  /** A note written keeps the same element, so its popover stays open while it is written in. */
  override updateDOM(dom: HTMLElement): boolean {
    if (!dom.classList.contains('cm-divider-themed')) {
      return false;
    }

    dom.classList.toggle(
      'cm-divider-default',
      this.theme === undefined || this.theme === 'default',
    );
    dom.classList.toggle('cm-divider-noted', this.note !== undefined);
    const select = dom.querySelector('select');
    if (select !== null) {
      select.value = this.theme ?? 'default';
    }

    const button = dom.querySelector<HTMLButtonElement>('.cm-divider-note');
    if (button !== null) {
      button.title = this.note ?? 'Přidat poznámku k segmentu';
    }

    return true;
  }

  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'cm-divider';
    if (!view.state.facet(withThemes)) {
      const rule = document.createElement('span');
      rule.className = 'cm-divider-rule';
      dom.append(rule);
      return dom;
    }

    dom.classList.add('cm-divider-themed');
    // The default theme's picker hidden till wanted, a dot in its place.
    if (this.theme === undefined || this.theme === 'default') {
      dom.classList.add('cm-divider-default');
    }

    if (this.note !== undefined) {
      dom.classList.add('cm-divider-noted');
    }

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
    // The picker in a frame of its own, which draws the chevron after the theme's name.
    const picker = document.createElement('span');
    picker.className = 'cm-divider-picker';
    picker.append(select);
    const tools = document.createElement('span');
    tools.className = 'cm-divider-tools';
    tools.append(this.noteButton(view, dom), picker);
    dom.append(rule, tools);
    return dom;
  }

  /**
   * The button of the segment's note and its popover, a field written straight into the note; the
   * popover opens under the button, and Esc or a click away closes it.
   */
  private noteButton(view: EditorView, dom: HTMLElement): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-divider-note-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-divider-note';
    button.title = this.note ?? 'Přidat poznámku k segmentu';
    button.setAttribute('aria-label', 'Poznámka k segmentu');
    button.innerHTML = NOTE_ICON;
    const popover = document.createElement('div');
    popover.className = 'cm-divider-note-popover';
    popover.popover = 'auto';
    const label = document.createElement('label');
    label.textContent = 'Poznámka k segmentu';
    const field = document.createElement('textarea');
    field.placeholder = 'Pro autora a převod, hráči ji neuvidí';
    field.value = this.note ?? '';
    field.rows = 3;
    label.append(field);
    popover.append(label);
    button.addEventListener('click', () => {
      popover.togglePopover();
    });
    popover.addEventListener('toggle', (event) => {
      if (event.newState !== 'open') {
        return;
      }

      // Under the button, its right edge with the button's.
      const box = button.getBoundingClientRect();
      popover.style.top = `${box.bottom + 6}px`;
      popover.style.left = `${Math.max(8, box.right - popover.offsetWidth)}px`;
      field.value = noteAt(view.state, lineOfWidget(view, dom).from) ?? '';
      field.focus();
    });
    field.addEventListener('input', () => {
      const at = lineOfWidget(view, dom).from;
      view.dispatch({ effects: writeNote.of({ at, text: field.value }) });
    });
    field.addEventListener('keydown', (event) => {
      // Esc closes the popover, not the dialog around the editor.
      if (event.key === 'Escape') {
        event.stopPropagation();
        popover.hidePopover();
        button.focus();
      }
    });
    wrap.append(button, popover);
    return wrap;
  }

  /** The chip takes its own clicks; the editor does not move the cursor for them. */
  override ignoreEvent(): boolean {
    return true;
  }
}

/** Nothing in place of the first divider, when the themes are not shown: no segment is above it. */
class HiddenDividerWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    return document.createElement('div');
  }
}

/** A hint in an empty segment, where its text goes; it is no part of the text. */
class PlaceholderWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const hint = document.createElement('span');
    hint.className = 'cm-segment-placeholder';
    hint.textContent = '…';
    return hint;
  }
}

const PLACEHOLDER = Decoration.widget({ widget: new PlaceholderWidget(), side: 1 });

/**
 * Dividers drawn as widgets, except the one under the cursor, which shows its text to edit. Block
 * widgets have to come from a state field.
 */
const decorate = (state: EditorState): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  const themes = state.facet(withThemes);
  // Without the themes, or outside, the first divider is no rule: no segment is above it.
  const hideFirst = !themes || state.facet(firstDividerOutside);
  // Without the themes a divider has nothing to edit: it stays a rule even under the cursor.
  const editing = new Set(
    themes && state.field(focused)
      ? state.selection.ranges.flatMap((range) => {
          const number = state.doc.lineAt(range.head).number;
          return hideFirst && number === 1 ? [] : [number];
        })
      : [],
  );
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (isDivider(line.text)) {
      if (!editing.has(number)) {
        const widget =
          hideFirst && number === 1
            ? new HiddenDividerWidget()
            : new DividerWidget(dividerTheme(line.text), noteAt(state, line.from));
        builder.add(line.from, line.to, Decoration.replace({ widget, block: true }));
      }

      continue;
    }

    // An empty segment, a lone empty line between dividers, shows where its text goes.
    const above = number > 1 ? state.doc.line(number - 1).text : undefined;
    const below = number < state.doc.lines ? state.doc.line(number + 1).text : undefined;
    if (
      !state.readOnly &&
      line.text === '' &&
      above !== undefined &&
      isDivider(above) &&
      (below === undefined || isDivider(below))
    ) {
      builder.add(line.from, line.from, PLACEHOLDER);
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
    const noted =
      transaction.startState.field(segmentNotes) !== transaction.state.field(segmentNotes);
    if (transaction.docChanged || transaction.selection !== undefined || refocused || noted) {
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

/** ⌘B and ⌘I: bold or italic around the selection, or taken away where it is already. */
const toggling =
  (mark: InlineMark): Command =>
  (view) => {
    if (view.state.readOnly) {
      return false;
    }

    view.dispatch(
      view.state.update(toggleMark(view.state, mark), {
        scrollIntoView: true,
        userEvent: 'input',
      }),
    );
    return true;
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

/** The commands without the themes, for an editor that does not show them. */
const PLAIN_SLASH_COMMANDS = SLASH_COMMANDS.filter((completion) => {
  return completion.detail !== 'Téma segmentu';
});

/** Offers the slash commands while a line holds only `/` and what follows it. */
const slashCommands = (context: CompletionContext): CompletionResult | null => {
  const line = context.state.doc.lineAt(context.pos);
  const typed = context.state.sliceDoc(line.from, context.pos);
  if (!SLASH.test(typed)) {
    return null;
  }

  const options = context.state.facet(withThemes) ? SLASH_COMMANDS : PLAIN_SLASH_COMMANDS;
  return { from: line.from + 1, options: [...options], validFor: /^[\p{L}\p{N} ]*$/u };
};

/** A list item's dash, star or plus as the bullet the players see. */
class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const bullet = document.createElement('span');
    bullet.className = 'cm-bullet';
    bullet.textContent = '•';
    return bullet;
  }
}

const BULLET = Decoration.replace({ widget: new BulletWidget() });
const HIDDEN = Decoration.replace({});
const QUOTE_LINE = Decoration.line({ class: 'cm-quote' });
const INLINE_CODE = Decoration.mark({ class: 'cm-inline-code' });
/** The three sizes of headings the players see; a deeper one is as the third. */
const HEADING_LINES = [
  Decoration.line({ class: 'cm-h1' }),
  Decoration.line({ class: 'cm-h2' }),
  Decoration.line({ class: 'cm-h3' }),
] as const;

/**
 * Markdown as the players see it, like Notion or Obsidian's live preview: headings large, quotes
 * with a line beside them, bullets for dashes, and the marks hidden. A mark shows again where it
 * can be written: a heading's or a quote's on the cursor's line, the asterisks and backticks
 * around the text the cursor is in. Only what the player renders is shown so; the text stays
 * markdown.
 */
const livePreview = (view: EditorView): DecorationSet => {
  const { state } = view;
  const decorations: Range<Decoration>[] = [];
  // Away from the editor, or only read, every mark is hidden.
  const heads =
    state.field(focused) && !state.readOnly
      ? state.selection.ranges.map((range) => {
          return range.head;
        })
      : [];
  const onLine = (at: number) => {
    const line = state.doc.lineAt(at);
    return heads.some((head) => {
      return head >= line.from && head <= line.to;
    });
  };

  const within = (from: number, to: number) =>
    heads.some((head) => {
      return head >= from && head <= to;
    });
  /** A mark hidden together with the space after it, which only parts it from the text. */
  const hide = (from: number, to: number) => {
    const end = state.sliceDoc(to, to + 1) === ' ' ? to + 1 : to;
    decorations.push(HIDDEN.range(from, end));
  };

  const quoted = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const heading = /^ATXHeading(\d)$/.exec(node.name);
        if (heading !== null) {
          const level = Math.min(Number(heading[1]), HEADING_LINES.length) - 1;
          decorations.push(HEADING_LINES[level]!.range(state.doc.lineAt(node.from).from));
          return;
        }

        switch (node.name) {
          case 'HeaderMark':
          case 'QuoteMark': {
            if (!onLine(node.from)) {
              hide(node.from, node.to);
            }

            return;
          }

          case 'Blockquote': {
            for (let at = node.from; at <= node.to;) {
              const line = state.doc.lineAt(at);
              if (!quoted.has(line.from)) {
                quoted.add(line.from);
                decorations.push(QUOTE_LINE.range(line.from));
              }

              at = line.to + 1;
            }

            return;
          }

          case 'EmphasisMark': {
            const around = node.node.parent;
            if (around !== null && !within(around.from, around.to)) {
              decorations.push(HIDDEN.range(node.from, node.to));
            }

            return;
          }

          case 'InlineCode': {
            decorations.push(INLINE_CODE.range(node.from, node.to));
            if (!within(node.from, node.to)) {
              // The backticks at both ends, the code kept.
              node.node.getChildren('CodeMark').forEach((mark) => {
                decorations.push(HIDDEN.range(mark.from, mark.to));
              });
            }

            return;
          }

          case 'ListMark': {
            if (/^[-*+]$/.test(state.sliceDoc(node.from, node.to)) && !onLine(node.from)) {
              decorations.push(BULLET.range(node.from, node.to));
            }

            return;
          }

          default:
            return;
        }
      },
    });
  }

  return Decoration.set(decorations, true);
};

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = livePreview(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.startState.field(focused) !== update.state.field(focused) ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = livePreview(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

/** Markdown's look; a mark shown where it is written is dimmed: `**bold**` with grey asterisks. */
const MARKDOWN_LOOK = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: tags.processingInstruction, color: 'var(--muted-foreground)', fontWeight: '400' },
]);

const LOOK = EditorView.theme({
  // The size comes from the element around, `fontSize` of the component.
  // It fills the element around when that is taller, so a click anywhere there writes.
  '&': {
    fontSize: 'inherit',
    color: 'var(--foreground)',
    backgroundColor: 'transparent',
    flex: '1 1 auto',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    lineHeight: '1.6',
  },
  '.cm-content': { padding: '0', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: '0' },
  // The headings' sizes, as the player has three of them.
  '.cm-h1': { fontSize: '1.6em', lineHeight: '1.3' },
  '.cm-h2': { fontSize: '1.35em', lineHeight: '1.3' },
  '.cm-h3': { fontSize: '1.15em', lineHeight: '1.4' },
  '.cm-line.cm-quote': {
    borderLeft: '3px solid var(--border)',
    paddingLeft: '0.75em',
    color: 'var(--muted-foreground)',
  },
  '.cm-bullet': { color: 'var(--muted-foreground)' },
  '.cm-inline-code': {
    backgroundColor: 'var(--muted)',
    borderRadius: '4px',
    padding: '0.1em 0.3em',
  },
  '.cm-segment-placeholder': {
    color: 'var(--muted-foreground)',
    opacity: '0.7',
    pointerEvents: 'none',
  },
  // Room above and below, so the segments read as parts apart; as large as the text allows, on a
  // small card too.
  '.cm-divider': {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    // As much above as below.
    padding: '1.5em 0',
  },
  '.cm-divider-rule': {
    position: 'relative',
    flex: '1',
    height: '1px',
    backgroundColor: 'var(--border)',
  },
  // In place of the default theme's hidden picker: a dot at the end of the column, on the line.
  '.cm-divider-default:not(.cm-divider-noted)::after': {
    content: '""',
    position: 'absolute',
    right: '0',
    // On the rule, the only thing in the line while the picker is out of the way.
    top: 'calc(1.5em + 0.5px)',
    width: '4px',
    height: '4px',
    translate: '0 -50%',
    borderRadius: '9999px',
    backgroundColor: 'var(--muted-foreground)',
    pointerEvents: 'none',
    transition: 'opacity 150ms ease-out',
  },
  '.cm-divider-default:hover::after, .cm-divider-default:focus-within::after': { opacity: '0' },
  // The note's button and the theme's picker over the end of the rule, out of the line's flow, so
  // the line is as high with them as without them, and the room above and below the rule stays
  // the same.
  '.cm-divider-tools': {
    position: 'absolute',
    right: '0',
    top: '50%',
    translate: '0 -50%',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  // Each on the page's ground, with a gap of it where the rule ends before them.
  '.cm-divider-picker': {
    position: 'relative',
    display: 'flex',
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--background)',
    boxShadow: '-6px 0 0 var(--background)',
  },
  '.cm-divider-note': {
    appearance: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    padding: '0',
    border: '1px solid transparent',
    borderRadius: '6px',
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--background)',
    boxShadow: '-6px 0 0 var(--background)',
    cursor: 'pointer',
    opacity: '0',
    outline: 'none',
    transition: 'opacity 150ms ease-out',
  },
  '.cm-divider-note svg': { width: '14px', height: '14px' },
  '.cm-divider-note:hover': { backgroundColor: 'var(--muted)', color: 'var(--foreground)' },
  '.cm-divider-note:focus-visible': {
    borderColor: 'var(--ring)',
    boxShadow: '0 0 0 3px color-mix(in oklab, var(--ring) 40%, transparent)',
  },
  // A segment with a note shows its button always, in the text's color; one without it only
  // under the pointer.
  '.cm-divider-noted .cm-divider-note': { opacity: '1', color: 'var(--foreground)' },
  '.cm-divider:hover .cm-divider-note, .cm-divider:focus-within .cm-divider-note': {
    opacity: '1',
  },
  // The segment's note, written in a popover under its button.
  '.cm-divider-note-popover': {
    position: 'fixed',
    inset: 'auto',
    margin: '0',
    width: '288px',
    padding: '12px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.2)',
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    letterSpacing: 'normal',
    lineHeight: '1.4',
  },
  '.cm-divider-note-popover label': {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    fontWeight: '500',
    letterSpacing: '0.025em',
    color: 'var(--muted-foreground)',
  },
  '.cm-divider-note-popover textarea': {
    width: '100%',
    minHeight: '5.5em',
    resize: 'vertical',
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--popover-foreground)',
    font: 'inherit',
    fontSize: '14px',
    fontWeight: '400',
    letterSpacing: 'normal',
    outline: 'none',
  },
  '.cm-divider-note-popover textarea:focus': { borderColor: 'var(--ring)' },
  // A chevron after the name, in the text's color, as the editor's other menus have it.
  '.cm-divider-picker::after': {
    content: '""',
    position: 'absolute',
    right: '8px',
    top: '50%',
    width: '10px',
    height: '10px',
    translate: '0 -50%',
    pointerEvents: 'none',
    backgroundColor: 'currentColor',
    mask: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\") center / contain no-repeat",
  },
  '.cm-divider-picker:hover, .cm-divider-picker:focus-within': { color: 'var(--foreground)' },
  // Out till the pointer comes, or the keyboard, the rule whole under it.
  '.cm-divider-default .cm-divider-picker': { display: 'none' },
  '.cm-divider-default:hover .cm-divider-picker, .cm-divider-default:focus-within .cm-divider-picker':
    { display: 'flex' },
  '.cm-divider-theme': {
    appearance: 'none',
    cursor: 'pointer',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '0 24px 0 8px',
    fontFamily: 'var(--font-sans)',
    fontSize: '11px',
    fontWeight: '500',
    letterSpacing: '0.04em',
    lineHeight: '20px',
    color: 'inherit',
    backgroundColor: 'var(--background)',
    outline: 'none',
  },
  '.cm-divider-theme:hover': { backgroundColor: 'var(--muted)' },
  '.cm-divider-theme:focus-visible': {
    borderColor: 'var(--ring)',
    boxShadow: '0 0 0 3px color-mix(in oklab, var(--ring) 40%, transparent)',
  },
  '.cm-tooltip': {
    border: '1px solid var(--border)',
    borderRadius: '8px',
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    overflow: 'hidden',
  },
  // A grid of two columns, the commands and what they do, so both line up from row to row.
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    display: 'grid',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'grid',
    gridColumn: '1 / -1',
    gridTemplateColumns: 'subgrid',
    columnGap: '16px',
    padding: '4px 10px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  // The command heavier than what it does.
  '.cm-completionLabel': { fontWeight: '500' },
  '.cm-completionDetail': { marginLeft: '0', fontStyle: 'normal', opacity: '0.6' },
});

const extensions = (
  onSegments: (segments: readonly DraftSegment[]) => void,
  initial: readonly DraftSegment[],
  themes: boolean,
  firstOutside: boolean,
): Extension => [
  withThemes.of(themes),
  firstDividerOutside.of(firstOutside),
  focused,
  // The notes of the segments the editor starts with, by their dividers.
  segmentNotes.init((state) => notesOfSegments(state.doc, initial)),
  notesInHistory,
  segmentLines,
  keepFirstDivider,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing)),
  history(),
  Prec.high(
    keymap.of([
      { key: 'Backspace', run: joinWithPrevious },
      { key: 'Delete', run: joinWithNext },
      { key: 'Enter', run: leaveDivider },
      { key: 'Mod-b', run: toggling('**') },
      // Over CodeMirror's own ⌘I, which selects the syntax around the cursor.
      { key: 'Mod-i', run: toggling('*') },
    ]),
  ),
  keymap.of([
    // ⌘[ and ⌘] go back and forth along the nodes opened, not indent the line.
    ...defaultKeymap.filter((binding) => {
      return binding.key !== 'Mod-[' && binding.key !== 'Mod-]';
    }),
    ...historyKeymap,
  ]),
  // A `===` line under text would read as a heading underline; here it divides segments.
  markdown({ extensions: [{ remove: ['SetextHeading'] }] }),
  syntaxHighlighting(MARKDOWN_LOOK),
  livePreviewPlugin,
  autocompletion({ override: [slashCommands], icons: false }),
  EditorView.lineWrapping,
  LOOK,
  EditorView.updateListener.of((update) => {
    if (
      update.docChanged ||
      update.startState.field(segmentNotes) !== update.state.field(segmentNotes)
    ) {
      onSegments(segmentsOf(update.state));
    }
  }),
];

/** Room between the letters of small text, as `text-2xs` and `text-xs` have it; none above. */
const trackingOf = (fontSize: number) => {
  if (fontSize <= 11) {
    return '0.04em';
  }

  return fontSize <= 12 ? '0.025em' : undefined;
};

export interface SegmentEditorProps {
  readonly value: readonly DraftSegment[];
  readonly onChange?: (segments: readonly DraftSegment[]) => void;
  readonly autoFocus?: boolean;
  /** Only shown, not written in. */
  readonly readOnly?: boolean;
  /** Of the text, in pixels. */
  readonly fontSize?: number;
  /** Off, the dividers are plain rules without the themes, which cannot be set here then. */
  readonly themes?: boolean;
  /**
   * The first segment's theme is set outside, on a line of the page above the editor; the first
   * divider is not drawn, and the text begins at the top.
   */
  readonly firstThemeOutside?: boolean;
  /** Replaces the default minimum height. */
  readonly className?: string;
}

/**
 * The segments of a node written as one text in a monospace font, like blocks in Notion: a `===`
 * line divides two segments and turns into a divider with the theme, `/` at the start of a line
 * offers commands. A segment's note is written in a popover of its divider. Markdown shows as the
 * players see it, its marks only where the cursor is.
 */
export const SegmentEditor = ({
  value,
  onChange,
  autoFocus,
  readOnly = false,
  fontSize = 14,
  themes = true,
  firstThemeOutside = false,
  className,
}: SegmentEditorProps) => {
  const host = useRef<HTMLDivElement>(null);
  /** The segments the editor starts with; later values come in through the second effect. */
  const initial = useRef(value);
  const view = useRef<EditorView | null>(null);
  /** The segments the editor holds, so an echo of its own change does not reset it. */
  const known = useRef(JSON.stringify(value));
  const change = useRef(onChange);

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const text = segmentsToDoc(initial.current);
    known.current = JSON.stringify(initial.current);
    const created = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        // The cursor starts in the text, under the first divider.
        selection: { anchor: text.indexOf('\n') + 1 },
        extensions: [
          extensions(
            (segments) => {
              const json = JSON.stringify(segments);
              if (json === known.current) {
                return;
              }

              known.current = json;
              change.current?.(segments);
            },
            initial.current,
            themes,
            firstThemeOutside,
          ),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ],
      }),
    });
    view.current = created;
    if (autoFocus === true) {
      created.focus();
    }

    // Esc in the open commands closes them, and goes no further: a dialog around would take it at
    // the document first and close as well.
    const closeCommands = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && completionStatus(created.state) !== null) {
        event.stopPropagation();
        event.preventDefault();
        closeCompletion(created);
      }
    };

    window.addEventListener('keydown', closeCommands, { capture: true });
    return () => {
      window.removeEventListener('keydown', closeCommands, { capture: true });
      created.destroy();
      view.current = null;
    };
  }, [autoFocus, readOnly, themes, firstThemeOutside]);

  useEffect(() => {
    const current = view.current;
    const json = JSON.stringify(value);
    if (current === null || json === known.current) {
      return;
    }

    // Changed from outside, as by an undo of the page: the text where it differs, the notes anew.
    known.current = json;
    const next = segmentsToDoc(value);
    if (next === current.state.doc.toString()) {
      current.dispatch({
        effects: setNotes.of(notesOfSegments(current.state.doc, value)),
        annotations: Transaction.addToHistory.of(false),
      });
      return;
    }

    // Only what differs, and out of the editor's own history: an undo here takes back what was
    // written here, not what came from outside.
    const before = current.state.doc.toString();
    let start = 0;
    while (start < before.length && start < next.length && before[start] === next[start]) {
      start += 1;
    }

    let end = 0;
    while (
      end < before.length - start &&
      end < next.length - start &&
      before[before.length - 1 - end] === next[next.length - 1 - end]
    ) {
      end += 1;
    }

    current.dispatch({
      changes: {
        from: start,
        to: before.length - end,
        insert: next.slice(start, next.length - end),
      },
      effects: setNotes.of(notesOfSegments(Text.of(next.split('\n')), value)),
      annotations: Transaction.addToHistory.of(false),
    });
  }, [value]);

  return (
    <div
      ref={host}
      className={cn('flex flex-col', className ?? 'min-h-24')}
      style={{ fontSize, letterSpacing: trackingOf(fontSize) }}
    />
  );
};
