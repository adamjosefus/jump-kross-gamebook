import {
  dedent,
  type AnyNode,
  type SegmentEntry,
  type Choice,
  type ScanChoice,
  type Story,
  type Team,
  type Theme,
} from './story.ts';
import type { NodeType, State, Value } from './types.ts';

/** Where a team is in the story and what it has done so far. */
export interface Position {
  readonly node: string;
  readonly state: State;
}

export interface RenderedChoice {
  /** Index into the node's choices for this state and team; sent back when choosing. */
  readonly index: number;
  /** Empty for the plain arrow „Další“ of a choice without a text. */
  readonly label: string;
}

export interface RenderedSegment {
  readonly theme: Theme;
  readonly svg?: string;
  readonly content: string;
  readonly next?: string;
}

/** A node resolved for one team: segments evaluated, hidden choices removed. */
export interface RenderedNode {
  readonly id: string;
  readonly type: NodeType;
  readonly segments: readonly RenderedSegment[];
  /** Buttons; empty for `end` nodes and nodes that wait for a scan. */
  readonly choices: readonly RenderedChoice[];
  /** The team moves on by scanning a QR code; where the codes lead stays hidden. */
  readonly scan: boolean;
  /** The heading of the scan screen, when the story sets one. */
  readonly scanTitle?: string;
  /** The text under that heading, when the story sets one. */
  readonly scanText?: string;
  /**
   * The node belongs to a chapter whose time is left out of the team's result: the game time
   * stands still here, and the team's screen says so.
   */
  readonly timeStops: boolean;
}

export type MoveError =
  | 'unknown-node'
  | 'finished'
  | 'scan-required'
  | 'no-scan'
  | 'unavailable-choice'
  | 'wrong-code'
  | 'missing-target';

export type MoveResult =
  | { readonly ok: true; readonly position: Position }
  | { readonly ok: false; readonly error: MoveError };

type AnyChoice = Choice<State, string>;
type AnyScan = ScanChoice<State, string>;

/** A state as a text, the same whatever order its keys are in. */
export const stateKey = (state: State) =>
  JSON.stringify(
    Object.keys(state)
      .toSorted()
      .map((key) => [key, state[key]]),
  );

export const nodeType = (story: Story, id: string): NodeType =>
  id === story.introNode
    ? 'intro'
    : id === story.outroNode
      ? 'end'
      : story.nodes[id]?.initialState === undefined
        ? 'passage'
        : 'start';

export const segmentEntriesOf = (
  node: AnyNode,
  state: State,
  team: Team,
): readonly SegmentEntry[] =>
  (typeof node.segments === 'function' ? node.segments(state, team) : node.segments).filter(
    (segment): segment is SegmentEntry =>
      segment !== false && segment !== null && segment !== undefined,
  );

/** A `choices` or `scans` function gave no list, an empty one or one with an empty item. */
export class EmptyActionsError extends Error {
  readonly list: 'choices' | 'scans';
  constructor(list: 'choices' | 'scans') {
    super(`Funkce ${list} nevrátila žádnou možnost.`);
    this.name = 'EmptyActionsError';
    this.list = list;
  }
}

/**
 * The list a node's `choices` or `scans` give for `team` in `state`; none when the node has no
 * such list. A function that gives no list, an empty one or one with an empty item breaks the
 * story's promise of a way on, so it is an error rather than a dead end.
 */
const actionsOf = <T>(
  actions: readonly T[] | ((state: State, team: Team) => readonly T[]) | undefined,
  what: 'choices' | 'scans',
  state: State,
  team: Team,
): readonly T[] => {
  if (actions === undefined) {
    return [];
  }
  const list: unknown = typeof actions === 'function' ? actions(state, team) : actions;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.some((item) => typeof item !== 'object' || item === null)
  ) {
    throw new EmptyActionsError(what);
  }
  // Checked above: a non-empty list of objects, as the story's type promises.
  return list as readonly T[];
};

/** The node's buttons for `team` in `state`. */
export const choicesOf = (node: AnyNode, state: State, team: Team): readonly AnyChoice[] =>
  actionsOf<AnyChoice>(node.choices, 'choices', state, team);

/** The node's QR choices for `team` in `state`. */
export const scansOf = (node: AnyNode, state: State, team: Team): readonly AnyScan[] =>
  actionsOf<AnyScan>(node.scans, 'scans', state, team);

/**
 * Keys of the state whose values are not a string, a boolean or a finite number. The type allows
 * nothing else, but a story written around a JSON value, or an arithmetic on a missing key, can
 * produce an object or `NaN`, which the API cannot send and a database turns into `null`.
 */
