import {
  dedent,
  type Block,
  type Choice,
  type ScanChoice,
  type Story,
  type StoryNode,
  type Theme,
} from './story.ts';
import type { NodeType, State, Value } from './types.ts';

/** Where a team is in the story and what it has done so far. */
export interface Position {
  readonly node: string;
  readonly state: State;
}

export interface RenderedChoice {
  /** Index into the node's `choices`; sent back by the client when choosing. */
  readonly index: number;
  readonly label: string;
}

export interface RenderedScreen {
  readonly theme: Theme;
  readonly content: string;
}

/** A node resolved for one team: blocks evaluated, hidden choices removed. */
export interface RenderedNode {
  readonly id: string;
  readonly type: NodeType;
  readonly screens: readonly RenderedScreen[];
  /** Buttons; empty for `end` nodes and nodes that wait for a scan. */
  readonly choices: readonly RenderedChoice[];
  /** The team moves on by scanning a QR code; where the codes lead stays hidden. */
  readonly scan: boolean;
}

export type MoveError =
  | 'unknown-node'
  | 'finished'
  | 'scan-required'
  | 'no-scan'
  | 'unavailable-choice'
  | 'wrong-location'
  | 'missing-target';

export type MoveResult =
  | { readonly ok: true; readonly position: Position }
  | { readonly ok: false; readonly error: MoveError };

type AnyNode = StoryNode<State, string>;
type AnyChoice = Choice<State, string>;
type AnyScan = ScanChoice<State, string>;

export const nodeType = (node: AnyNode): NodeType =>
  node.end === true ? 'end' : node.initialState === undefined ? 'passage' : 'start';

export const blocksOf = (node: AnyNode, state: State): Block[] =>
  (typeof node.blocks === 'function' ? node.blocks(state) : node.blocks).filter(
    (block): block is Block => block !== false && block !== null && block !== undefined,
  );

export const mergeState = (state: State, changes: Partial<State> | undefined): State => {
  const next: Record<string, Value> = { ...state };
  for (const [key, value] of Object.entries(changes ?? {}))
    if (value !== undefined) next[key] = value;
  return next;
};

/** Every screen of the node with its content dedented. */
export const screensOf = (node: AnyNode, state: State): RenderedScreen[] =>
  blocksOf(node, state).map((block) =>
    typeof block === 'string'
      ? { theme: 'default', content: dedent(block) }
      : { theme: block.theme ?? 'default', content: dedent(block.content) },
  );

export const startPosition = (story: Story, startNode: string): Position | undefined => {
  const node = story.nodes[startNode];
  return node?.initialState === undefined
    ? undefined
    : { node: startNode, state: node.initialState };
};

const offered = <T extends AnyChoice | AnyScan>(transitions: readonly T[], state: State) =>
  transitions.flatMap((transition, index) =>
    transition.when === undefined || transition.when(state) ? [{ transition, index }] : [],
  );

/** Buttons offered in `state`, with their index in `choices`. */
export const availableChoices = (
  node: AnyNode,
  state: State,
): { choice: AnyChoice; index: number }[] =>
  offered(node.choices ?? [], state).map(({ transition, index }) => ({
    choice: transition,
    index,
  }));

/** QR choices offered in `state`, with their index in `scans`. */
export const availableScans = (node: AnyNode, state: State): { scan: AnyScan; index: number }[] =>
  offered(node.scans ?? [], state).map(({ transition, index }) => ({ scan: transition, index }));

export const renderNode = (story: Story, position: Position): RenderedNode | undefined => {
  const node = story.nodes[position.node];
  if (node === undefined) return undefined;
  return {
    id: position.node,
    type: nodeType(node),
    screens: screensOf(node, position.state),
    choices: availableChoices(node, position.state).map(({ choice, index }) => ({
      index,
      label: choice.label,
    })),
    scan: node.scans !== undefined,
  };
};

const take = (
  story: Story,
  position: Position,
  { goto, nextState }: AnyChoice | AnyScan,
): MoveResult =>
  Object.hasOwn(story.nodes, goto)
    ? {
        ok: true,
        position: { node: goto, state: mergeState(position.state, nextState?.(position.state)) },
      }
    : { ok: false, error: 'missing-target' };

export const applyChoice = (story: Story, position: Position, index: number): MoveResult => {
  const node = story.nodes[position.node];
  if (node === undefined) return { ok: false, error: 'unknown-node' };
  if (node.end === true) return { ok: false, error: 'finished' };
  if (node.scans !== undefined) return { ok: false, error: 'scan-required' };
  const available = availableChoices(node, position.state).find((c) => c.index === index);
  if (available === undefined) return { ok: false, error: 'unavailable-choice' };
  return take(story, position, available.choice);
};

/** Takes the QR choice of the scanned location, if the node offers one. */
export const applyScan = (story: Story, position: Position, location: number): MoveResult => {
  const node = story.nodes[position.node];
  if (node === undefined) return { ok: false, error: 'unknown-node' };
  if (node.end === true) return { ok: false, error: 'finished' };
  if (node.scans === undefined) return { ok: false, error: 'no-scan' };
  const available = availableScans(node, position.state).find(
    ({ scan }) => scan.location === location,
  );
  if (available === undefined) return { ok: false, error: 'wrong-location' };
  return take(story, position, available.scan);
};
