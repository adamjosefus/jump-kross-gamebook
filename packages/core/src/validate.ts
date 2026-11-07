import {
  availableChoices,
  availableScans,
  choicesOf,
  introScreens,
  mergeState,
  sampleTeam,
  screensOf,
  stateKey,
  unsoundStateKeys,
  type RenderedScreen,
} from './engine.ts';
import { isQrId, MAX_QR_ID } from './qr.ts';
import { loginMessages, type AnyNode, type Choice, type Story, type Team } from './story.ts';
import type { State } from './types.ts';

export interface ValidateOptions {
  /** Upper bound on explored (node, state) pairs; stories with counters could otherwise explode. */
  readonly maxStates?: number;
}

/** A team at a node with a state: one explored pair. */
interface Visit {
  readonly node: string;
  readonly state: State;
}

type Attempt<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

/** Runs story code, which may throw, and keeps the error instead of propagating it. */
const attempt = <T>(compute: () => T): Attempt<T> => {
  try {
    return { ok: true, value: compute() };
  } catch (error) {
    return { ok: false, error };
  }
};

const visitKey = ({ node, state }: Visit) => JSON.stringify([node, stateKey(state)]);

const stateProblem = (where: string, state: State): readonly string[] => {
  const keys = unsoundStateKeys(state);
  return problemIf(
    keys.length > 0,
    `${where} má ve stavu hodnoty, které nejsou text, číslo ani ano/ne: ${keys.join(', ')}.`,
  );
};

const show = (state: State) => JSON.stringify(state);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const problemIf = (condition: boolean, problem: string): readonly string[] =>
  condition ? [problem] : [];

/**
 * One whole `<svg>` element, closed or self-closing; a mistake here would otherwise show only as a
 * missing picture.
 */
const SVG_ELEMENT = /^\s*<svg(?:[\s>][\s\S]*<\/svg>|(?:\s[^>]*)?\/>)\s*$/;

const hasBadSvg = ({ svg }: RenderedScreen) => svg !== undefined && !SVG_ELEMENT.test(svg);
/** A picture is enough for a screen, it does not need text too. */
const isEmptyScreen = ({ content, svg }: RenderedScreen) =>
  content.trim() === '' && svg === undefined;

/** The intro has no team and no state and leads on by the login, not by choices. */
const introProblems = (story: Story): readonly string[] => {
  const id = story.introNode;
  const intro = story.nodes[id];
  if (intro === undefined) return [`Příběh nemá uzel úvodu ${id}.`];
  return [
    ...problemIf(id === story.outroNode, `Úvod a konec je tentýž uzel ${id}.`),
    ...problemIf(intro.initialState !== undefined, `Úvod ${id} nesmí být start.`),
    ...problemIf(
      typeof intro.blocks === 'function',
      `Úvod ${id} nemá tým ani stav, jeho blocks nesmí být funkce.`,
    ),
    ...problemIf(
      intro.choices !== undefined || intro.scans !== undefined,
      `Úvod ${id} nesmí mít volby ani QR volby, dál vede kód týmu.`,
    ),
    ...problemIf(intro.scanTitle?.trim() === '', 'Úvod má prázdný titulek skeneru.'),
    ...problemIf(intro.scanText?.trim() === '', 'Úvod má prázdný text skeneru.'),
    ...Object.entries(loginMessages(story, sampleTeam(story))).flatMap(([key, text]) =>
      problemIf(text.trim() === '', `Úvod má prázdný text přihlášení ${key}.`),
    ),
    ...introScreens(story).flatMap((screen, index) => [
      ...problemIf(isEmptyScreen(screen), `Úvod má prázdnou obrazovku č. ${index + 1}.`),
      ...problemIf(hasBadSvg(screen), `Úvod má neplatné svg na obrazovce č. ${index + 1}.`),
    ]),
  ];
};

/** The outro ends the game, so nothing leads on from it. */
const outroProblems = (story: Story): readonly string[] => {
  const id = story.outroNode;
  const outro = story.nodes[id];
  if (outro === undefined) return [`Příběh nemá uzel konce ${id}.`];
  return [
    ...problemIf(outro.initialState !== undefined, `Konec ${id} nesmí být start.`),
    ...problemIf(
      outro.choices !== undefined || outro.scans !== undefined,
      `Konec ${id} nesmí mít volby ani QR volby.`,
    ),
  ];
};

/**
 * Every id in `order` has to be a node, once: the rest of the checks (and the engine) look the
 * nodes up by it. `defineStory` keeps them together; a story built by hand may not. Nodes outside
 * `order` are allowed, they are only played when a choice leads to them.
 */
