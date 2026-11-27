import {
  EditorSelection,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from '@codemirror/state';

/** The inline marks the editor's keys put around a text: bold's two stars, italic's one. */
export type InlineMark = '**' | '*';

/**
 * The marks of the same meaning a text may have instead: markdown writes bold and italic with
 * underscores too, and the keys take those away as well; the keys themselves put stars.
 */
const SPELLINGS: Readonly<Record<InlineMark, readonly string[]>> = {
  '**': ['**', '__'],
  '*': ['*', '_'],
};

/**
 * Whether `text` ends with `mark` as a mark of its own: italic's one character is not the second
 * of bold's two, unless a third one follows it, as in bold and italic at once.
 */
const endsWithMark = (text: string, mark: string) => {
  if (!text.endsWith(mark)) {
    return false;
  }

  const sign = mark[0]!;
  return mark.length === 2 || !text.endsWith(sign.repeat(2)) || text.endsWith(sign.repeat(3));
};

/** The same at the start of `text`. */
const startsWithMark = (text: string, mark: string) => {
  if (!text.startsWith(mark)) {
    return false;
  }

  const sign = mark[0]!;
  return mark.length === 2 || !text.startsWith(sign.repeat(2)) || text.startsWith(sign.repeat(3));
};

/** The change that takes `spelling` away around `range` or at both of its ends, if it is there. */
const unmarked = (state: EditorState, range: SelectionRange, spelling: string) => {
  const size = spelling.length;
  const before = state.sliceDoc(Math.max(0, range.from - 3), range.from);
  const after = state.sliceDoc(range.to, range.to + 3);
  if (endsWithMark(before, spelling) && startsWithMark(after, spelling)) {
    return {
      changes: [
        { from: range.from - size, to: range.from },
        { from: range.to, to: range.to + size },
      ],
      range: EditorSelection.range(range.anchor - size, range.head - size),
    };
  }

  const selected = state.sliceDoc(range.from, range.to);
  if (
    selected.length >= size * 2 &&
    startsWithMark(selected, spelling) &&
    endsWithMark(selected, spelling)
  ) {
    return {
      changes: [
        { from: range.from, to: range.from + size },
        { from: range.to - size, to: range.to },
      ],
      range: EditorSelection.range(range.from, range.to - size * 2),
    };
  }

  return undefined;
};

/**
 * The change that puts `mark` around each selection, or takes it away where it is there already
 * in either spelling, just around the selection or at both of its ends. An empty selection gets
 * both marks with the cursor between them, to write the text in.
 */
export const toggleMark = (state: EditorState, mark: InlineMark): TransactionSpec =>
  state.changeByRange((range) => {
    for (const spelling of SPELLINGS[mark]) {
      const removed = unmarked(state, range, spelling);
      if (removed !== undefined) {
        return removed;
      }
    }

    const size = mark.length;
    return {
      changes: [
        { from: range.from, insert: mark },
        { from: range.to, insert: mark },
      ],
      range: EditorSelection.range(range.anchor + size, range.head + size),
    };
  });
