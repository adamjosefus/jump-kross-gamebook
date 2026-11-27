import {
  availableChoices,
  availableScans,
  mergeState,
  nodeType,
  sampleTeam,
  segmentsOf,
  startNode,
  stateKey,
} from './engine.ts';
import {
  choiceName,
  type AnyNode,
  type Chapter,
  type Choice,
  type ScanChoice,
  type Story,
  type Team,
} from './story.ts';
import type { NodeType, State } from './types.ts';

export interface GraphChoice {
  /** Button text, or the code's name for a QR choice. */
  readonly label: string;
  /** Set on QR choices: the number of the code that takes the choice. */
  readonly code?: number;
  readonly target: string;
  /** The choice comes from a `choices` or `scans` function, so not every state offers it. */
  readonly conditional: boolean;
  /**
   * For a choice from a function: whether the function offers it to any team in the node's preview
   * state; unknown without one. A fixed choice is always offered.
   */
  readonly available?: boolean;
}

export interface NodePreview {
  /** State the team has on arrival, along the first path from the start. */
  readonly state?: State;
  /** Text of every segment, markdown; empty for a segment with only a picture. */
  readonly segments: readonly string[];
}

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  /** `segments` is a function of the state. */
  readonly dynamic: boolean;
  /** Reachable from the start. */
  readonly reached: boolean;
  /** The chapter the node belongs to, by id. */
  readonly chapter?: string;
  /** Missing for dynamic nodes the start never reaches, or when the segments throw. */
  readonly preview?: NodePreview;
  readonly choices: readonly GraphChoice[];
}

/** The shape of a story: serializable, for the admin. */
export interface GameGraph {
  /** The node anyone sees before scanning a team's code; the login leads from it to the start. */
  readonly introNode: string;
  /** The node the game ends at. */
  readonly outroNode: string;
  /** Node ids in definition order. */
  readonly order: readonly string[];
  /** The node every team starts at; the previews are computed from it. */
  readonly start?: string;
  readonly nodes: Readonly<Record<string, GraphNode>>;
  /** In definition order, with whether their time counts towards the result. */
  readonly chapters: readonly Chapter[];
}

/** A button or a QR choice as an edge of the graph; `code` is set for a QR choice. */
interface Edge {
  readonly label: string;
  readonly code: number | undefined;
  readonly goto: string;
  readonly nextState?: (state: State) => Partial<State>;
}

/** QR edges are labelled with the code's name, the team never sees a label for them. */
const scanEdge = (story: Story, scan: ScanChoice<State, string>): Edge => ({
  ...scan,
  label: story.codes.find((qrCode) => qrCode.id === scan.code)?.name ?? `Kód ${scan.code}`,
  code: scan.code,
});

const choiceEdge = (choice: Choice<State, string>): Edge => ({
  ...choice,
  label: choiceName(choice),
  code: undefined,
});

/** Fixed buttons and QR choices of a node, in definition order, as one list of edges. */
const transitionsOf = (story: Story, node: AnyNode): readonly Edge[] => [
  ...(typeof node.choices === 'function' ? [] : (node.choices ?? [])).map(choiceEdge),
  ...(typeof node.scans === 'function' ? [] : (node.scans ?? [])).map((scan) =>
    scanEdge(story, scan),
  ),
];

/** Upper bound on explored (node, state) pairs; stories with counters could otherwise explode. */
const MAX_VISITS = 10_000;

/**
 * Edges a `choices` or `scans` function gives in `state`, for every team, each with its position
 * in the list; none when it throws, the validation reports that.
 */
const edgesFromFunction = (
  story: Story,
  node: AnyNode,
  state: State,
  teams: readonly Team[],
): readonly { readonly edge: Edge; readonly index: number }[] =>
  teams.flatMap((team) => {
    try {
      return [
        ...(typeof node.choices === 'function'
          ? availableChoices(node, state, team).map(({ choice, index }) => ({
              edge: choiceEdge(choice),
              index,
            }))
          : []),
        ...(typeof node.scans === 'function'
          ? availableScans(node, state, team).map(({ scan, index }) => ({
              edge: scanEdge(story, scan),
              index,
            }))
          : []),
      ];
    } catch {
      return [];
    }
  });

/**
 * One edge per kind, position, code and target, so a label with the team's name draws one edge but
 * two codes leading to the same node stay two.
 */
const edgeKey = (edge: Edge, index: number) =>
  JSON.stringify([
    edge.code === undefined ? 'choice' : 'scan',
    index,
    edge.code ?? null,
    edge.goto,
  ]);

interface Exploration {
  /** State on arrival at every reachable node, along the shortest path. */
  readonly states: ReadonlyMap<string, State>;
  /** Edges of `choices` and `scans` functions per node, over all states and teams, by `edgeKey`. */
  readonly edges: ReadonlyMap<string, ReadonlyMap<string, Edge>>;
}