const structureProblems = (story: Story): readonly string[] =>
  story.order.flatMap((id, index) => [
    ...problemIf(story.order.indexOf(id) !== index, `Uzel ${id} je v order dvakrát.`),
    ...problemIf(!Object.hasOwn(story.nodes, id), `Uzel ${id} z order není v nodes.`),
    // JavaScript puts integer keys first whatever the order they are written in, so the order
    // of the story (and with it the start) would not be the one in the file.
    ...problemIf(/^\d+$/.test(id), `Uzel ${id} má číselný název; pojmenujte ho slovem.`),
  ]);

/** The id goes into a QR code, which carries a positive integer of at most six digits. */
const idProblem = (what: string, id: number, name: string) =>
  problemIf(
    !isQrId(id),
    `${what} „${name}“ má neplatné číslo ${id}: musí být celé, od 1 do ${MAX_QR_ID}.`,
  );

const teamProblems = (story: Story): readonly string[] => [
  ...problemIf(story.teams.length === 0, 'Příběh nemá žádný tým.'),
  ...story.teams.flatMap(({ id, name }, index) => [
    ...idProblem('Tým', id, name),
    ...problemIf(name.trim() === '', `Tým ${id} nemá název.`),
    ...problemIf(
      story.teams.slice(0, index).some((earlier) => earlier.id === id),
      `Číslo týmu ${id} je použito dvakrát.`,
    ),
  ]),
];

const codeProblems = (story: Story): readonly string[] => {
  const scanned = new Set(
    story.order.flatMap((id) => story.nodes[id]!.scans ?? []).map((scan) => scan.code),
  );
  return [
    ...story.codes.flatMap(({ id, name }, index) => [
      ...idProblem('Kód', id, name),
      ...problemIf(name.trim() === '', `Kód ${id} nemá název.`),
      ...problemIf(
        story.codes.slice(0, index).some((earlier) => earlier.id === id),
        `Číslo kódu ${id} je použito dvakrát.`,
      ),
    ]),
    ...story.codes.flatMap(({ id, name }) =>
      problemIf(!scanned.has(id), `Kód ${id} („${name}“) nepoužívá žádná QR volba.`),
    ),
  ];
};

/** Labels and targets of a node's buttons. */
const choiceProblems = (
  story: Story,
  id: string,
  choices: readonly Choice<State, string>[],
): readonly string[] =>
  choices.flatMap(({ label, goto }, index) => [
    ...(label.trim() === ''
      ? [`Uzel ${id} má volbu bez popisku.`]
      : problemIf(
          choices.slice(0, index).some((earlier) => earlier.label === label),
          `Uzel ${id} má dvě volby „${label}“.`,
        )),
    ...problemIf(
      !Object.hasOwn(story.nodes, goto),
      `Volba „${label}“ v uzlu ${id} vede na neexistující uzel ${goto}.`,
    ),
    ...problemIf(goto === story.introNode, `Volba „${label}“ v uzlu ${id} vede na úvod.`),
  ]);

/**
 * Problems of one node visible without playing: scan texts, labels and targets. Choices from a
 * function are known only when played, so `step` checks them.
 */
const nodeProblems = (
  story: Story,
  known: ReadonlySet<number>,
  id: string,
  node: AnyNode,
): readonly string[] => [
  ...problemIf(node.scanTitle?.trim() === '', `Uzel ${id} má prázdný titulek skeneru.`),
  ...problemIf(node.scanText?.trim() === '', `Uzel ${id} má prázdný text skeneru.`),
  ...(node.scans ?? []).flatMap(({ code, goto }) => [
    ...problemIf(!known.has(code), `QR volba v uzlu ${id} vede přes neznámý kód ${code}.`),
    ...problemIf(
      !Object.hasOwn(story.nodes, goto),
      `QR volba kódu ${code} v uzlu ${id} vede na neexistující uzel ${goto}.`,
    ),
    ...problemIf(goto === story.introNode, `QR volba kódu ${code} v uzlu ${id} vede na úvod.`),
  ]),
  ...(typeof node.choices === 'function' ? [] : choiceProblems(story, id, node.choices ?? [])),
];

/** Buttons and QR choices offered at `id` in `state`, with a usage key and a name for messages. */
const offeredAt = (node: AnyNode, id: string, state: State, team: Team) => [
  ...availableChoices(node, state, team).map(({ choice, index }) => ({
    transition: choice,
    key: `${id}#${index}`,
    name: `volby „${choice.label}“`,
  })),
  ...availableScans(node, state, team).map(({ scan, index }) => ({
    transition: scan,
    key: `${id}@${index}`,
    name: `QR volby kódu ${scan.code}`,
  })),
];

interface Step {
  readonly problems: readonly string[];
  /** Usage keys of the choices offered here. */
  readonly used: readonly string[];
  /** Where the offered choices lead. */
  readonly next: readonly Visit[];
}

