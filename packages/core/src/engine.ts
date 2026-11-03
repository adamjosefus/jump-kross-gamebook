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
  readonly svg?: string;
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
  /** The heading of the scan screen, when the story sets one. */
  readonly scanTitle?: string;
  /** The text under that heading, when the story sets one. */
  readonly scanText?: string;
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

export const blocksOf = (node: AnyNode, state: State): readonly Block[] =>
  (typeof node.blocks === 'function' ? node.blocks(state) : node.blocks).filter(
    (block): block is Block => block !== false && block !== null && block !== undefined,
  );

/** Merges `changes` into `state`; undefined values leave the state as it is. */
export const mergeState = (state: State, changes: Partial<State> | undefined): State => ({
  ...state,
  ...Object.fromEntries(
    Object.entries(changes ?? {}).filter(
      (entry): entry is [string, Value] => entry[1] !== undefined,
    ),
  ),
});

const screenOf = (block: Block): RenderedScreen =>
  typeof block === 'string'
    ? { theme: 'default', content: dedent(block) }
    : {
        theme: block.theme ?? 'default',
        ...(block.svg === undefined ? {} : { svg: block.svg }),
        content: dedent(block.content),
      };

/** Every screen of the node with its content dedented. */
export const screensOf = (node: AnyNode, state: State): readonly RenderedScreen[] =>
  blocksOf(node, state).map(screenOf);

/** Screens shown before login. */
export const introScreens = (story: Story): readonly RenderedScreen[] => story.intro.map(screenOf);

/** The node every team starts at: the first one with `initialState`. */
export const startNode = (story: Story): string | undefined =>
  story.order.find((id) => story.nodes[id]!.initialState !== undefined);

export const startPosition = (story: Story): Position | undefined => {
  const id = startNode(story);
  const state = id === undefined ? undefined : story.nodes[id]!.initialState;
  return id === undefined || state === undefined ? undefined : { node: id, state };
};

const offered = <T extends AnyChoice | AnyScan>(transitions: readonly T[], state: State) =>
  transitions.flatMap((transition, index) =>
    transition.when === undefined || transition.when(state) ? [{ transition, index }] : [],
  );

/** Buttons offered in `state`, with their index in `choices`. */
export const availableChoices = (
  node: AnyNode,
  state: State,
): readonly { readonly choice: AnyChoice; readonly index: number }[] =>
  offered(node.choices ?? [], state).map(({ transition, index }) => ({
    choice: transition,
    index,
  }));

/** QR choices offered in `state`, with their index in `scans`. */
export const availableScans = (
  node: AnyNode,
  state: State,
): readonly { readonly scan: AnyScan; readonly index: number }[] =>
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
    ...(node.scanTitle === undefined ? {} : { scanTitle: node.scanTitle }),
    ...(node.scanText === undefined ? {} : { scanText: node.scanText }),
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
  const available = availableChoices(node, position.state).find(
    (candidate) => candidate.index === index,
  );
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
