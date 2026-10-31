import { nodeType } from './engine.ts';
import type { Story } from './story.ts';
import type { NodeType } from './types.ts';

export interface GraphChoice {
  readonly label: string;
  readonly target: string;
  /** The choice has a `when` and may be hidden. */
  readonly conditional: boolean;
}

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  readonly choices: readonly GraphChoice[];
}

/** The static shape of a story: serializable, so the admin gets it without the story's text. */
export interface GameGraph {
  /** Node ids in definition order. */
  readonly order: readonly string[];
  readonly nodes: Readonly<Record<string, GraphNode>>;
}

export const toGraph = (story: Story): GameGraph => ({
  order: story.order,
  nodes: Object.fromEntries(
    story.order.map((id) => {
      const node = story.nodes[id]!;
      return [
        id,
        {
          id,
          type: nodeType(node),
          choices: (node.choices ?? []).map((choice) => ({
            label: choice.label,
            target: choice.goto,
            conditional: choice.when !== undefined,
          })),
        },
      ];
    }),
  ),
});

/** Structural mistakes the type checker cannot see. */
export const graphProblems = (graph: GameGraph): string[] => {
  const starts = graph.order.filter((id) => graph.nodes[id]!.type === 'start');
  if (starts.length === 0) return ['Příběh nemá žádný start (uzel s initialState).'];
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
    ...graph.order.flatMap((id) =>
      graph.nodes[id]!.choices.flatMap(({ target }) =>
        Object.hasOwn(graph.nodes, target) ? [] : [`Uzel ${id} vede na neexistující ${target}.`],
      ),
    ),
    ...graph.order.flatMap((id) =>
      reached.has(id) ? [] : [`Uzel ${id} je nedosažitelný z žádného startu.`],
    ),
  ];
};