/**
 * Walks the (node, state) pairs reachable from `start`, because what a `choices` or `scans`
 * function gives can depend on the state.
 */
const explore = (story: Story, start: string, teams: readonly Team[]): Exploration => {
  const initial = story.nodes[start]?.initialState;
  if (initial === undefined) return { states: new Map(), edges: new Map() };
  // Breadth-first search: the maps, the set and the queue are filled in place, an immutable version
  // would copy them on every step.
  const states = new Map([[start, initial]]);
  const edges = new Map<string, Map<string, Edge>>();
  const queue = [{ node: start, state: initial }];
  const seen = new Set([JSON.stringify([start, stateKey(initial)])]);
  // for...of reads the array's length on every step, so pairs pushed while iterating are visited too.
  for (const [visited, { node: id, state }] of queue.entries()) {
    if (visited >= MAX_VISITS) break;
    const node = story.nodes[id]!;
    const fromFunction = edgesFromFunction(story, node, state, teams);
    for (const { edge, index } of fromFunction) {
      const known = edges.get(id) ?? new Map<string, Edge>();
      const key = edgeKey(edge, index);
      if (!known.has(key)) known.set(key, edge);
      edges.set(id, known);
    }
    const transitions = [...transitionsOf(story, node), ...fromFunction.map(({ edge }) => edge)];
    for (const { goto, nextState } of transitions) {
      if (!Object.hasOwn(story.nodes, goto)) continue;
      let next: State;
      try {
        next = mergeState(state, nextState?.(state));
      } catch {
        continue;
      }
      if (!states.has(goto)) states.set(goto, next);
      const key = JSON.stringify([goto, stateKey(next)]);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ node: goto, state: next });
    }
  }
  return { states, edges };
};

const previewOf = (
  node: AnyNode,
  state: State | undefined,
  team: Team,
): NodePreview | undefined => {
  if (typeof node.segments === 'function' && state === undefined) return undefined;
  try {
    const segments = segmentsOf(node, state ?? {}, team);
    return {
      ...(state === undefined ? {} : { state }),
      segments: segments.map((segment) => segment.content),
    };
  } catch {
    return undefined;
  }
};

/** Graph with previews computed from the start. */
export const toGraph = (story: Story): GameGraph => {
  const from = startNode(story);
  const teams = story.teams.length === 0 ? [sampleTeam(story)] : story.teams;
  const explored =
    from === undefined
      ? { states: new Map<string, State>(), edges: new Map<string, never>() }
      : explore(story, from, teams);
  const { states } = explored;
  return {
    introNode: story.introNode,
    outroNode: story.outroNode,
    order: story.order,
    ...(from === undefined ? {} : { start: from }),
    chapters: story.chapters,
    nodes: Object.fromEntries(
      story.order.map((id) => {
        const node = story.nodes[id]!;
        const state = states.get(id);
        const preview = previewOf(node, state, sampleTeam(story));
        const graphNode: GraphNode = {
          id,
          type: nodeType(story, id),
          dynamic: typeof node.segments === 'function',
          // Everyone sees the intro, without a state.
          reached: id === story.introNode || state !== undefined,
          ...(node.chapter === undefined ? {} : { chapter: node.chapter }),
          ...(preview === undefined ? {} : { preview }),
          choices: [
            ...transitionsOf(story, node).map((edge) => graphChoice(edge, false)),
            ...[...(explored.edges.get(id) ?? [])].map(([key, edge]) => ({
              ...graphChoice(edge, true),
              ...(state === undefined
                ? {}
                : {
                    available: edgesFromFunction(story, node, state, teams).some(
                      (offered) => edgeKey(offered.edge, offered.index) === key,
                    ),
                  }),
            })),
          ],
        };
        return [id, graphNode];
      }),
    ),
  };
};

const graphChoice = (edge: Edge, conditional: boolean): GraphChoice => ({
  label: edge.label,
  ...(edge.code === undefined ? {} : { code: edge.code }),
  target: edge.goto,
  conditional,
});

/** Structural mistakes the type checker cannot see. */
export const graphProblems = (graph: GameGraph): readonly string[] => {
  const starts = graph.order.filter((id) => graph.nodes[id]!.type === 'start');
  if (starts.length === 0) return ['Příběh nemá start (uzel s initialState).'];
  // Breadth-first search: the set and the queue are filled in place, an immutable version would
  // copy both on every step.
  const reached = new Set(starts);
  const queue = [...starts];
  // for...of reads the array's length on every step, so ids pushed while iterating are visited too.
  for (const id of queue) {
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
      reached.has(id) || id === graph.introNode ? [] : [`Uzel ${id} je nedosažitelný ze startu.`],
    ),
  ];
};
