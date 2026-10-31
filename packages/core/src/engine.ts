import {
  dedent,
  isCheckpoint,
  type Block,
  type Choice,
  type Story,
  type StoryNode,
  type Theme,
} from './story.ts';
import type { NodeType, State, Value } from './types.ts';

/** Where a team is in the story and what it has done so far. */
export interface Position {
  readonly node: string;
  readonly state: State;
  /** Checkpoints of the current node already unlocked by scanning. */
  readonly checkpoints: number;
}

export interface RenderedChoice {
  /** Index into the node's `choices`; sent back by the client when choosing. */
  readonly index: number;
  readonly label: string;
}

export interface RenderedScreen {
  readonly theme: Theme;
  readonly content: string;
  readonly checkpoint?: { readonly location: number; readonly unlocked: boolean };
}

/** A node resolved for one team: blocks evaluated, locked screens and hidden choices removed. */
export interface RenderedNode {
  readonly id: string;
  readonly type: NodeType;
  /** Ends with the first locked checkpoint, if there is one. */
  readonly screens: readonly RenderedScreen[];
  /** Empty for `end` nodes and while a checkpoint is locked. */
  readonly choices: readonly RenderedChoice[];
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

export const nodeType = (node: AnyNode): NodeType =>
  node.end === true ? 'end' : node.initialState === undefined ? 'passage' : 'start';

export const blocksOf = (node: AnyNode, state: State): Block[] =>
  (typeof node.blocks === 'function' ? node.blocks(state) : node.blocks).filter(
    (block): block is Block => block !== false && block !== null && block !== undefined,
  );

const checkpointsOf = (node: AnyNode, state: State) => blocksOf(node, state).filter(isCheckpoint);

const choicesOf = (node: AnyNode): readonly AnyChoice[] => node.choices ?? [];

export const startPosition = (story: Story, startNode: string): Position | undefined => {
  const node = story.nodes[startNode];
  return node?.initialState === undefined
    ? undefined
    : { node: startNode, state: node.initialState, checkpoints: 0 };
};

export const availableChoices = (
  node: AnyNode,
  state: State,
): { choice: AnyChoice; index: number }[] =>
  choicesOf(node).flatMap((choice, index) =>
    choice.when === undefined || choice.when(state) ? [{ choice, index }] : [],
  );

export const renderNode = (story: Story, position: Position): RenderedNode | undefined => {
  const node = story.nodes[position.node];
  if (node === undefined) return undefined;
  const screens: RenderedScreen[] = [];
  let seen = 0;
  for (const block of blocksOf(node, position.state)) {
    if (typeof block === 'string') {
      screens.push({ theme: 'default', content: dedent(block) });
      continue;
    }
    const screen = { theme: block.theme ?? 'default', content: dedent(block.content) };
    if (!isCheckpoint(block)) {
      screens.push(screen);
      continue;
    }
    const unlocked = seen < position.checkpoints;
    seen++;
    screens.push({ ...screen, checkpoint: { location: block.location, unlocked } });
    if (!unlocked) break;
  }
  const locked = screens.at(-1)?.checkpoint?.unlocked === false;
  return {
    id: position.node,
    type: nodeType(node),
    screens,
    choices: locked
      ? []
      : availableChoices(node, position.state).map(({ choice, index }) => ({
          index,
          label: choice.label,
        })),
  };
};

export const applyChoice = (story: Story, position: Position, index: number): MoveResult => {
  const node = story.nodes[position.node];
  if (node === undefined) return { ok: false, error: 'unknown-node' };
  if (node.end === true) return { ok: false, error: 'finished' };
  if (checkpointsOf(node, position.state).length > position.checkpoints)
    return { ok: false, error: 'scan-required' };
  const available = availableChoices(node, position.state).find((c) => c.index === index);
  if (available === undefined) return { ok: false, error: 'unavailable-choice' };
  const { goto, nextState } = available.choice;
  if (!Object.hasOwn(story.nodes, goto)) return { ok: false, error: 'missing-target' };
  const state: Record<string, Value> = { ...position.state };
  for (const [key, value] of Object.entries(nextState?.(position.state) ?? {}))
    if (value !== undefined) state[key] = value;
  return { ok: true, position: { node: goto, state, checkpoints: 0 } };
};

/** Unlocks the next checkpoint of the node when its location was scanned. */
export const applyScan = (story: Story, position: Position, location: number): MoveResult => {
  const node = story.nodes[position.node];
  if (node === undefined) return { ok: false, error: 'unknown-node' };
  if (node.end === true) return { ok: false, error: 'finished' };
  const next = checkpointsOf(node, position.state)[position.checkpoints];
  if (next === undefined) return { ok: false, error: 'no-scan' };
  if (next.location !== location) return { ok: false, error: 'wrong-location' };
  return { ok: true, position: { ...position, checkpoints: position.checkpoints + 1 } };
};