export const unsoundStateKeys = (state: State): readonly string[] =>
  Object.entries(state).flatMap(([key, value]) =>
    typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value) ? [] : [key],
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

const renderSegment = (segment: SegmentEntry): RenderedSegment =>
  typeof segment === 'string'
    ? { theme: 'default', content: dedent(segment) }
    : {
        theme: segment.theme ?? 'default',
        ...(segment.svg === undefined ? {} : { svg: segment.svg }),
        content: dedent(segment.content),
        ...(segment.next === undefined ? {} : { next: segment.next }),
      };

/** Every segment of the node with its content dedented. */
export const segmentsOf = (node: AnyNode, state: State, team: Team): readonly RenderedSegment[] =>
  segmentEntriesOf(node, state, team).map(renderSegment);

/** The team to show content with where no real one plays, as in previews and test runs. */
export const sampleTeam = (story: Story): Team => story.teams[0] ?? { id: 0, name: 'Tým' };

/** Screens shown before login: the intro node, which has no team and no state. */
export const introSegments = (story: Story): readonly RenderedSegment[] => {
  const intro = story.nodes[story.introNode];
  return intro === undefined ? [] : segmentsOf(intro, {}, sampleTeam(story));
};

/** The node every team starts at: the first one with `initialState`. */
export const startNode = (story: Story): string | undefined =>
  story.order.find((id) => story.nodes[id]!.initialState !== undefined);

export const startPosition = (story: Story): Position | undefined => {
  const id = startNode(story);
  const state = id === undefined ? undefined : story.nodes[id]!.initialState;
  return id === undefined || state === undefined ? undefined : { node: id, state };
};

/** Buttons offered to `team` in `state`, with their index in the list. */
export const availableChoices = (
  node: AnyNode,
  state: State,
  team: Team,
): readonly { readonly choice: AnyChoice; readonly index: number }[] =>
  choicesOf(node, state, team).map((choice, index) => ({ choice, index }));

/** QR choices offered to `team` in `state`, with their index in the list. */
export const availableScans = (
  node: AnyNode,
  state: State,
  team: Team,
): readonly { readonly scan: AnyScan; readonly index: number }[] =>
  scansOf(node, state, team).map((scan, index) => ({ scan, index }));

export const renderNode = (
  story: Story,
  position: Position,
  team: Team,
): RenderedNode | undefined => {
  const node = story.nodes[position.node];
  if (node === undefined) {
    return undefined;
  }
  return {
    id: position.node,
    type: nodeType(story, position.node),
    segments: segmentsOf(node, position.state, team),
    choices: availableChoices(node, position.state, team).map(({ choice, index }) => ({
      index,
      label: choice.label ?? '',
    })),
    // Evaluated like the choices, so a `scans` function that gives nothing fails here already.
    scan: scansOf(node, position.state, team).length > 0,
    ...(node.scanTitle === undefined ? {} : { scanTitle: node.scanTitle }),
    ...(node.scanText === undefined ? {} : { scanText: node.scanText }),
    timeStops: story.chapters.some((chapter) => chapter.id === node.chapter && !chapter.counts),
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

export const applyChoice = (
  story: Story,
  position: Position,
  team: Team,
  index: number,
): MoveResult => {
  const node = story.nodes[position.node];
  if (node === undefined) {
    return { ok: false, error: 'unknown-node' };
  }
  if (position.node === story.outroNode) {
    return { ok: false, error: 'finished' };
  }
  if (node.scans !== undefined) {
    return { ok: false, error: 'scan-required' };
  }
  const available = availableChoices(node, position.state, team).find(
    (candidate) => candidate.index === index,
  );
  if (available === undefined) {
    return { ok: false, error: 'unavailable-choice' };
  }
  return take(story, position, available.choice);
};

/** Takes the QR choice of the scanned code, given by its number, if the node offers one. */
export const applyScan = (
  story: Story,
  position: Position,
  team: Team,
  codeId: number,
): MoveResult => {
  const node = story.nodes[position.node];
  if (node === undefined) {
    return { ok: false, error: 'unknown-node' };
  }
  if (position.node === story.outroNode) {
    return { ok: false, error: 'finished' };
  }
  if (node.scans === undefined) {
    return { ok: false, error: 'no-scan' };
  }
  const available = availableScans(node, position.state, team).find(
    ({ scan }) => scan.code === codeId,
  );
  if (available === undefined) {
    return { ok: false, error: 'wrong-code' };
  }
  return take(story, position, available.scan);
};
