import { THEMES } from '@gamebook/core';

import {
  draftNodeId,
  startsOf,
  type Draft,
  type DraftChoice,
  type DraftNode,
  type DraftSegment,
  type DraftSize,
} from './draft';

/** A choice of a node by its index, or a new one added after the others. */
export type ChoiceSlot = number | 'new';

/** A node with nothing written yet, as a new one is drawn out. */
export const emptyNode = (id: string): DraftNode => ({
  id,
  summary: '',
  segments: [{ text: '' }],
  choices: [],
});

/** Where a new draft starts: one empty node, the start. */
export const EMPTY_DRAFT: Draft = {
  version: 1,
  starts: [draftNodeId('')],
  nodes: [emptyNode(draftNodeId(''))],
};

/** The draft with the start dot pointing at `ids`, written out. */
const withStarts = (draft: Draft, ids: readonly string[]): Draft => ({ ...draft, starts: ids });

/** The draft with the start dot pointing at the node `id` too; the same draft when it does. */
export const addStart = (draft: Draft, id: string): Draft => {
  const ids = startsOf(draft).map((node) => node.id);
  if (ids.includes(id)) {
    return draft;
  }

  return withStarts(draft, [...ids, id]);
};

/** The draft with a new empty node the start dot points at; the new node's id with it. */
export const startInNew = (draft: Draft): { readonly draft: Draft; readonly target: string } => {
  const id = draftNodeId(
    '',
    new Set(
      draft.nodes.map((node) => {
        return node.id;
      }),
    ),
  );
  return { draft: addStart({ ...draft, nodes: [...draft.nodes, emptyNode(id)] }, id), target: id };
};

/** The draft with the start dot no longer pointing at the node `id`. */
export const removeStart = (draft: Draft, id: string): Draft =>
  withStarts(
    draft,
    startsOf(draft).flatMap((node) => {
      return node.id === id ? [] : [node.id];
    }),
  );

/** The draft with the node `id` changed by `change`. */
export const updateNode = (
  draft: Draft,
  id: string,
  change: (node: DraftNode) => DraftNode,
): Draft => ({
  ...draft,
  nodes: draft.nodes.map((node) => {
    if (node.id !== id) {
      return node;
    }

    return change(node);
  }),
});

/** The draft with the node `from` named `to`, and every choice leading to it too. */
export const renameNode = (draft: Draft, from: string, to: string): Draft => {
  if (from === to) {
    return draft;
  }

  return {
    ...draft,
    ...(draft.starts === undefined
      ? {}
      : {
          starts: draft.starts.map((id) => {
            return id === from ? to : id;
          }),
        }),
    nodes: draft.nodes.map((node) => {
      return {
        ...node,
        ...(node.id === from ? { id: to } : {}),
        choices: node.choices.map((choice) => {
          if (choice.to !== from) {
            return choice;
          }

          return { ...choice, to };
        }),
      };
    }),
  };
};

/** The node without its note when the note is empty. */
export const withNote = (node: DraftNode, note: string): DraftNode => {
  if (note !== '') {
    return { ...node, note };
  }

  // Everything else kept as it was, the time of the last change too.
  const { note: _note, ...rest } = node;
  return rest;
};

/** The draft without the node `id`, the choices leading to it and the start's arrow to it. */
export const removeNode = (draft: Draft, id: string): Draft => ({
  // Written out, so the start does not move to another node on its own.
  ...withStarts(
    draft,
    startsOf(draft).flatMap((node) => {
      return node.id === id ? [] : [node.id];
    }),
  ),
  nodes: draft.nodes.flatMap((node) => {
    if (node.id === id) {
      return [];
    }

    return [
      {
        ...node,
        choices: node.choices.filter((choice) => {
          return choice.to !== id;
        }),
      },
    ];
  }),
});

/**
 * The draft with a choice of `source` leading to `target`: the choice in `slot`, or a new plain
 * one. Without a `target`, a new empty node is added for it; its id comes back as `target`.
 */
