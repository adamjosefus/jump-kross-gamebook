import { THEMES } from '@gamebook/core';

import {
  draftNodeId,
  type Draft,
  type DraftChoice,
  type DraftNode,
  type DraftSegment,
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

/** Where a new draft starts: one empty node. */
export const EMPTY_DRAFT: Draft = { version: 1, nodes: [emptyNode(draftNodeId(''))] };

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

/** The draft without the node `id` and without the choices leading to it. */
export const removeNode = (draft: Draft, id: string): Draft => ({
  ...draft,
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

  return {
    id: value['id'],
    summary: value['summary'],
    ...(note === undefined ? {} : { note }),
    segments,
    choices,
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

  return { version: 1, nodes };
};
