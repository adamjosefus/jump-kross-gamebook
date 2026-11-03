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

/** Blocks written for the team's state and the team itself, e.g. to use its name. */
type BlocksFn<S> = { fn(state: S, team: Team): readonly MaybeBlock[] }['fn'];

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
  /** Makes the node the start, where every team begins with this state; a story has one. */
  readonly initialState?: S;
  /** Evaluated once per render; the state does not change while a node is shown. */
  readonly blocks: readonly MaybeBlock[] | BlocksFn<S>;
}

/** A node ends the story, offers buttons, or waits for a QR scan; never buttons and scans at once. */
export type StoryNode<S, K extends string, L extends number = number> =
  | (NodeBase<S> & {
      readonly end: true;
      readonly choices?: never;
      readonly scans?: never;
      readonly scanTitle?: never;
      readonly scanText?: never;
    })
  | (NodeBase<S> & {
      readonly end?: false;
      readonly choices: readonly [Choice<S, K>, ...Choice<S, K>[]];
      readonly scans?: never;
      readonly scanTitle?: never;
      readonly scanText?: never;
    })
  | (NodeBase<S> & {
      readonly end?: false;
      readonly choices?: never;
      readonly scans: readonly [ScanChoice<S, K, L>, ...ScanChoice<S, K, L>[]];
      /** The heading of the scan screen; the player's default one without it. */
      readonly scanTitle?: string;
      /** The text under that heading; the player's default one without it. */
      readonly scanText?: string;
    });

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
  /** Screens anyone sees before scanning a team's login code; the same for every team. */
  readonly intro: readonly Block[];
  /** The heading of the login scan screen; the player's default one without it. */
  readonly introScanTitle?: string;
  /** The text under that heading; the player's default one without it. */
  readonly introScanText?: string;
  /** Node ids in definition order. */
  readonly order: readonly string[];
  readonly nodes: Readonly<Record<string, StoryNode<State, string>>>;
}

export interface StoryDefinition<S, K extends string, L extends number> {
  /** Teams: number → name. Each team gets a login QR code with its number. */
  readonly teams: Readonly<Record<number, string>>;
  /** Places with QR codes: number → name. Only these numbers can appear in `scans`. */
  readonly locations: Readonly<Record<L, string>>;
  /**
   * Screens shown before login, without any team or state: the story and the rules. After them
   * the player scans the team's code; a team that has not started yet begins at the start node.
   */
  readonly intro: readonly Block[];
  /** The heading of the login scan screen; the player's default one without it. */
  readonly introScanTitle?: string;
  /** The text under that heading; the player's default one without it. */
  readonly introScanText?: string;
  readonly nodes: Readonly<Record<K, StoryNode<S, NoInfer<K>, NoInfer<L>>>>;
}

/**
 * Defines the story. The first call fixes the state type, the second infers the node ids and the
 * location numbers, so a `goto` to a missing node or a scan of an unknown place is a type error.
 * `choices` are buttons, `scans` are QR codes of `locations`: `{ location: 1, goto: 'WELL' }`
 * moves the team on when it scans the code of place 1.
 *
 * ```ts
 * defineStory<{ gold: number }>()({
 *   teams: { 1: 'Vlci', 2: 'Lišky' },
 *   locations: { 1: 'Studna' },
 *   intro: ['# Hra\n\nNaskenujte kód svého týmu.'],
 *   nodes: {
 *     A: { initialState: { gold: 0 }, blocks: ['Jděte ke studni.'], scans: [{ location: 1, goto: 'B' }] },
 *     B: { end: true, blocks: (state, team) => [`Konec, týme ${team.name}. Máte ${state.gold} zlaťáků.`] },
 *   },
 * })
 * ```
 */
export const defineStory =
  <S extends State>() =>
  <K extends string, L extends number = never>({
    teams,
    locations,
    intro,
    introScanTitle,
    introScanText,
    nodes,
  }: StoryDefinition<S, K, L>): Story => ({
    teams: byId(teams),
    locations: byId(locations),
    intro,
    ...(introScanTitle === undefined ? {} : { introScanTitle }),
    ...(introScanText === undefined ? {} : { introScanText }),
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