export const linkChoice = (
  draft: Draft,
  source: string,
  slot: ChoiceSlot,
  target?: string,
): { readonly draft: Draft; readonly target: string } => {
  const taken = new Set(draft.nodes.map((node) => node.id));
  const to = target ?? draftNodeId('', taken);
  const linked = updateNode(draft, source, (node) => {
    if (slot === 'new') {
      return { ...node, choices: [...node.choices, { label: '', to }] };
    }

    return {
      ...node,
      choices: node.choices.map((choice, index) => {
        if (index !== slot) {
          return choice;
        }

        return { ...choice, to };
      }),
    };
  });
  if (target !== undefined) {
    return { draft: linked, target: to };
  }

  return { draft: { ...linked, nodes: [...linked.nodes, emptyNode(to)] }, target: to };
};

/**
 * The draft with a new plain choice of `source` leading into `target`. Without a `source`, a new
 * empty node is added with that choice; its id comes back as `source`.
 */
export const linkInto = (
  draft: Draft,
  target: string,
  source?: string,
): { readonly draft: Draft; readonly source: string } => {
  if (source !== undefined) {
    return { draft: linkChoice(draft, source, 'new', target).draft, source };
  }

  const id = draftNodeId('', new Set(draft.nodes.map((node) => node.id)));
  return {
    draft: {
      ...draft,
      nodes: [...draft.nodes, { ...emptyNode(id), choices: [{ label: '', to: target }] }],
    },
    source: id,
  };
};

/** The draft with the card of `id` sized as the author set it; without a size it follows its text. */
export const setSize = (draft: Draft, id: string, size: DraftSize | undefined): Draft =>
  updateNode(draft, id, (node) => {
    if (size !== undefined && (size.width !== undefined || size.height !== undefined)) {
      return { ...node, size };
    }

    // Everything else kept as it was, the time of the last change too.
    const { size: _size, ...rest } = node;
    return rest;
  });

/**
 * The draft with every card following its text again, as if each card's corner was double-clicked;
 * the same draft when no card was sized by hand.
 */
export const fitAllSizes = (draft: Draft): Draft =>
  draft.nodes.reduce((fitted, node) => {
    if (node.size === undefined) {
      return fitted;
    }

    return setSize(fitted, node.id, undefined);
  }, draft);

/** The draft with a choice of `id` moved by `offset` places, as far as the list goes. */
export const moveChoice = (draft: Draft, id: string, index: number, offset: number): Draft =>
  updateNode(draft, id, (node) => {
    const to = Math.max(0, Math.min(node.choices.length - 1, index + offset));
    const moved = node.choices[index];
    if (moved === undefined || to === index) {
      return node;
    }

    const rest = node.choices.toSpliced(index, 1);
    return { ...node, choices: rest.toSpliced(to, 0, moved) };
  });

/** The draft without a choice of `id`. */
export const removeChoice = (draft: Draft, id: string, index: number): Draft =>
  updateNode(draft, id, (node) => {
    return { ...node, choices: node.choices.toSpliced(index, 1) };
  });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const THEME_NAMES: ReadonlySet<unknown> = new Set(THEMES);

const parseSegment = (value: unknown): DraftSegment | undefined => {
  if (!isRecord(value) || typeof value['text'] !== 'string') {
    return undefined;
  }

  const { theme, note } = value;
  if (theme !== undefined && !THEME_NAMES.has(theme)) {
    return undefined;
  }

  if (note !== undefined && typeof note !== 'string') {
    return undefined;
  }

  return {
    ...(theme === undefined ? {} : { theme: THEMES.find((name) => name === theme)! }),
    text: value['text'],
    ...(note === undefined ? {} : { note }),
  };
};

const parseChoice = (value: unknown): DraftChoice | undefined => {
  if (!isRecord(value) || typeof value['label'] !== 'string' || typeof value['to'] !== 'string') {
    return undefined;
  }

  return { label: value['label'], to: value['to'] };
};

/** Every item read, or `undefined` when any of them is not one. */
const parseAll = <T>(
  values: unknown,
  parse: (value: unknown) => T | undefined,
): readonly T[] | undefined => {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const parsed = values.map(parse);
  if (parsed.includes(undefined)) {
    return undefined;
  }

  return parsed.filter((item) => {
    return item !== undefined;
  });
};

/** A length of a card's side: a positive number of pixels. */
const isLength = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** A card's size, `undefined` without one, `null` when it is not one. */
const parseSize = (value: unknown): DraftSize | undefined | null => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }

  const { width, height } = value;
  if ((width !== undefined && !isLength(width)) || (height !== undefined && !isLength(height))) {
    return null;
  }

  return {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
};

