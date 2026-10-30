import { evaluate } from './expr.ts'
import { renderTemplate } from './template.ts'
import type { Choice, GameGraph, GameNode, NodeType, State, StateChange, Value } from './types.ts'

/** Where a team is in the story and what it has done so far. */
export interface Position {
  readonly node: string
  readonly state: State
}

export interface RenderedChoice {
  /** Index into `GameNode.choices`; sent back by the client when choosing. */
  readonly index: number
  readonly label: string
}

/** A node resolved for one team: conditions evaluated, hidden choices removed. */
export interface RenderedNode {
  readonly id: string
  readonly type: NodeType
  readonly theme: string | undefined
  readonly markdown: string
  /** Empty for `end` nodes and for nodes left by scanning. */
  readonly choices: readonly RenderedChoice[]
  /** Location to scan when the node is left by scanning. */
  readonly scan: number | undefined
}

export type MoveError =
  | 'unknown-node'
  | 'finished'
  | 'scan-required'
  | 'no-scan'
  | 'unavailable-choice'
  | 'wrong-location'
  | 'missing-target'

export type MoveResult =
  | { readonly ok: true; readonly position: Position; readonly choice: Choice }
  | { readonly ok: false; readonly error: MoveError }

export const applyChanges = (state: State, changes: readonly StateChange[]): State => {
  const next: Record<string, Value> = { ...state }
  for (const change of changes) {
    if (change.op === 'set') next[change.variable] = change.value
    else {
      const current = next[change.variable]
      next[change.variable] = (typeof current === 'number' ? current : 0) + Number(change.value)
    }
  }
  return next
}

export const startPosition = (graph: GameGraph, startNode: string): Position | undefined => {
  const node = graph.nodes[startNode]
  return node === undefined ? undefined : { node: node.id, state: node.initialState }
}

export const availableChoices = (
  node: GameNode,
  state: State,
): { choice: Choice; index: number }[] =>
  node.type === 'end'
    ? []
    : node.choices.flatMap((choice, index) =>
        choice.condition === undefined || evaluate(choice.condition, state)
          ? [{ choice, index }]
          : [],
      )

export const renderNode = (graph: GameGraph, position: Position): RenderedNode | undefined => {
  const node = graph.nodes[position.node]
  if (node === undefined) return undefined
  return {
    id: node.id,
    type: node.type,
    theme: node.theme,
    markdown: renderTemplate(node.body, position.state).trim(),
    choices:
      node.scan === undefined
        ? availableChoices(node, position.state).map(({ choice, index }) => ({
            index,
            label: choice.label,
          }))
        : [],
    scan: node.type === 'end' ? undefined : node.scan,
  }
}

const move = (graph: GameGraph, position: Position, choice: Choice): MoveResult =>
  Object.hasOwn(graph.nodes, choice.target)
    ? {
        ok: true,
        choice,
        position: { node: choice.target, state: applyChanges(position.state, choice.changes) },
      }
    : { ok: false, error: 'missing-target' }

export const applyChoice = (graph: GameGraph, position: Position, index: number): MoveResult => {
  const node = graph.nodes[position.node]
  if (node === undefined) return { ok: false, error: 'unknown-node' }
  if (node.type === 'end') return { ok: false, error: 'finished' }
  if (node.scan !== undefined) return { ok: false, error: 'scan-required' }
  const available = availableChoices(node, position.state).find((c) => c.index === index)
  return available === undefined
    ? { ok: false, error: 'unavailable-choice' }
    : move(graph, position, available.choice)
}

/** Leaves a `scan` node through its first available choice when the right location was scanned. */
export const applyScan = (graph: GameGraph, position: Position, location: number): MoveResult => {
  const node = graph.nodes[position.node]
  if (node === undefined) return { ok: false, error: 'unknown-node' }
  if (node.type === 'end') return { ok: false, error: 'finished' }
  if (node.scan === undefined) return { ok: false, error: 'no-scan' }
  if (node.scan !== location) return { ok: false, error: 'wrong-location' }
  const first = availableChoices(node, position.state)[0]
  return first === undefined
    ? { ok: false, error: 'unavailable-choice' }
    : move(graph, position, first.choice)
}
