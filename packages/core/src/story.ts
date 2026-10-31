import type { State } from './types.ts';

/** Looks of one screen; the player maps each theme to its own styles. */
export const THEMES = ['default', 'intro', 'letter', 'night'] as const;
export type Theme = (typeof THEMES)[number];

/** One screen of markdown. */
export interface Screen {
  readonly theme?: Theme;
  readonly content: string;
}

/** A screen the team gets past only by scanning the QR code of `location`. */
export interface Checkpoint extends Screen {
  readonly kind: 'checkpoint';
  readonly location: number;
}

/** A plain string is a markdown screen in the default theme. */
export type Block = string | Screen | Checkpoint;

/** Falsy entries are skipped, so blocks can be written as `condition && block`. */
export type MaybeBlock = Block | false | null | undefined;

/**
 * A function of the state, checked bivariantly like a method, so a story written for a specific
 * state type is still a `Story` the engine can run with any state.
 */
type StateFn<S, R> = { fn(state: S): R }['fn'];

export interface Choice<S, K extends string> {
  readonly label: string;
  readonly goto: K;
  /** The choice is offered only when this returns true. */
  readonly when?: StateFn<S, boolean>;
  /** Merged into the state when the choice is taken. */
  readonly nextState?: StateFn<S, Partial<S>>;
}

interface NodeBase<S> {
  /** Makes the node a start; teams starting here begin with this state. */
  readonly initialState?: S;
  /** Evaluated once per render; the state does not change while a node is shown. */
  readonly blocks: readonly MaybeBlock[] | StateFn<S, readonly MaybeBlock[]>;
}

export type StoryNode<S, K extends string> =
  | (NodeBase<S> & { readonly end: true; readonly choices?: never })
  | (NodeBase<S> & {
      readonly end?: false;
      readonly choices: readonly [Choice<S, K>, ...Choice<S, K>[]];
    });

export interface Story {
  /** Node ids in definition order. */
  readonly order: readonly string[];
  readonly nodes: Readonly<Record<string, StoryNode<State, string>>>;
}

/**
 * Defines the story. The first call fixes the state type, the second infers the node ids, so a
 * `goto` to a missing node is a type error.
 *
 * ```ts
 * defineStory<{ gold: number }>()({ A: { initialState: { gold: 0 }, blocks: ['…'], choices: [{ label: 'Dál', goto: 'B' }] }, B: { end: true, blocks: ['Konec'] } })
 * ```
 */
export const defineStory =
  <S extends State>() =>
  <K extends string>(nodes: Record<K, StoryNode<S, NoInfer<K>>>): Story => ({
    order: Object.keys(nodes),
    nodes,
  });

export const checkpoint = (location: number, screen: string | Screen): Checkpoint =>
  typeof screen === 'string'
    ? { kind: 'checkpoint', location, content: screen }
    : { ...screen, kind: 'checkpoint', location };

export const isCheckpoint = (block: Block): block is Checkpoint =>
  typeof block !== 'string' && 'kind' in block;

/** Strips the indentation common to all lines, so content can be indented with the code. */
export const dedent = (text: string): string => {
  const lines = text
    .replace(/^[ \t]*\n/, '')
    .trimEnd()
    .split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^[ \t]*/.exec(line)![0].length);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(indent)).join('\n');
};
