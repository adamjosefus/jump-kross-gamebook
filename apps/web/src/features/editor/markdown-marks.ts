import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';

/** The inline marks the editor's keys put around a text: bold's two stars, italic's one. */
export type InlineMark = '**' | '*';

/**
 * Whether `text` ends with `mark` as a mark of its own: italic's star is not the second star of
 * bold, unless a third one follows it, as in bold and italic at once.
 */
const endsWithMark = (text: string, mark: InlineMark) => {
  if (!text.endsWith(mark)) {
    return false;
  }

  return mark === '**' || !text.endsWith('**') || text.endsWith('***');
};

/** The same at the start of `text`. */
const startsWithMark = (text: string, mark: InlineMark) => {
  if (!text.startsWith(mark)) {
    return false;
  }

  return mark === '**' || !text.startsWith('**') || text.startsWith('***');
};

/**
 * The change that puts `mark` around each selection, or takes it away where it is there already,
 * just around the selection or at both of its ends. An empty selection gets both marks with the
 * cursor between them, to write the text in.
 */
export const toggleMark = (state: EditorState, mark: InlineMark): TransactionSpec =>
  state.changeByRange((range) => {
    const size = mark.length;
    const before = state.sliceDoc(Math.max(0, range.from - 3), range.from);
    const after = state.sliceDoc(range.to, range.to + 3);
    if (endsWithMark(before, mark) && startsWithMark(after, mark)) {
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
      startsWithMark(selected, mark) &&
      endsWithMark(selected, mark)
    ) {
      return {
        changes: [
          { from: range.from, to: range.from + size },
          { from: range.to - size, to: range.to },
        ],
        range: EditorSelection.range(range.from, range.to - size * 2),
      };
    }

    return {
      changes: [
        { from: range.from, insert: mark },
        { from: range.to, insert: mark },
      ],
      range: EditorSelection.range(range.anchor + size, range.head + size),
    };
  });