const parseNode = (value: unknown): DraftNode | undefined => {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['summary'] !== 'string') {
    return undefined;
  }

  const { note } = value;
  const segments = parseAll(value['segments'], parseSegment);
  const choices = parseAll(value['choices'], parseChoice);
  if (segments === undefined || segments.length === 0 || choices === undefined) {
    return undefined;
  }

  if (note !== undefined && typeof note !== 'string') {
    return undefined;
  }

  const size = parseSize(value['size']);
  if (size === null) {
    return undefined;
  }

  const { updatedAt } = value;
  if (
    updatedAt !== undefined &&
    (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt)))
  ) {
    return undefined;
  }

  return {
    id: value['id'],
    summary: value['summary'],
    ...(note === undefined ? {} : { note }),
    segments,
    choices,
    ...(size === undefined ? {} : { size }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
};

/**
 * The draft in a file's JSON, or `undefined` when it is not one: a field of the wrong kind, an
 * unknown theme, a node without segments or two nodes with one id.
 */
export const parseDraft = (value: unknown): Draft | undefined => {
  if (!isRecord(value) || value['version'] !== 1) {
    return undefined;
  }

  const nodes = parseAll(value['nodes'], parseNode);
  if (nodes === undefined) {
    return undefined;
  }

  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) {
    return undefined;
  }

  // A time of the draft's last change, kept by older files, is left out: the nodes keep theirs.
  const starts = value['starts'];
  // A draft from before the start was kept gets it written out, so it stays where it is.
  if (starts === undefined) {
    return {
      version: 1,
      starts: startsOf({ version: 1, nodes }).map((node) => node.id),
      nodes,
    };
  }

  if (!Array.isArray(starts) || !starts.every((id) => typeof id === 'string')) {
    return undefined;
  }

  return { version: 1, starts: starts.filter((id: string) => ids.has(id)), nodes };
};

/** What is removed at once: nodes, choices by their node and index, the start's arrows by target. */
export interface Removal {
  readonly nodes: readonly string[];
  readonly choices: readonly { readonly id: string; readonly index: number }[];
  readonly starts: readonly string[];
}

/**
 * The draft without all of `removal`: the choices first, the later ones of a node before the
 * earlier ones so the indexes still hold, then the start's arrows, then the nodes.
 */
export const removeAll = (draft: Draft, removal: Removal): Draft => {
  const withoutChoices = removal.choices
    .toSorted((left, right) => right.index - left.index)
    .reduce((current, { id, index }) => removeChoice(current, id, index), draft);
  const withoutStarts = removal.starts.reduce(
    (current, id) => removeStart(current, id),
    withoutChoices,
  );
  return removal.nodes.reduce((current, id) => removeNode(current, id), withoutStarts);
};

/** The draft as its file has it, the editor's save and its download alike, its keys in order. */
export const draftForFile = (draft: Draft): Draft => ({
  version: 1,
  ...(draft.starts === undefined ? {} : { starts: draft.starts }),
  nodes: draft.nodes,
});

/** The text of the draft's file, as the dev server writes it. */
export const draftFileText = (draft: Draft) => `${JSON.stringify(draftForFile(draft), null, 2)}\n`;

/** What of a node counts as a change of it: all but the size of its card and the time itself. */
const contentOf = ({ id, summary, note, segments, choices }: DraftNode) =>
  // In a fixed order: the same content written by other edits in another order is the same.
  JSON.stringify([
    id,
    summary,
    note ?? null,
    segments.map((segment) => [segment.theme ?? null, segment.text, segment.note ?? null]),
    choices.map((choice) => [choice.label, choice.to]),
  ]);

/**
 * The draft `next` with `at` as the time of the last change of every node changed since
 * `previous`: one with another text, note, id or choices, or a new one. A node is matched by its
 * id, or, renamed, by its place. The same draft when no node changed.
 */
export const stampChanges = (previous: Draft, next: Draft, at: string): Draft => {
  const before = new Map(previous.nodes.map((node) => [node.id, node]));
  const nodes = next.nodes.map((node, index) => {
    const old = before.get(node.id) ?? previous.nodes[index];
    if (old !== undefined && contentOf(old) === contentOf(node)) {
      return node;
    }

    return { ...node, updatedAt: at };
  });
  if (
    nodes.every((node, index) => {
      return node === next.nodes[index];
    })
  ) {
    return next;
  }

  return { ...next, nodes };
};
