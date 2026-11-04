import {
  availableChoices,
  mergeState,
  nodeType,
  sampleTeam,
  screensOf,
  startNode,
  stateKey,
} from './engine.ts';
import type { AnyNode, Choice, Story, Team } from './story.ts';
import type { NodeType, State } from './types.ts';

export interface GraphChoice {
  /** Button text, or `Místo N` for a QR choice. */
  readonly label: string;
  /** Set on QR choices: the location whose code takes the choice. */
  readonly location?: number;
  readonly target: string;
  /** The choice has a `when` or comes from a `choices` function, so it may be hidden. */
  readonly conditional: boolean;
  /** Whether any team is offered the choice in the node's preview state; unknown without one. */
  readonly available?: boolean;
}

export interface NodePreview {
  /** State the team has on arrival, along the first path from the start. */
  readonly state?: State;
  /** Text of every block, markdown; empty for a block with only a picture. */
  readonly blocks: readonly string[];
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
  /** The node anyone sees before scanning a team's code; the login leads from it to the start. */
  readonly introNode: string;
  /** The node the game ends at. */
  readonly outroNode: string;
  /** Node ids in definition order. */
  readonly order: readonly string[];
  /** The node every team starts at; the previews are computed from it. */
  readonly start?: string;
  readonly nodes: Readonly<Record<string, GraphNode>>;
}

/** Fixed buttons and QR choices of a node, in definition order, as one list of edges. */
const transitionsOf = (story: Story, node: AnyNode) => [
  ...(typeof node.choices === 'function' ? [] : (node.choices ?? [])).map((choice) => ({
    ...choice,
    location: undefined,
  })),
  ...(node.scans ?? []).map((scan) => ({
    ...scan,
    // QR edges are labelled with the place, the team never sees a label for them.
    label:
      story.locations.find((location) => location.id === scan.location)?.name ??
      `Místo ${scan.location}`,
    location: scan.location,
  })),
];

/** Upper bound on explored (node, state) pairs; stories with counters could otherwise explode. */
const MAX_VISITS = 10_000;

/** Choices a `choices` function gives in `state`, for every team; none when it throws. */
const choicesFromFunction = (node: AnyNode, state: State, teams: readonly Team[]) =>
  typeof node.choices !== 'function'
    ? []
    : teams.flatMap((team) => {
        try {
          return availableChoices(node, state, team);
        } catch {
          return [];
        }
      });

interface Exploration {
  /** State on arrival at every reachable node, along the shortest path. */
  readonly states: ReadonlyMap<string, State>;
  /**
   * Choices of `choices` functions per node, over all states and teams. One edge per position and
   * target, so a label with the team's name does not draw one edge per team.
   */
  readonly choices: ReadonlyMap<string, ReadonlyMap<string, Choice<State, string>>>;
}

/**
 * Walks the (node, state) pairs reachable from `start`, because what a `choices` function gives can
 * depend on the state. Fixed choices are followed even when their `when` is false, so a preview
 * exists for every node they lead to.
 */
const explore = (story: Story, start: string, teams: readonly Team[]): Exploration => {
  const initial = story.nodes[start]?.initialState;
  if (initial === undefined) return { states: new Map(), choices: new Map() };
  // Breadth-first search: the maps, the set and the queue are filled in place, an immutable version
  // would copy them on every step.
  const states = new Map([[start, initial]]);
  const choices = new Map<string, Map<string, Choice<State, string>>>();
  const queue = [{ node: start, state: initial }];
  const seen = new Set([JSON.stringify([start, stateKey(initial)])]);
  // for...of reads the array's length on every step, so pairs pushed while iterating are visited too.
  for (const [visited, { node: id, state }] of queue.entries()) {
    if (visited >= MAX_VISITS) break;
    const node = story.nodes[id]!;
    const fromFunction = choicesFromFunction(node, state, teams);
    for (const { choice, index } of fromFunction) {
      const known = choices.get(id) ?? new Map<string, Choice<State, string>>();
      const key = JSON.stringify([index, choice.goto]);
      if (!known.has(key)) known.set(key, choice);
      choices.set(id, known);
    }
    const transitions = [
      ...transitionsOf(story, node),
      ...fromFunction.map(({ choice }) => choice),
    ];
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
  return { states, choices };
};

const previewOf = (
  node: AnyNode,
  state: State | undefined,
  team: Team,
): NodePreview | undefined => {
  if (typeof node.blocks === 'function' && state === undefined) return undefined;
  try {
    const screens = screensOf(node, state ?? {}, team);
    return {
      ...(state === undefined ? {} : { state }),
      blocks: screens.map((screen) => screen.content),
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
      ? { states: new Map<string, State>(), choices: new Map<string, never>() }
      : explore(story, from, teams);
  const { states } = explored;
  return {
    introNode: story.introNode,
    outroNode: story.outroNode,
    order: story.order,
    ...(from === undefined ? {} : { start: from }),
    nodes: Object.fromEntries(
      story.order.map((id) => {
        const node = story.nodes[id]!;
        const state = states.get(id);
        const preview = previewOf(node, state, sampleTeam(story));
        const graphNode: GraphNode = {
          id,
          type: nodeType(story, id),
          dynamic: typeof node.blocks === 'function',
          // Everyone sees the intro, without a state.
          reached: id === story.introNode || state !== undefined,
          ...(preview === undefined ? {} : { preview }),
          choices: [
            ...transitionsOf(story, node).map((choice) => ({
              label: choice.label,
              ...(choice.location === undefined ? {} : { location: choice.location }),
              target: choice.goto,
              conditional: choice.when !== undefined,
              ...(state === undefined || choice.when === undefined
                ? {}
                : { available: teams.some((team) => choice.when?.(state, team)) }),
            })),
            ...[...(explored.choices.get(id)?.values() ?? [])].map((choice) => ({
              label: choice.label,
              target: choice.goto,
              conditional: true,
            })),
          ],
        };
        return [id, graphNode];
      }),
    ),
  };
};

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
