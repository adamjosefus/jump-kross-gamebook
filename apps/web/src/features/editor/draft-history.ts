import type { Draft } from './draft';

/** How long typing into one field stays one step of the history, in ms. */
export const TYPING_PAUSE = 1000;

/** The drafts to go back and forth between, and the one shown. */
export interface DraftHistory {
  readonly past: readonly Draft[];
  readonly present: Draft;
  readonly future: readonly Draft[];
  /** What the last change typed into and when, so the next keystroke there joins it. */
  readonly typing?: { readonly field: string; readonly at: number };
}

export type HistoryAction =
  | {
      readonly type: 'change';
      readonly draft: Draft;
      /** The field typed into; keystrokes into it close together make one step. */
      readonly field?: string;
      readonly at: number;
    }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'reset'; readonly draft: Draft };

/** Most steps kept to go back. */
const LIMIT = 200;

export const startHistory = (draft: Draft): DraftHistory => ({
  past: [],
  present: draft,
  future: [],
});

/** The history after an action: a change is a step back, unless it goes on typing in one field. */
export const historyReducer = (history: DraftHistory, action: HistoryAction): DraftHistory => {
  if (action.type === 'reset') {
    return startHistory(action.draft);
  }

  if (action.type === 'undo') {
    const previous = history.past.at(-1);
    if (previous === undefined) {
      return history;
    }

    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
    };
  }

  if (action.type === 'redo') {
    const [next, ...rest] = history.future;
    if (next === undefined) {
      return history;
    }

    return { past: [...history.past, history.present], present: next, future: rest };
  }

  if (action.draft === history.present) {
    return history;
  }

  const typing = action.field === undefined ? undefined : { field: action.field, at: action.at };
  const goesOn =
    typing !== undefined &&
    history.typing?.field === typing.field &&
    typing.at - history.typing.at < TYPING_PAUSE;
  return {
    past: goesOn ? history.past : [...history.past, history.present].slice(-LIMIT),
    present: action.draft,
    future: [],
    ...(typing === undefined ? {} : { typing }),
  };
};
