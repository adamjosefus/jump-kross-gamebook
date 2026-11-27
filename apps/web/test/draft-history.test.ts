import { describe, expect, it } from 'vitest';

import type { Draft } from '@/features/editor/draft';
import { historyReducer, startHistory, TYPING_PAUSE } from '@/features/editor/draft-history';

const draftOf = (summary: string): Draft => ({
  version: 1,
  nodes: [{ id: 'a', summary, segments: [{ text: '' }], choices: [] }],
});

const summaryOf = (draft: Draft) => draft.nodes[0]!.summary;

describe('historyReducer', () => {
  it('goes back and forth between the changes', () => {
    let history = startHistory(draftOf('a'));
    history = historyReducer(history, { type: 'change', draft: draftOf('b'), at: 0 });
    history = historyReducer(history, { type: 'change', draft: draftOf('c'), at: 1 });
    history = historyReducer(history, { type: 'undo' });
    expect(summaryOf(history.present)).toBe('b');
    history = historyReducer(history, { type: 'undo' });
    expect(summaryOf(history.present)).toBe('a');
    expect(historyReducer(history, { type: 'undo' })).toBe(history);
    history = historyReducer(history, { type: 'redo' });
    expect(summaryOf(history.present)).toBe('b');
  });

  it('forgets the steps undone once something else changes', () => {
    let history = startHistory(draftOf('a'));
    history = historyReducer(history, { type: 'change', draft: draftOf('b'), at: 0 });
    history = historyReducer(history, { type: 'undo' });
    history = historyReducer(history, { type: 'change', draft: draftOf('x'), at: 1 });
    expect(history.future).toEqual([]);
    expect(historyReducer(history, { type: 'redo' })).toBe(history);
  });

  it('makes one step of typing into one field without a pause', () => {
    let history = startHistory(draftOf(''));
    for (const [at, summary] of [
      [0, 'P'],
      [300, 'Pe'],
      [600, 'Pek'],
    ] as const) {
      history = historyReducer(history, {
        type: 'change',
        draft: draftOf(summary),
        field: 's',
        at,
      });
    }

    expect(history.past.map(summaryOf)).toEqual(['']);
    // After a pause, or in another field, typing is a step of its own.
    history = historyReducer(history, {
      type: 'change',
      draft: draftOf('Peka'),
      field: 's',
      at: 600 + TYPING_PAUSE,
    });
    history = historyReducer(history, {
      type: 'change',
      draft: draftOf('Pekař'),
      field: 'id',
      at: 700 + TYPING_PAUSE,
    });
    expect(history.past.map(summaryOf)).toEqual(['', 'Pek', 'Peka']);
  });
});
