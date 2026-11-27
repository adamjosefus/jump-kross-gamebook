import type { Theme } from '@gamebook/core';

/**
 * A story draft from the editor: the text and the shape of the story, without its logic. It is
 * turned into a `defineStory` script by hand or by an LLM; `docs/story-draft.md` says how.
 */
export interface Draft {
  readonly version: 1;
  /** In the order they were written; the canvas lays them out on its own. */
  readonly nodes: readonly DraftNode[];
}

/** One node of the story, as `nodes` of `defineStory` has them. */
export interface DraftNode {
  /** Becomes the node's key in the script; derived from the summary by `draftNodeId`. */
  readonly id: string;
  /** What happens in the node, in a sentence; the only text left when the canvas is zoomed out. */
  readonly summary: string;
  /** Everything the editor has no field for: conditions, the state, a QR code instead of buttons. */
  readonly note?: string;
  /** At least one; the parts the players page through. */
  readonly segments: readonly DraftSegment[];
  /** In the order of the buttons; none makes the node an end of the story. */
  readonly choices: readonly DraftChoice[];
  /** The card's size as the author set it, for the editor only; it follows the text when missing. */
  readonly size?: DraftSize;
}

/** A card's size in pixels; a side not given follows the card's content. */
export interface DraftSize {
  readonly width?: number;
  readonly height?: number;
}

/** One part of a node's text the players page through. */
export interface DraftSegment {
  /** The default theme when missing. */
  readonly theme?: Theme;
  /** Markdown. */
  readonly text: string;
  /** For the author and the conversion, never shown to the players. */
  readonly note?: string;
}

/** A way on from a node: a button, or a QR code when the node's note says so. */
export interface DraftChoice {
  /** The button's text; empty for the plain arrow „Další“. */
  readonly label: string;
  /** The `id` of the node it leads to. */
  readonly to: string;
}

/** Longest id `draftNodeId` derives, cut after a whole word. */
export const MAX_ID_LENGTH = 24;

/** Used when a summary has no letters or digits to make an id of. */
const FALLBACK_ID = 'uzel';

/**
 * An id for a node with this summary: without diacritics, lowercase, the words joined by `_` and
 * cut after the last whole word that fits `MAX_ID_LENGTH`. A number is added when the id is
 * `taken`, e.g. `pekarna_2`.
 */
export const draftNodeId = (summary: string, taken: ReadonlySet<string> = new Set()): string => {
  const words = summary
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => {
      return word !== '';
    });
  let id = '';
  for (const word of words) {
    const longer = id === '' ? word : `${id}_${word}`;
    if (longer.length > MAX_ID_LENGTH) {
      break;
    }

    id = longer;
  }

  // A first word longer than the limit is cut inside the word.
  if (id === '' && words.length > 0) {
    id = words[0]!.slice(0, MAX_ID_LENGTH);
  }

  const base = id === '' ? FALLBACK_ID : id;
  if (!taken.has(base)) {
    return base;
  }

  let number = 2;
  while (taken.has(`${base}_${number}`)) {
    number += 1;
  }

  return `${base}_${number}`;
};

/** A choice that leads into a node, with the node it is on. */
export interface IncomingChoice {
  readonly from: DraftNode;
  readonly choice: DraftChoice;
  /** The choice's position among the buttons of `from`. */
  readonly index: number;
}

/** The choices of other nodes that lead into the node `id`, in the order of the nodes. */
export const incoming = (draft: Draft, id: string): readonly IncomingChoice[] =>
  draft.nodes.flatMap((from) => {
    if (from.id === id) {
      return [];
    }

    return from.choices.flatMap((choice, index) => {
      if (choice.to !== id) {
        return [];
      }

      return [{ from, choice, index }];
    });
  });

/** The nodes no other node leads into: where the story begins. */
export const startsOf = (draft: Draft): readonly DraftNode[] =>
  draft.nodes.filter((node) => {
    return incoming(draft, node.id).length === 0;
  });

/** The nodes without a choice: where the story ends. */
export const endsOf = (draft: Draft): readonly DraftNode[] =>
  draft.nodes.filter((node) => {
    return node.choices.length === 0;
  });

/** The smallest and the largest of some numbers. */
export interface Range {
  readonly min: number;
  readonly max: number;
}

/** How long the ways to an end are: in nodes, start and end included, and in segment text. */
export interface RoutesToEnd {
  readonly steps: Range;
  /** How many ways lead there. */
  readonly ways: number;
  /**
   * Characters of the segments' text the players read on a way, the end's included, on average
   * over the ways.
   */
  readonly meanCharacters: number;
}

/** Most ways walked to one end; a draft branching more than that is measured by the first ones. */
const ROUTE_LIMIT = 10_000;

/**
 * How long the ways from the starts to the node `end` are, each node at most once on a way, so a
 * choice back does not make a way endless. A way is a run of nodes: choices leading to the same
 * node make one way, not one each. `undefined` when no start leads there.
 */
export const routesTo = (draft: Draft, end: string): RoutesToEnd | undefined => {
  const nodes = new Map(draft.nodes.map((node) => [node.id, node]));
  // Only the nodes the end can be reached from are worth walking through.
  const leading = new Set([end]);
  for (let grown = true; grown;) {
    grown = false;
    for (const node of draft.nodes) {
      if (
        !leading.has(node.id) &&
        node.choices.some((choice) => {
          return leading.has(choice.to);
        })
      ) {
        leading.add(node.id);
        grown = true;
      }
    }
  }

  const characters = (node: DraftNode) =>
    node.segments.reduce((sum, segment) => {
      return sum + segment.text.length;
    }, 0);
  const steps: number[] = [];
  const texts: number[] = [];
  const walk = (node: DraftNode, on: ReadonlySet<string>, length: number, text: number) => {
    if (steps.length >= ROUTE_LIMIT) {
      return;
    }

    if (node.id === end) {
      steps.push(length);
      texts.push(text);
      return;
    }

    // Two choices to one node make one way: a way is the nodes the players read, not the
    // buttons they pressed.
    for (const to of new Set(node.choices.map((choice) => choice.to))) {
      const next = nodes.get(to);
      if (next !== undefined && leading.has(next.id) && !on.has(next.id)) {
        walk(next, new Set([...on, next.id]), length + 1, text + characters(next));
      }
    }
  };

  for (const start of startsOf(draft)) {
    if (leading.has(start.id)) {
      walk(start, new Set([start.id]), 1, characters(start));
    }
  }

  if (steps.length === 0) {
    return undefined;
  }

  return {
    steps: { min: Math.min(...steps), max: Math.max(...steps) },
    ways: steps.length,
    meanCharacters:
      texts.reduce((sum, text) => {
        return sum + text;
      }, 0) / texts.length,
  };
};

/** Characters of the ways to all the ends together, on average over all the ways. */
export const meanCharactersOf = (routes: readonly RoutesToEnd[]): number | undefined => {
  const ways = routes.reduce((sum, route) => {
    return sum + route.ways;
  }, 0);
  if (ways === 0) {
    return undefined;
  }

  return (
    routes.reduce((sum, route) => {
      return sum + route.meanCharacters * route.ways;
    }, 0) / ways
  );
};
