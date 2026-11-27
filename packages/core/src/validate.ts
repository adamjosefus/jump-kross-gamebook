import {
  availableChoices,
  availableScans,
  choicesOf,
  EmptyActionsError,
  introSegments,
  mergeState,
  sampleTeam,
  scansOf,
  segmentsOf,
  stateKey,
  unsoundStateKeys,
  type RenderedSegment,
} from './engine.ts';
import { isQrId, MAX_QR_ID } from './qr.ts';
import {
  choiceName,
  loginMessages,
  type AnyNode,
  type Choice,
  type ScanChoice,
  type Story,
  type Team,
} from './story.ts';
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

const hasBadSvg = ({ svg }: RenderedSegment) => svg !== undefined && !SVG_ELEMENT.test(svg);
/** A picture is enough for a segment, it does not need text too. */
const isEmptySegment = ({ content, svg }: RenderedSegment) =>
  content.trim() === '' && svg === undefined;

/** The intro has no team and no state and leads on by the login, not by choices. */
const introProblems = (story: Story): readonly string[] => {
  const id = story.introNode;
  const intro = story.nodes[id];
  if (intro === undefined) {
    return [`Příběh nemá uzel úvodu ${id}.`];
  }
  return [
    ...problemIf(id === story.outroNode, `Úvod a konec je tentýž uzel ${id}.`),
    ...problemIf(intro.initialState !== undefined, `Úvod ${id} nesmí být start.`),
    ...problemIf(
      typeof intro.segments === 'function',
      `Úvod ${id} nemá tým ani stav, jeho segmenty nesmí být funkce.`,
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
    ...introSegments(story).flatMap((segment, index) => [
      ...problemIf(isEmptySegment(segment), `Úvod má prázdný segment č. ${index + 1}.`),
      ...problemIf(hasBadSvg(segment), `Úvod má neplatné svg v segmentu č. ${index + 1}.`),
    ]),
  ];
};

/** The outro ends the game, so nothing leads on from it. */
const outroProblems = (story: Story): readonly string[] => {
  const id = story.outroNode;
  const outro = story.nodes[id];
  if (outro === undefined) {
    return [`Příběh nemá uzel konce ${id}.`];
  }
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

/** `offered` are the codes `scans` functions gave while the story was played. */
const codeProblems = (story: Story, offered: ReadonlySet<number>): readonly string[] => {
  const scanned = new Set([
    ...story.order.flatMap((id) => fixedScans(story.nodes[id]!)).map((scan) => scan.code),
    ...offered,
  ]);
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

/**
 * The ids of chapters name the columns of the results (`chapter_<id>_s`, `gap_<from>_<to>_s`), so
 * they are plain words: an id with an underscore could make the same column as another one.
 * `start` and `end` stand for the start and the end of the game in the columns of the gaps.
 */
const CHAPTER_ID = /^[A-Za-z][A-Za-z0-9]*$/;
const RESERVED_CHAPTER_IDS: readonly string[] = ['start', 'end'];

const chapterIdProblem = (id: string, name: string) => [
  ...problemIf(
    !CHAPTER_ID.test(id),
    `Kapitola „${name}“ má neplatné id „${id}“: smí mít jen písmena bez diakritiky a číslice a začínat písmenem.`,
  ),
  ...problemIf(
    RESERVED_CHAPTER_IDS.includes(id),
    `Kapitola „${name}“ nesmí mít id „${id}“, to označuje začátek nebo konec hry.`,
  ),
];

/** A node names a known chapter and every chapter has a node. */
const chapterProblems = (story: Story): readonly string[] => {
  const known = new Set(story.chapters.map((chapter) => chapter.id));
  const used = new Set(story.order.map((id) => story.nodes[id]!.chapter));
  return [
    ...story.order.flatMap((id) => {
      const chapter = story.nodes[id]!.chapter;
      return chapter === undefined
        ? []
        : problemIf(!known.has(chapter), `Uzel ${id} patří k neznámé kapitole ${chapter}.`);
    }),
    ...story.chapters.flatMap(({ id, name, timer }) => [
      ...chapterIdProblem(id, name),
      // A timer names a column of the results too; one without its own key is checked as the id.
      ...problemIf(
        timer !== id && !CHAPTER_ID.test(timer),
        `Kapitola „${name}“ má neplatné stopky „${timer}“: smí mít jen písmena bez diakritiky a číslice a začínat písmenem.`,
      ),
      ...problemIf(name.trim() === '', `Kapitola ${id} nemá název.`),
      ...problemIf(!used.has(id), `Kapitola ${id} („${name}“) nemá žádný uzel.`),
    ]),
  ];
};

/** A node's QR choices written as a list; a function's are known only when played. */
const fixedScans = (node: AnyNode): readonly ScanChoice<State, string>[] =>
  typeof node.scans === 'function' ? [] : (node.scans ?? []);

/** Codes and targets of a node's QR choices. */
const scanProblems = (
  story: Story,
  known: ReadonlySet<number>,
  id: string,
  scans: readonly ScanChoice<State, string>[],
): readonly string[] =>
  scans.flatMap(({ code, goto }) => [
    ...problemIf(!known.has(code), `QR volba v uzlu ${id} vede přes neznámý kód ${code}.`),
    ...problemIf(
      !Object.hasOwn(story.nodes, goto),
      `QR volba kódu ${code} v uzlu ${id} vede na neexistující uzel ${goto}.`,
    ),
    ...problemIf(goto === story.introNode, `QR volba kódu ${code} v uzlu ${id} vede na úvod.`),
  ]);

/** Labels and targets of a node's buttons. */
const choiceProblems = (
  story: Story,
  id: string,
  choices: readonly Choice<State, string>[],
): readonly string[] =>
  choices.flatMap((choice, index) => {
    const { label, goto } = choice;
    const name = choiceName(choice);
    return [
      ...(label === undefined
        ? problemIf(
            choices.length > 1,
            `Uzel ${id} má tlačítko „Další“ bez textu vedle dalších voleb; to může být jen jediná volba.`,
          )
        : label.trim() === ''
          ? [`Uzel ${id} má volbu s prázdným popiskem; pro tlačítko „Další“ popisek vynech.`]
          : problemIf(
              choices.slice(0, index).some((earlier) => earlier.label === label),
              `Uzel ${id} má dvě volby „${label}“.`,
            )),
      ...problemIf(
        !Object.hasOwn(story.nodes, goto),
        `Volba „${name}“ v uzlu ${id} vede na neexistující uzel ${goto}.`,
      ),
      ...problemIf(goto === story.introNode, `Volba „${name}“ v uzlu ${id} vede na úvod.`),
    ];
  });

/**
 * Problems of one node visible without playing: scan texts, labels, codes and targets. Choices and
 * QR choices from a function are known only when played, so `step` checks them.
 */
const nodeProblems = (
  story: Story,
  known: ReadonlySet<number>,
  id: string,
  node: AnyNode,
): readonly string[] => [
  ...problemIf(node.scanTitle?.trim() === '', `Uzel ${id} má prázdný titulek skeneru.`),
  ...problemIf(node.scanText?.trim() === '', `Uzel ${id} má prázdný text skeneru.`),
  ...scanProblems(story, known, id, fixedScans(node)),
  ...(typeof node.choices === 'function' ? [] : choiceProblems(story, id, node.choices ?? [])),
];

/** Buttons and QR choices offered in `state`, with a name for messages. */
const offeredAt = (node: AnyNode, state: State, team: Team) => [
  ...availableChoices(node, state, team).map(({ choice }) => ({
    transition: choice,
    name: `volby „${choiceName(choice)}“`,
  })),
  ...availableScans(node, state, team).map(({ scan }) => ({
    transition: scan,
    name: `QR volby kódu ${scan.code}`,
  })),
];

interface Step {
  readonly problems: readonly string[];
  /** The codes of the QR choices offered here. */
  readonly scanned: readonly number[];
  /** Where the offered choices lead. */
  readonly next: readonly Visit[];
}

const contentProblemsOf = (
  id: string,
  node: AnyNode,
  state: State,
  team: Team,
): readonly string[] => {
  const segments = attempt(() => segmentsOf(node, state, team));
  return segments.ok
    ? [
        ...problemIf(
          segments.value.length === 0,
          `Uzel ${id} nemá ve stavu ${show(state)} žádný obsah.`,
        ),
        ...segments.value.flatMap((segment, index) => [
          ...problemIf(isEmptySegment(segment), `Uzel ${id} má prázdný segment č. ${index + 1}.`),
          ...problemIf(
            hasBadSvg(segment),
            `Uzel ${id} má neplatné svg v segmentu č. ${index + 1}.`,
          ),
          // After the last segment only a scan follows; buttons and the end have no „Další“.
          ...problemIf(
            segment.next !== undefined &&
              index === segments.value.length - 1 &&
              node.scans === undefined,
            `Uzel ${id} má next „${segment.next}“ v posledním segmentu, kde žádné takové tlačítko není.`,
          ),
        ]),
      ]
    : [`Obsah uzlu ${id} ve stavu ${show(state)} spadl: ${message(segments.error)}`];
};

/** Checks one (node, state) pair and lists the pairs it leads to. */
const step = (
  story: Story,
  known: ReadonlySet<number>,
  team: Team,
  { node: id, state }: Visit,
): Step => {
  const node = story.nodes[id]!;
  const contentProblems = contentProblemsOf(id, node, state, team);
  if (id === story.outroNode) {
    return { problems: contentProblems, scanned: [], next: [] };
  }

  const offered = attempt(() => offeredAt(node, state, team));
  if (!offered.ok) {
    return {
      problems: [
        ...contentProblems,
        offered.error instanceof EmptyActionsError
          ? `Volby uzlu ${id} jsou ve stavu ${show(state)} prázdné: ${offered.error.list} musí dát aspoň jednu možnost.`
          : `Volby uzlu ${id} ve stavu ${show(state)} spadly: ${message(offered.error)}`,
      ],
      scanned: [],
      next: [],
    };
  }
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
      ...(typeof node.scans === 'function'
        ? scanProblems(story, known, id, scansOf(node, state, team))
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
    scanned: codes,
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
  /** The codes of the QR choices offered in at least one reached state. */
  readonly scanned: ReadonlySet<number>;
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
    if (!firsts.has(key)) {
      firsts.set(key, problem);
    }
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
const explore = (
  story: Story,
  known: ReadonlySet<number>,
  team: Team,
  start: Visit,
  maxStates: number,
): Exploration => {
  // Breadth-first search: the queue, the seen keys and the problems are filled in place, an
  // immutable version would copy them on every step.
  const queue: Visit[] = [start];
  const seen = new Set([visitKey(start)]);
  const scanned = new Set<number>();
  const reached = new Set<string>();
  const problems: string[] = [];
  // Every pair played, with the pairs its choices lead to: the trap check walks them backwards.
  const played = new Map<string, Visit>();
  const edges = new Map<string, readonly string[]>();
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
    const result = step(story, known, team, visit);
    reached.add(visit.node);
    problems.push(...result.problems);
    for (const code of result.scanned) {
      scanned.add(code);
    }
    const from = visitKey(visit);
    played.set(from, visit);
    edges.set(from, result.next.map(visitKey));
    for (const next of result.next) {
      const key = visitKey(next);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      queue.push(next);
    }
  }
  // Within the limit every pair was played, so what cannot reach the end from here never will.
  const traps = truncated ? [] : trappedVisits(story, played, edges);
  return {
    problems: collapseStates([
      ...problems,
      ...traps.map(
        ({ node, state }) =>
          `Uzel ${node} je ve stavu ${show(state)} past: odtud se nedá dojít na konec ${story.outroNode}.`,
      ),
    ]),
    reached,
    scanned,
    truncated,
  };
};

/**
 * Played pairs with a way on but no way to the end: the team keeps choosing and never finishes. A
 * dead end (no way on) has its own problem, and when no pair reaches the end at all the end itself
 * is reported as unreachable, so neither is a trap.
 */
const trappedVisits = (
  story: Story,
  played: ReadonlyMap<string, Visit>,
  edges: ReadonlyMap<string, readonly string[]>,
): readonly Visit[] => {
  const incoming = new Map<string, string[]>();
  for (const [from, targets] of edges) {
    for (const target of targets) {
      incoming.set(target, [...(incoming.get(target) ?? []), from]);
    }
  }
  // Breadth-first search backwards from the end: the set and the queue are filled in place.
  const finishing = [...played.keys()].filter((key) => played.get(key)!.node === story.outroNode);
  if (finishing.length === 0) {
    return [];
  }
  const canFinish = new Set(finishing);
  const queue = [...finishing];
  // for...of reads the array's length on every step, so keys pushed while iterating are visited too.
  for (const key of queue) {
    for (const from of incoming.get(key) ?? []) {
      if (canFinish.has(from)) {
        continue;
      }
      canFinish.add(from);
      queue.push(from);
    }
  }
  return [...played]
    .filter(([key]) => !canFinish.has(key) && (edges.get(key)?.length ?? 0) > 0)
    .map(([, visit]) => visit);
};

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
 * start and reports nodes nobody reaches, choices nobody can take, dead ends, traps (pairs from
 * which the end cannot be reached any more), empty segments and labels, segments that throw, bad team
 * and code numbers and two QR choices for one code.
 */
export const validateStory = (
  story: Story,
  { maxStates = 10_000 }: ValidateOptions = {},
): readonly string[] => {
  // Everything below looks nodes up by `order`, so a story whose order names no node gets only
  // that reported.
  const structure = structureProblems(story);
  if (structure.length > 0) {
    return structure;
  }
  const starts = story.order.filter((id) => story.nodes[id]!.initialState !== undefined);
  const start = starts[0];
  if (start === undefined) {
    return ['Příběh nemá start (uzel s initialState).'];
  }

  const known = new Set(story.codes.map((qrCode) => qrCode.id));
  // The intro is played by nobody: the login leads from it to the start.
  const played = story.order.filter((id) => id !== story.introNode);
  // Content and conditions may depend on the team, so every team plays the story on its own.
  const teams = story.teams.length === 0 ? [sampleTeam(story)] : story.teams;
  const explored = teams.map((team) => ({
    team,
    exploration: explore(
      story,
      known,
      team,
      { node: start, state: story.nodes[start]!.initialState! },
      maxStates,
    ),
  }));
  const reached = new Set(explored.flatMap(({ exploration }) => [...exploration.reached]));
  const scanned = new Set(explored.flatMap(({ exploration }) => [...exploration.scanned]));
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
    ...codeProblems(story, scanned),
    ...chapterProblems(story),
    ...played.flatMap((id) => nodeProblems(story, known, id, story.nodes[id]!)),
    ...mergeTeamProblems(explored),
    ...endProblems,
    ...played.flatMap((id) =>
      problemIf(!reached.has(id), `Uzel ${id} je nedosažitelný ze startu.`),
    ),
  ];
  // Several states can raise the same problem; the first occurrence keeps its place.
  return [...new Set(problems)];
};
