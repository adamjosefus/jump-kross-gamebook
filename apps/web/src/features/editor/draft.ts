import type { Theme } from '@gamebook/core';

/**
 * A story draft from the editor: the text and the shape of the story, without its logic. It is
 * turned into a `defineStory` script by hand or by an LLM; `docs/story-draft.md` says how.
 */
export interface Draft {
  readonly version: 1;
  /**
   * The ids of the nodes the start dot points at, where the story begins. One in a draft in
   * order; none or more are a problem the editor shows, but keeps. Missing in a draft written
   * before the editor had it: the start is the first node no other node leads into.
   */
  readonly starts?: readonly string[];
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
  /**
   * When the node itself last changed, as an ISO date and time in UTC: its text, note, id or
   * choices, not the size of its card. Missing for a node not changed since the editor kept it.
   */
  readonly updatedAt?: string;
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

/** How the plain arrow is named on the card, the edges and the buttons. */
export const NEXT_LABEL = 'Další';

/** A choice's text as the players read it: trimmed, the plain arrow for an empty one. */
const shownLabel = (choice: DraftChoice) => {
  const label = choice.label.trim();
  if (label === '') {
    return NEXT_LABEL;
  }

  return label;
};

/**
 * The indexes of the choices whose text another choice of the same list has too, case aside. The
 * draft allows it, but the players cannot tell such buttons apart.
 */
export const sameLabelChoices = (choices: readonly DraftChoice[]): ReadonlySet<number> => {
  const counts = new Map<string, number>();
  const keys = choices.map((choice) => {
    const key = shownLabel(choice).toLocaleLowerCase('cs');
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return key;
  });
  return new Set(
    keys.flatMap((key, index) => {
      if ((counts.get(key) ?? 0) < 2) {
        return [];
      }

      return [index];
    }),
  );
};

/** Why a choice is marked by `sameLabelChoices`, for its title. */
export const SAME_LABEL_WARNING = 'Stejný text má i jiná volba, hráči tlačítka nerozliší.';

/** Longest id `draftNodeId` derives, cut after a whole word. */
export const MAX_ID_LENGTH = 24;

/** Used when a summary has no letters or digits to make an id of. */
const FALLBACK_ID = 'uzel';

/**
 * An id for a node with this summary: without diacritics, lowercase, the words joined by `_` and
 * cut after the last whole word that fits `MAX_ID_LENGTH`. A number is added when the id is
 * `taken`, e.g. `pekarna_2`. A summary with no letters or digits gives `fallback`.
 */
export const draftNodeId = (
  summary: string,
  taken: ReadonlySet<string> = new Set(),
  fallback: string = FALLBACK_ID,
): string => {
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

  const base = id === '' ? fallback : id;
  if (!taken.has(base)) {
    return base;
  }

  let number = 2;
  while (taken.has(`${base}_${number}`)) {
    number += 1;
  }

  return `${base}_${number}`;
};

/**
 * The id of a node added before anything is written in it: its order in the story, e.g. `5` for
 * the fifth node. The next free number when that one is `taken`.
 */
export const newNodeId = (taken: ReadonlySet<string>): string => {
  let number = taken.size + 1;
  while (taken.has(String(number))) {
    number += 1;
  }

  return String(number);
};

/** Whether `id` looks like one `newNodeId` gives, a bare number. */
export const isNewNodeId = (id: string): boolean => /^[0-9]+$/.test(id);

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

/** The nodes no other node leads into; the start is one of them, or should be. */
export const rootsOf = (draft: Draft): readonly DraftNode[] =>
  draft.nodes.filter((node) => {
    return incoming(draft, node.id).length === 0;
  });

/**
 * The nodes the start dot points at, in its order: those in `starts`, or, in a draft without it,
 * the first node no other node leads into.
 */
export const startsOf = (draft: Draft): readonly DraftNode[] => {
  if (draft.starts === undefined) {
    return rootsOf(draft).slice(0, 1);
  }

  return draft.starts.flatMap((id) => {
    const node = draft.nodes.find((candidate) => {
      return candidate.id === id;
    });
    return node === undefined ? [] : [node];
  });
};

/** What can be wrong with a node; the editor keeps such a draft, and shows what is wrong. */
export type DraftProblem = 'sameLabels' | 'nowhere' | 'loose' | 'manyStarts' | 'noStart';

/** What the author can do about a problem of a node, after its name. */
export const PROBLEM_HINT: Readonly<Record<DraftProblem, string>> = {
  sameLabels: 'Hráči tlačítka nerozliší. Přepište v detailu text jedné z voleb.',
  nowhere:
    'Volba vede na id, které v konceptu není, nejspíš po ruční úpravě souboru. Smažte ji v detailu a přidejte znovu.',
  loose: 'Do uzlu nevede žádná volba a není to začátek. Přetáhněte do něj šipku, nebo ho smažte.',
  manyStarts: 'Začátek vede do víc uzlů. Nechte jen jednu šipku ze začátku.',
  noStart: 'Přetáhněte šipku ze začátku na uzel, kde příběh začíná.',
};

/** How a problem is named to the author. */
export const PROBLEM_TEXT: Readonly<Record<DraftProblem, string>> = {
  sameLabels: 'Volby se stejným textem',
  nowhere: 'Volba nikam nevede',
  loose: 'Nic sem nevede',
  manyStarts: 'Víc začátků',
  noStart: 'Příběh nemá začátek',
};

/** A node with what is wrong with it; without a node, what is wrong with the whole draft. */
export interface NodeProblems {
  readonly id: string | undefined;
  readonly problems: readonly DraftProblem[];
}

/**
 * The nodes with something wrong, in the order of the nodes: choices of the same text, no way in
 * and not the start, or a start besides another one. A draft with no start at all comes first,
 * without a node.
 */
export const draftProblems = (draft: Draft): readonly NodeProblems[] => {
  const starts = new Set(startsOf(draft).map((node) => node.id));
  const loose = new Set(
    rootsOf(draft).flatMap((node) => {
      return starts.has(node.id) ? [] : [node.id];
    }),
  );
  const ids = new Set(draft.nodes.map((node) => node.id));
  const nodes = draft.nodes.flatMap((node) => {
    const problems: DraftProblem[] = [];
    if (sameLabelChoices(node.choices).size > 0) {
      problems.push('sameLabels');
    }

    if (
      node.choices.some((choice) => {
        return !ids.has(choice.to);
      })
    ) {
      problems.push('nowhere');
    }

    if (loose.has(node.id)) {
      problems.push('loose');
    }

    if (starts.size > 1 && starts.has(node.id)) {
      problems.push('manyStarts');
    }

    if (problems.length === 0) {
      return [];
    }

    return [{ id: node.id, problems }];
  });
  if (starts.size === 0 && draft.nodes.length > 0) {
    return [{ id: undefined, problems: ['noStart'] }, ...nodes];
  }

  return nodes;
};

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
 * How many steps the walk through the ways takes at most: a draft of many choices back and forth
 * has ways without number, and they are counted again with each change of its text.
 */
const WALK_LIMIT = 50_000;

/**
 * How long the ways from the starts to the node `end` are, each node at most once on a way, so a
 * choice back does not make a way endless. A way is a run of nodes: choices leading to the same
 * node make one way, not one each. `undefined` when no start leads there.
 */
export const routesTo = (draft: Draft, end: string): RoutesToEnd | undefined => {
  const nodes = new Map(draft.nodes.map((node) => [node.id, node]));
  // Only the nodes the end can be reached from are worth walking through, each with the fewest
  // choices to the end from it, so the walk takes the near ways first.
  const distance = new Map([[end, 0]]);
  for (let grown = true; grown;) {
    grown = false;
    for (const node of draft.nodes) {
      const near = Math.min(
        ...node.choices.map((choice) => {
          return distance.get(choice.to) ?? Number.POSITIVE_INFINITY;
        }),
      );
      if (near + 1 < (distance.get(node.id) ?? Number.POSITIVE_INFINITY)) {
        distance.set(node.id, near + 1);
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
  let walked = 0;
  const walk = (node: DraftNode, on: ReadonlySet<string>, length: number, text: number) => {
    walked += 1;
    if (steps.length >= ROUTE_LIMIT || walked > WALK_LIMIT) {
      return;
    }

    if (node.id === end) {
      steps.push(length);
      texts.push(text);
      return;
    }

    // Two choices to one node make one way: a way is the nodes the players read, not the
    // buttons they pressed.
    const targets = [...new Set(node.choices.map((choice) => choice.to))].toSorted(
      (left, right) =>
        (distance.get(left) ?? Number.POSITIVE_INFINITY) -
        (distance.get(right) ?? Number.POSITIVE_INFINITY),
    );
    for (const to of targets) {
      const next = nodes.get(to);
      if (next !== undefined && distance.has(next.id) && !on.has(next.id)) {
        walk(next, new Set([...on, next.id]), length + 1, text + characters(next));
      }
    }
  };

  // Only from the starts: a loose node is no beginning of the story.
  for (const start of startsOf(draft)) {
    if (distance.has(start.id)) {
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

/**
 * Words Mermaid reads as its own at the start of a line; a node with such an id gets `_` added,
 * so the diagram still reads.
 */
const MERMAID_WORDS: ReadonlySet<string> = new Set([
  'end',
  'graph',
  'subgraph',
  'flowchart',
  'direction',
  'style',
  'class',
  'classdef',
  'click',
  'linkstyle',
  'default',
]);

const mermaidId = (id: string) => (MERMAID_WORDS.has(id) ? `${id}_` : id);

/** A text in a Mermaid label's quotes: its own quotes and brackets as entities, on one line. */
const mermaidText = (text: string) =>
  text
    .replaceAll('"', '#quot;')
    .replaceAll('<', '#lt;')
    .replaceAll('>', '#gt;')
    .replaceAll(/\s+/g, ' ')
    .trim();

/** Id of the start in the diagram, which no node id can be: node ids do not start with `_`. */
const MERMAID_START = '_start';

/** How much of each node a Mermaid diagram shows. */
export type MermaidDetail = 'summaries' | 'full';

/**
 * A node's label in the diagram: its summary, or its id without one; with `full` detail also its
 * note in italics and the text of its segments, each segment a paragraph of its own.
 */
const mermaidLabel = (node: DraftNode, detail: MermaidDetail) => {
  const summary = mermaidText(node.summary.trim() === '' ? node.id : node.summary);
  if (detail === 'summaries') {
    return summary;
  }

  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => mermaidText(line))
      .join('<br>');
  return [
    `<b>${summary}</b>`,
    ...(node.note === undefined ? [] : [`<i>${lines(node.note)}</i>`]),
    ...node.segments.flatMap((segment) => {
      return segment.text.trim() === '' ? [] : [lines(segment.text.trim())];
    }),
  ].join('<br><br>');
};

/**
 * The shape of the story as a Mermaid flowchart, top to bottom: the start, the nodes and the
 * choices by their texts. A node shows its summary, or its id without one; with `full` detail
 * also its note and the text of its segments.
 */
export const toMermaid = (draft: Draft, detail: MermaidDetail = 'summaries'): string => {
  const ids = new Set(draft.nodes.map((node) => node.id));
  const starts = startsOf(draft);
  return [
    'flowchart TD',
    ...(starts.length > 0 ? [`  ${MERMAID_START}([Začátek])`] : []),
    ...draft.nodes.map((node) => `  ${mermaidId(node.id)}["${mermaidLabel(node, detail)}"]`),
    ...starts.map((node) => `  ${MERMAID_START} --> ${mermaidId(node.id)}`),
    ...draft.nodes.flatMap((node) =>
      node.choices.flatMap((choice) => {
        if (!ids.has(choice.to)) {
          return [];
        }

        const label = mermaidText(choice.label === '' ? NEXT_LABEL : choice.label);
        return [`  ${mermaidId(node.id)} -->|"${label}"| ${mermaidId(choice.to)}`];
      }),
    ),
  ].join('\n');
};
