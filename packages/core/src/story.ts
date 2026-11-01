import type { State } from './types.ts';

/** Looks of one screen; the player maps each theme to its own styles. */
export const THEMES = ['default', 'intro', 'letter', 'night'] as const;
export type Theme = (typeof THEMES)[number];

/** One screen of markdown. */
export interface Screen {
  readonly theme?: Theme;
  readonly content: string;
}

/** A plain string is a markdown screen in the default theme. */
export type Block = string | Screen;

/** Falsy entries are skipped, so blocks can be written as `condition && block`. */
export type MaybeBlock = Block | false | null | undefined;

/**
 * A function of the state, checked bivariantly like a method, so a story written for a specific
 * state type is still a `Story` the engine can run with any state.
 */
type StateFn<S, R> = { fn(state: S): R }['fn'];

interface Transition<S, K extends string> {
  readonly goto: K;
  /** Offered only when this returns true. */
  readonly when?: StateFn<S, boolean>;
  /** Merged into the state when taken. */
  readonly nextState?: StateFn<S, Partial<S>>;
}

/** A button the team taps. */
export interface Choice<S, K extends string> extends Transition<S, K> {
  readonly label: string;
}

/**
 * Taken by scanning the QR code of `location` there. The team sees only a scan button, not
 * where the codes are or where they lead.
 */
export interface ScanChoice<S, K extends string, L extends number = number> extends Transition<
  S,
  K
> {
  readonly location: L;
}

interface NodeBase<S> {
  /** Makes the node a start; teams starting here begin with this state. */
  readonly initialState?: S;
  /** Evaluated once per render; the state does not change while a node is shown. */
  readonly blocks: readonly MaybeBlock[] | StateFn<S, readonly MaybeBlock[]>;
}

/** A node ends the story, offers buttons, or waits for a QR scan; never buttons and scans at once. */
export type StoryNode<S, K extends string, L extends number = number> =
  | (NodeBase<S> & { readonly end: true; readonly choices?: never; readonly scans?: never })
  | (NodeBase<S> & {
      readonly end?: false;
      readonly choices: readonly [Choice<S, K>, ...Choice<S, K>[]];
      readonly scans?: never;
    })
  | (NodeBase<S> & {
      readonly end?: false;
      readonly choices?: never;
      readonly scans: readonly [ScanChoice<S, K, L>, ...ScanChoice<S, K, L>[]];
    });

/** A physical place with a QR code; teams scan it to take a QR choice. */
export interface Location {
  readonly id: number;
  readonly name: string;
}

export interface Story {
  /** Places with QR codes, by id. */
  readonly locations: readonly Location[];
  /** Node ids in definition order. */
  readonly order: readonly string[];
  readonly nodes: Readonly<Record<string, StoryNode<State, string>>>;
}

export interface StoryDefinition<S, K extends string, L extends number> {
  /** Places with QR codes: number → name. Only these numbers can appear in `scans`. */
  readonly locations: Readonly<Record<L, string>>;
  readonly nodes: Record<K, StoryNode<S, NoInfer<K>, NoInfer<L>>>;
}

/**
 * Defines the story. The first call fixes the state type, the second infers the node ids and the
 * location numbers, so a `goto` to a missing node or a scan of an unknown place is a type error.
 * `choices` are buttons, `scans` are QR codes of `locations`: `{ location: 1, goto: 'WELL' }`
 * moves the team on when it scans the code of place 1.
 *
 * ```ts
 * defineStory<{ gold: number }>()({
 *   locations: { 1: 'Studna' },
 *   nodes: {
 *     A: { initialState: { gold: 0 }, blocks: ['Jděte ke studni.'], scans: [{ location: 1, goto: 'B' }] },
 *     B: { end: true, blocks: ['Konec'] },
 *   },
 * })
 * ```
 */
export const defineStory =
  <S extends State>() =>
  <K extends string, L extends number = never>({
    locations,
    nodes,
  }: StoryDefinition<S, K, L>): Story => ({
    locations: Object.entries<string>(locations)
      .map(([id, name]) => ({ id: Number(id), name }))
      .toSorted((a, b) => a.id - b.id),
    order: Object.keys(nodes),
    nodes,
  });

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