const contentProblemsOf = (
  id: string,
  node: AnyNode,
  state: State,
  team: Team,
): readonly string[] => {
  const screens = attempt(() => screensOf(node, state, team));
  return screens.ok
    ? [
        ...problemIf(
          screens.value.length === 0,
          `Uzel ${id} nemá ve stavu ${show(state)} žádný obsah.`,
        ),
        ...screens.value.flatMap((screen, index) => [
          ...problemIf(isEmptyScreen(screen), `Uzel ${id} má prázdnou obrazovku č. ${index + 1}.`),
          ...problemIf(
            hasBadSvg(screen),
            `Uzel ${id} má neplatné svg na obrazovce č. ${index + 1}.`,
          ),
          // After the last screen only a scan follows; buttons and the end have no „Další“.
          ...problemIf(
            screen.next !== undefined &&
              index === screens.value.length - 1 &&
              node.scans === undefined,
            `Uzel ${id} má next „${screen.next}“ na poslední obrazovce, kde žádné takové tlačítko není.`,
          ),
        ]),
      ]
    : [`Obsah uzlu ${id} ve stavu ${show(state)} spadl: ${message(screens.error)}`];
};

/** Checks one (node, state) pair and lists the pairs it leads to. */
const step = (story: Story, team: Team, { node: id, state }: Visit): Step => {
  const node = story.nodes[id]!;
  const contentProblems = contentProblemsOf(id, node, state, team);
  if (id === story.outroNode) return { problems: contentProblems, used: [], next: [] };

  const offered = attempt(() => offeredAt(node, id, state, team));
  if (!offered.ok)
    return {
      problems: [
        ...contentProblems,
        `Podmínka volby v uzlu ${id} ve stavu ${show(state)} spadla: ${message(offered.error)}`,
      ],
      used: [],
      next: [],
    };
  const available = offered.value;
  const codes = available.flatMap(({ transition }) =>
    'code' in transition ? [transition.code] : [],
  );
  const moves = available.flatMap(({ transition, name }) =>
    Object.hasOwn(story.nodes, transition.goto)
      ? [
          {
            name,
            target: transition.goto,
            result: attempt(() => mergeState(state, transition.nextState?.(state))),
          },
        ]
      : [],
  );
  return {
    problems: [
      ...contentProblems,
      ...(typeof node.choices === 'function'
        ? choiceProblems(story, id, choicesOf(node, state, team))
        : []),
      ...problemIf(
        available.length === 0,
        `Uzel ${id} je ve stavu ${show(state)} slepá ulička: žádná volba není dostupná.`,
      ),
      ...codes.flatMap((code, index) =>
        problemIf(
          codes.slice(0, index).includes(code),
          `Uzel ${id} má ve stavu ${show(state)} dvě QR volby pro kód ${code}.`,
        ),
      ),
      ...moves.flatMap(({ name, result }) =>
        result.ok
          ? stateProblem(`nextState ${name} v uzlu ${id}`, result.value)
          : [`nextState ${name} v uzlu ${id} spadl: ${message(result.error)}`],
      ),
    ],
    used: available.map(({ key }) => key),
    // A state with a bad value is not followed: it would be found again at every step after it.
    next: moves.flatMap(({ target, result }) =>
      result.ok && unsoundStateKeys(result.value).length === 0
        ? [{ node: target, state: result.value }]
        : [],
    ),
  };
};

interface Exploration {
  readonly problems: readonly string[];
  /** Nodes reached in at least one state and checked there. */
  readonly reached: ReadonlySet<string>;
  /** Usage keys of the choices offered in at least one reached state. */
  readonly used: ReadonlySet<string>;
  /** The exploration hit `maxStates`, so what was not reached may still be reachable. */
  readonly truncated: boolean;
}

/**
 * A problem of a node repeated for every state it has is one problem: the first state is named,
 * the others counted. The key is the message without the state.
 */
const collapseStates = (problems: readonly string[]): readonly string[] => {
  const keyOf = (problem: string) => problem.replace(/ ve stavu \{.*?\}/, '');
  const firsts = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const problem of problems) {
    const key = keyOf(problem);
    if (key === problem) {
      firsts.set(problem, problem);
      continue;
    }
    if (!firsts.has(key)) firsts.set(key, problem);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...firsts].map(([key, first]) => {
    const more = (counts.get(key) ?? 1) - 1;
    return more > 0 ? `${first} (a v dalších ${more} stavech)` : first;
  });
};

/**
 * Plays every (node, state) pair `team` can reach from `start`, breadth first, at most `maxStates`
 * of them.
 */
