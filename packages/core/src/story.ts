import type { State } from './types.ts';

/** Looks of one screen; the player maps each theme to its own styles. */
export const THEMES = ['default', 'intro', 'green', 'red', 'letter', 'description'] as const;
export type Theme = (typeof THEMES)[number];

/** One screen of markdown. */
export interface Screen {
  readonly theme?: Theme;
  /**
   * A picture above the text, as the source of one `<svg>` element. `currentColor` takes the color
   * of the screen's text. Inserted into the page as it is, so it must come from the story's author.
   */
  readonly svg?: string;
  readonly content: string;
  /**
   * Text of the button leading from this screen to the next one; when missing or empty, it is a
   * round button with only an arrow. The last screen of a node has such a button only when a scan
   * follows.
   */
  readonly next?: string;
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

/** Like `StateFn`, written for the team's state and the team itself, e.g. to use its name. */
type TeamFn<S, R> = { fn(state: S, team: Team): R }['fn'];

interface Transition<S, K extends string> {
  readonly goto: K;
  /** Offered only when this returns true for the team's state and the team. */
  readonly when?: TeamFn<S, boolean>;
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

/** Falsy entries are skipped, so choices can be written as `condition && choice`. */
export type MaybeChoice<S, K extends string> = Choice<S, K> | false | null | undefined;

interface NodeBase<S> {
  /** Makes the node the start, where every team begins with this state; a story has one. */
  readonly initialState?: S;
  /** Evaluated once per render; the state does not change while a node is shown. */
  readonly blocks: readonly MaybeBlock[] | TeamFn<S, readonly MaybeBlock[]>;
}

/** A node offers buttons or waits for a QR scan, never both; the intro and the outro are apart. */
export type StoryNode<S, K extends string, L extends number = number> =
  | (NodeBase<S> & {
      /**
       * Evaluated once per render, like `blocks`, so a function has to give the same list for the
       * same state and team: a chosen button is found by its position in the list.
       */
      readonly choices:
        | readonly [Choice<S, K>, ...Choice<S, K>[]]
        | TeamFn<S, readonly MaybeChoice<S, K>[]>;
      readonly scans?: never;
      readonly scanTitle?: never;
      readonly scanText?: never;
    })
  | (NodeBase<S> & {
      readonly choices?: never;
      readonly scans: readonly [ScanChoice<S, K, L>, ...ScanChoice<S, K, L>[]];
      /** The heading of the scan screen; the player's default one without it. */
      readonly scanTitle?: string;
      /** The text under that heading; the player's default one without it. */
      readonly scanText?: string;
    });

/**
 * The intro: anyone sees it before scanning a team's login code, so there is no team and no state
 * and the blocks are a plain list. The login leads on, to the start or to where the team is.
 */
export interface IntroNode {
  readonly initialState?: never;
  readonly blocks: readonly MaybeBlock[];
  /** The heading of the login scan screen; the player's default one without it. */
  readonly scanTitle?: string;
  /** The text under that heading; the player's default one without it. */
  readonly scanText?: string;
  readonly choices?: never;
  readonly scans?: never;
}

/** The outro: the game ends when a team arrives; the blocks may use the state and the team. */
export interface OutroNode<S> {
  readonly initialState?: never;
  readonly blocks: readonly MaybeBlock[] | TeamFn<S, readonly MaybeBlock[]>;
  readonly choices?: never;
  readonly scans?: never;
  readonly scanTitle?: never;
  readonly scanText?: never;
}

/** Any node of a story the engine runs. */
export type AnyNode = StoryNode<State, string> | IntroNode | OutroNode<State>;

/** A physical place with a QR code; teams scan it to take a QR choice. */
export interface Location {
  readonly id: number;
  readonly name: string;
}

/** A team playing the game; its login QR code carries the id. */
export interface Team {
  readonly id: number;
  readonly name: string;
}

export interface Story {
  /** Teams, by id; the list is fixed for the game. */
  readonly teams: readonly Team[];
  /** Places with QR codes, by id. */
  readonly locations: readonly Location[];
  /** The node anyone sees before scanning a team's login code; the same for every team. */
  readonly introNode: string;
  /** The node the game ends at. */
  readonly outroNode: string;
  /** Node ids in definition order. */
  readonly order: readonly string[];
  readonly nodes: Readonly<Record<string, AnyNode>>;
}

export interface StoryDefinition<
  S,
  K extends string,
  I extends K,
  O extends Exclude<K, I>,
  L extends number,
> {
  /** Teams: number → name. Each team gets a login QR code with its number. */
  readonly teams: Readonly<Record<number, string>>;
  /** Places with QR codes: number → name. Only these numbers can appear in `scans`. */
  readonly locations: Readonly<Record<L, string>>;
  /**
   * The node shown before login, without any team or state: the story and the rules. After it
   * the player scans the team's code; a team that has not started yet begins at the start node.
   */
  readonly introNode: I;
  /** The node the game ends at; no choice leads on from it. */
  readonly outroNode: O;
  /**
   * The first part types the values, so arrow functions and literals get their types from it; the
   * second checks that the intro, the outro and the other nodes have their shapes. `NoInfer` keeps
   * TypeScript from guessing the ids from the nodes instead of from the keys, `introNode` and
   * `outroNode`.
   */
  readonly nodes: {
    readonly [Id in K]:
      | StoryNode<S, Exclude<NoInfer<K>, NoInfer<I>>, NoInfer<L>>
      | IntroNode
      | OutroNode<S>;
  } & NodeShapes<S, NoInfer<K>, NoInfer<I>, NoInfer<O>, NoInfer<L>>;
}

/**
 * Which node has to be the intro, which the outro, and which an ordinary node of the story. While
 * TypeScript still infers the ids it sees `I` as `string`; the first branch keeps the check out of
 * the way until then, otherwise every node would be typed as the intro and literals in the nodes
 * would lose their types.
 */
type NodeShapes<S, K extends string, I extends string, O extends string, L extends number> = {
  readonly [Id in K]: string extends I
    ? unknown
    : Id extends I
      ? IntroNode
      : Id extends O
        ? OutroNode<S>
        : StoryNode<S, Exclude<K, I>, L>;
};

/**
 * Defines the story. The first call fixes the state type, the second infers the node ids and the
 * location numbers, so a `goto` to a missing node or a scan of an unknown place is a type error.
 * `introNode` names the node shown before login and `outroNode` the one the game ends at.
 * `choices` are buttons, `scans` are QR codes of `locations`: `{ location: 1, goto: 'WELL' }`
 * moves the team on when it scans the code of place 1.
 *
 * ```ts
 * defineStory<{ gold: number }>()({
 *   teams: { 1: 'Vlci', 2: 'Lišky' },
 *   locations: { 1: 'Studna' },
 *   introNode: 'INTRO',
 *   outroNode: 'OUTRO',
 *   nodes: {
 *     INTRO: { blocks: ['# Hra\n\nNaskenujte kód svého týmu.'] },
 *     A: { initialState: { gold: 0 }, blocks: ['Jděte ke studni.'], scans: [{ location: 1, goto: 'OUTRO' }] },
 *     OUTRO: { blocks: (state, team) => [`Konec, týme ${team.name}. Máte ${state.gold} zlaťáků.`] },
 *   },
 * })
 * ```
 */
export const defineStory =
  <S extends State>() =>
  <K extends string, I extends K, O extends Exclude<K, I>, L extends number = never>({
    teams,
    locations,
    introNode,
    outroNode,
    nodes,
  }: StoryDefinition<S, K, I, O, L>): Story => ({
    teams: byId(teams),
    locations: byId(locations),
    introNode,
    outroNode,
    order: Object.keys(nodes),
    nodes,
  });

const byId = (names: Readonly<Record<number, string>>) =>
  Object.entries<string>(names)
    .map(([id, name]) => ({ id: Number(id), name }))
    .toSorted((first, second) => first.id - second.id);

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
