import { mergeState, nodeType, screensOf, startNode } from './engine.ts';
import type { Story, StoryNode } from './story.ts';
import type { NodeType, State } from './types.ts';

export interface GraphChoice {
  /** Button text, or `Místo N` for a QR choice. */
  readonly label: string;
  /** Set on QR choices: the location whose code takes the choice. */
  readonly location?: number;
  readonly target: string;
  /** The choice has a `when` and may be hidden. */
  readonly conditional: boolean;
  /** Whether the choice is offered in the node's preview state; unknown without one. */
  readonly available?: boolean;
}

export interface NodePreview {
  /** State the team has on arrival, along the first path from the start. */
  readonly state?: State;
  /** First screen, markdown. */
  readonly content: string;
  readonly screens: number;
}

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  /** `blocks` is a function of the state. */
  readonly dynamic: boolean;
  /** Reachable from the start. */
  readonly reached: boolean;
  /** Missing for dynamic nodes the start never reaches, or when the blocks throw. */
  readonly preview?: NodePreview;
  readonly choices: readonly GraphChoice[];
}

/** The shape of a story: serializable, for the admin. */
export interface GameGraph {
  /** Node ids in definition order. */
  readonly order: readonly string[];
  /** The node every team starts at; the previews are computed from it. */
  readonly start?: string;
  readonly nodes: Readonly<Record<string, GraphNode>>;
}

type AnyNode = StoryNode<State, string>;

/** Buttons and QR choices of a node, in definition order, as one list of edges. */
const transitionsOf = (story: Story, node: AnyNode) => [
  ...(node.choices ?? []).map((choice) => ({ ...choice, location: undefined })),
  ...(node.scans ?? []).map((scan) => ({
    ...scan,
    // QR edges are labelled with the place, the team never sees a label for them.
    label: story.locations.find((l) => l.id === scan.location)?.name ?? `Místo ${scan.location}`,
    location: scan.location,
  })),
];

/** State on arrival at every node reachable from `start`, along the shortest path. */
const arrivalStates = (story: Story, start: string): Map<string, State> => {
  const states = new Map<string, State>();
  const initial = story.nodes[start]?.initialState;
  if (initial === undefined) return states;
  states.set(start, initial);
  const queue = [start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const state = states.get(id)!;
    for (const choice of transitionsOf(story, story.nodes[id]!)) {
      if (states.has(choice.goto) || !Object.hasOwn(story.nodes, choice.goto)) continue;
      states.set(choice.goto, mergeState(state, choice.nextState?.(state)));
      queue.push(choice.goto);
    }
  }
  return states;
};

const previewOf = (node: AnyNode, state: State | undefined): NodePreview | undefined => {
  if (typeof node.blocks === 'function' && state === undefined) return undefined;
  try {
    const screens = screensOf(node, state ?? {});
    return {
      ...(state === undefined ? {} : { state }),
      content: screens[0]?.content ?? '',
      screens: screens.length,
    };
  } catch {
    return undefined;
  }
};

/** Graph with previews computed from the start. */
export const toGraph = (story: Story): GameGraph => {
  const from = startNode(story);
  const states = from === undefined ? new Map<string, State>() : arrivalStates(story, from);
  return {
    order: story.order,
    ...(from === undefined ? {} : { start: from }),
    nodes: Object.fromEntries(
      story.order.map((id) => {
        const node = story.nodes[id]!;
        const state = states.get(id);
        const preview = previewOf(node, state);
        const graphNode: GraphNode = {
          id,
          type: nodeType(node),
          dynamic: typeof node.blocks === 'function',
          reached: state !== undefined,
          ...(preview === undefined ? {} : { preview }),
          choices: transitionsOf(story, node).map((choice) => ({
            label: choice.label,
            ...(choice.location === undefined ? {} : { location: choice.location }),
            target: choice.goto,
            conditional: choice.when !== undefined,
            ...(state === undefined || choice.when === undefined
              ? {}
              : { available: choice.when(state) }),
          })),
        };
        return [id, graphNode];
      }),
    ),
  };
};

/** Structural mistakes the type checker cannot see. */
export const graphProblems = (graph: GameGraph): string[] => {
  const starts = graph.order.filter((id) => graph.nodes[id]!.type === 'start');
  if (starts.length === 0) return ['Příběh nemá start (uzel s initialState).'];
  const reached = new Set(starts);
  const queue = [...starts];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const { target } of graph.nodes[id]?.choices ?? []) {
      if (reached.has(target)) continue;
      reached.add(target);
      queue.push(target);
    }
  }
  return [
    ...(starts.length > 1
      ? [`Příběh má víc startů (${starts.join(', ')}), smí mít jen jeden.`]
      : []),
    ...graph.order.flatMap((id) =>
      graph.nodes[id]!.choices.flatMap(({ target }) =>
        Object.hasOwn(graph.nodes, target) ? [] : [`Uzel ${id} vede na neexistující ${target}.`],
      ),
    ),
    ...graph.order.flatMap((id) =>
      reached.has(id) ? [] : [`Uzel ${id} je nedosažitelný ze startu.`],
    ),
  ];
};
