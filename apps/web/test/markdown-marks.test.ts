import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { toggleMark, type InlineMark } from '@/features/editor/markdown-marks';

/** The text after the mark is toggled over `from`…`to`, and what stays selected. */
const toggled = (doc: string, from: number, to: number, mark: InlineMark) => {
  const state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
  const next = state.update(toggleMark(state, mark)).state;
  const { main } = next.selection;
  return { text: next.doc.toString(), selected: next.sliceDoc(main.from, main.to) };
};

describe('toggleMark', () => {
  it('makes the selection bold or italic', () => {
    expect(toggled('Ahoj světe', 5, 10, '**')).toEqual({
      text: 'Ahoj **světe**',
      selected: 'světe',
    });
    expect(toggled('Ahoj světe', 5, 10, '*')).toEqual({ text: 'Ahoj *světe*', selected: 'světe' });
  });

  it('puts the cursor between the marks without a selection', () => {
    const state = EditorState.create({ doc: 'Ahoj ', selection: EditorSelection.cursor(5) });
    const next = state.update(toggleMark(state, '**')).state;
    expect(next.doc.toString()).toBe('Ahoj ****');
    expect(next.selection.main.head).toBe(7);
  });

  it('takes the marks away around the selection, or at its ends', () => {
    expect(toggled('Ahoj **světe**', 7, 12, '**').text).toBe('Ahoj světe');
    expect(toggled('Ahoj **světe**', 5, 14, '**')).toEqual({
      text: 'Ahoj světe',
      selected: 'světe',
    });
  });

  it('takes away italic and bold written with underscores', () => {
    expect(toggled('_V lese je ticho._', 0, 18, '*')).toEqual({
      text: 'V lese je ticho.',
      selected: 'V lese je ticho.',
    });
    expect(toggled('__Pozor__', 2, 7, '**').text).toBe('Pozor');
  });

  it('tells italic from bold', () => {
    // A star of bold is no italic: italic goes in.
    expect(toggled('**světe**', 2, 7, '*').text).toBe('***světe***');
    // Bold and italic at once lose only the italic.
    expect(toggled('***světe***', 3, 8, '*').text).toBe('**světe**');
    expect(toggled('***světe***', 3, 8, '**').text).toBe('*světe*');
  });
});