const explore = (story: Story, team: Team, start: Visit, maxStates: number): Exploration => {
  // Breadth-first search: the queue, the seen keys and the problems are filled in place, an
  // immutable version would copy them on every step.
  const queue: Visit[] = [start];
  const seen = new Set([visitKey(start)]);
  const used = new Set<string>();
  const reached = new Set<string>();
  const problems: string[] = [];
  let truncated = false;
  // for...of reads the array's length on every step, so pairs pushed while iterating are visited too.
  for (const [explored, visit] of queue.entries()) {
    if (explored >= maxStates) {
      problems.push(
        `Příběh má pro jeden tým víc než ${maxStates} kombinací uzlu a stavu, kontrola prošla jen část.`,
      );
      truncated = true;
      break;
    }
    const result = step(story, team, visit);
    reached.add(visit.node);
    problems.push(...result.problems);
    for (const key of result.used) used.add(key);
    for (const next of result.next) {
      const key = visitKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return { problems: collapseStates(problems), reached, used, truncated };
};

/** Choices of a reached node that no reached state offers; a function's list has no fixed ones. */
const unusedProblems = (
  node: AnyNode,
  id: string,
  used: ReadonlySet<string>,
): readonly string[] => [
  ...(typeof node.choices === 'function' ? [] : (node.choices ?? [])).flatMap((choice, index) =>
    problemIf(
      !used.has(`${id}#${index}`),
      `Volba „${choice.label}“ v uzlu ${id} není dostupná v žádném dosažitelném stavu.`,
    ),
  ),
  ...(node.scans ?? []).flatMap((scan, index) =>
    problemIf(
      !used.has(`${id}@${index}`),
      `QR volba kódu ${scan.code} v uzlu ${id} není dostupná v žádném dosažitelném stavu.`,
    ),
  ),
];

/** Each problem once, in the order found; one that not every team has names the teams it has. */
const mergeTeamProblems = (
  explored: readonly { readonly team: Team; readonly exploration: Exploration }[],
): readonly string[] => {
  const problems = [...new Set(explored.flatMap(({ exploration }) => exploration.problems))];
  return problems.map((problem) => {
    const teams = explored.filter(({ exploration }) => exploration.problems.includes(problem));
    return teams.length === explored.length
      ? problem
      : `${problem} (týká se: ${teams.map(({ team }) => team.name).join(', ')})`;
  });
};

/**
 * Mistakes the type checker cannot see. Plays every (node, state) pair each team can reach from the
 * start and reports nodes nobody reaches, choices nobody can take, dead ends, empty screens and labels,
 * blocks that throw, bad team and code numbers and two QR choices for one code.
 */
export const validateStory = (
  story: Story,
  { maxStates = 10_000 }: ValidateOptions = {},
): readonly string[] => {
  // Everything below looks nodes up by `order`, so a story whose order names no node gets only
  // that reported.
  const structure = structureProblems(story);
  if (structure.length > 0) return structure;
  const starts = story.order.filter((id) => story.nodes[id]!.initialState !== undefined);
  const start = starts[0];
  if (start === undefined) return ['Příběh nemá start (uzel s initialState).'];

  const known = new Set(story.codes.map((code) => code.id));
  // The intro is played by nobody: the login leads from it to the start.
  const played = story.order.filter((id) => id !== story.introNode);
  // Content and conditions may depend on the team, so every team plays the story on its own.
  const teams = story.teams.length === 0 ? [sampleTeam(story)] : story.teams;
  const explored = teams.map((team) => ({
    team,
    exploration: explore(
      story,
      team,
      { node: start, state: story.nodes[start]!.initialState! },
      maxStates,
    ),
  }));
  const reached = new Set(explored.flatMap(({ exploration }) => [...exploration.reached]));
  const used = new Set(explored.flatMap(({ exploration }) => [...exploration.used]));
  // A team that cannot reach the end while another can; an end nobody reaches is reported with
  // the other unreachable nodes.
  const stuck = explored.filter(
    ({ exploration }) => !exploration.truncated && !exploration.reached.has(story.outroNode),
  );
  const endProblems =
    stuck.length === 0 || !reached.has(story.outroNode)
      ? []
      : [
          `Konec ${story.outroNode} je ze startu nedosažitelný: tým nemůže hru dohrát. (týká se: ${stuck.map(({ team }) => team.name).join(', ')})`,
        ];
  const problems = [
    ...problemIf(
      starts.length > 1,
      `Příběh má víc startů (${starts.join(', ')}), smí mít jen jeden.`,
    ),
    ...stateProblem(`Start ${start}`, story.nodes[start]!.initialState!),
    ...introProblems(story),
    ...outroProblems(story),
    ...teamProblems(story),
    ...codeProblems(story),
    ...played.flatMap((id) => nodeProblems(story, known, id, story.nodes[id]!)),
    ...mergeTeamProblems(explored),
    ...endProblems,
    ...played.flatMap((id) =>
      reached.has(id)
        ? unusedProblems(story.nodes[id]!, id, used)
        : [`Uzel ${id} je nedosažitelný ze startu.`],
    ),
  ];
  // Several states can raise the same problem; the first occurrence keeps its place.
  return [...new Set(problems)];
};
