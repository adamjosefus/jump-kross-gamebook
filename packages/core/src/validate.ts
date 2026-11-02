import { availableChoices, availableScans, introScreens, mergeState, screensOf } from './engine.ts';
import type { Story, StoryNode } from './story.ts';
import type { State } from './types.ts';

export interface ValidateOptions {
  /** Upper bound on explored (node, state) pairs; stories with counters could otherwise explode. */
  readonly maxStates?: number;
}

type AnyNode = StoryNode<State, string>;

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

const stateKey = (state: State) =>
  JSON.stringify(
    Object.keys(state)
      .toSorted()
      .map((key) => [key, state[key]]),
  );

const visitKey = ({ node, state }: Visit) => JSON.stringify([node, stateKey(state)]);

const show = (state: State) => JSON.stringify(state);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const problemIf = (condition: boolean, problem: string): readonly string[] =>
  condition ? [problem] : [];

const introProblems = (story: Story): readonly string[] => [
  ...problemIf(story.intro.length === 0, 'Příběh nemá úvod (intro).'),
  ...problemIf(story.introScanTitle?.trim() === '', 'Úvod má prázdný titulek skeneru.'),
  ...problemIf(story.introScanText?.trim() === '', 'Úvod má prázdný text skeneru.'),
  ...introScreens(story).flatMap((screen, index) =>
    problemIf(screen.content.trim() === '', `Úvod má prázdnou obrazovku č. ${index + 1}.`),
  ),
];

const teamProblems = (story: Story): readonly string[] => [
  ...problemIf(story.teams.length === 0, 'Příběh nemá žádný tým.'),
  ...story.teams.flatMap(({ id, name }) => [
    ...problemIf(!Number.isInteger(id) || id <= 0, `Tým „${name}“ má neplatné číslo ${id}.`),
    ...problemIf(name.trim() === '', `Tým ${id} nemá název.`),
  ]),
];

const locationProblems = (story: Story): readonly string[] => {
  const scanned = new Set(
    story.order.flatMap((id) => story.nodes[id]!.scans ?? []).map((scan) => scan.location),
  );
  return [
    ...story.locations.flatMap(({ id, name }) => [
      ...problemIf(!Number.isInteger(id) || id <= 0, `Místo „${name}“ má neplatné číslo ${id}.`),
      ...problemIf(name.trim() === '', `Místo ${id} nemá název.`),
    ]),
    ...story.locations.flatMap(({ id, name }) =>
      problemIf(!scanned.has(id), `Místo ${id} („${name}“) nepoužívá žádná QR volba.`),
    ),
  ];
};

/** Problems of one node visible without playing: scan texts, labels and targets. */
const nodeProblems = (
  story: Story,
  known: ReadonlySet<number>,
  id: string,
  node: AnyNode,
): readonly string[] => {
  const choices = node.choices ?? [];
  return [
    ...problemIf(node.scanTitle?.trim() === '', `Uzel ${id} má prázdný titulek skeneru.`),
    ...problemIf(node.scanText?.trim() === '', `Uzel ${id} má prázdný text skeneru.`),
    ...(node.scans ?? []).flatMap(({ location, goto }) => [
      ...problemIf(
        !known.has(location),
        `QR volba v uzlu ${id} vede přes neznámé místo ${location}.`,
      ),
      ...problemIf(
        !Object.hasOwn(story.nodes, goto),
        `QR volba místa ${location} v uzlu ${id} vede na neexistující uzel ${goto}.`,
      ),
    ]),
    ...choices.flatMap(({ label, goto }, index) => [
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
    ]),
  ];
};

/** Buttons and QR choices offered at `id` in `state`, with a usage key and a name for messages. */
const offeredAt = (node: AnyNode, id: string, state: State) => [
  ...availableChoices(node, state).map(({ choice, index }) => ({
    transition: choice,
    key: `${id}#${index}`,
    name: `volby „${choice.label}“`,
  })),
  ...availableScans(node, state).map(({ scan, index }) => ({
    transition: scan,
    key: `${id}@${index}`,
    name: `QR volby místa ${scan.location}`,
  })),
];

interface Step {
  readonly problems: readonly string[];
  /** Usage keys of the choices offered here. */
  readonly used: readonly string[];
  /** Where the offered choices lead. */
  readonly next: readonly Visit[];
}

/** Checks one (node, state) pair and lists the pairs it leads to. */
const step = (story: Story, { node: id, state }: Visit): Step => {
  const node = story.nodes[id]!;
  const screens = attempt(() => screensOf(node, state));
  const contentProblems = screens.ok
    ? [
        ...problemIf(
          screens.value.length === 0,
          `Uzel ${id} nemá ve stavu ${show(state)} žádný obsah.`,
        ),
        ...screens.value.flatMap((screen, index) =>
          problemIf(
            screen.content.trim() === '',
            `Uzel ${id} má prázdnou obrazovku č. ${index + 1}.`,
          ),
        ),
      ]
    : [`Obsah uzlu ${id} ve stavu ${show(state)} spadl: ${message(screens.error)}`];
  if (node.end === true) return { problems: contentProblems, used: [], next: [] };

  const offered = attempt(() => offeredAt(node, id, state));
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
  const locations = available.flatMap(({ transition }) =>
    'location' in transition ? [transition.location] : [],
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
      ...problemIf(
        available.length === 0,
        `Uzel ${id} je ve stavu ${show(state)} slepá ulička: žádná volba není dostupná.`,
      ),
      ...locations.flatMap((location, index) =>
        problemIf(
          locations.slice(0, index).includes(location),
          `Uzel ${id} má ve stavu ${show(state)} dvě QR volby pro místo ${location}.`,
        ),
      ),
      ...moves.flatMap(({ name, result }) =>
        result.ok ? [] : [`nextState ${name} v uzlu ${id} spadl: ${message(result.error)}`],
      ),
    ],
    used: available.map(({ key }) => key),
    next: moves.flatMap(({ target, result }) =>
      result.ok ? [{ node: target, state: result.value }] : [],
    ),
  };
};

interface Exploration {
  readonly problems: readonly string[];
  /** Nodes reached in at least one state. */
  readonly reached: ReadonlySet<string>;
  /** Usage keys of the choices offered in at least one reached state. */
  readonly used: ReadonlySet<string>;
}

/** Plays every reachable (node, state) pair from `start`, breadth first, at most `maxStates` of them. */
const explore = (story: Story, start: Visit, maxStates: number): Exploration => {
  // Breadth-first search: the queue, the seen keys and the problems are filled in place, an
  // immutable version would copy them on every step.
  const queue: Visit[] = [start];
  const seen = new Set([visitKey(start)]);
  const used = new Set<string>();
  const problems: string[] = [];
  // for...of reads the array's length on every step, so pairs pushed while iterating are visited too.
  for (const [explored, visit] of queue.entries()) {
    if (explored >= maxStates) {
      problems.push(
        `Příběh má víc než ${maxStates} kombinací uzlu a stavu, kontrola prošla jen část.`,
      );
      break;
    }
    const result = step(story, visit);
    problems.push(...result.problems);
    for (const key of result.used) used.add(key);
    for (const next of result.next) {
      const key = visitKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return { problems, reached: new Set(queue.map((visit) => visit.node)), used };
};

/** Choices of a reached node that no reached state offers. */
const unusedProblems = (
  node: AnyNode,
  id: string,
  used: ReadonlySet<string>,
): readonly string[] => [
  ...(node.choices ?? []).flatMap((choice, index) =>
    problemIf(
      !used.has(`${id}#${index}`),
      `Volba „${choice.label}“ v uzlu ${id} není dostupná v žádném dosažitelném stavu.`,
    ),
  ),
  ...(node.scans ?? []).flatMap((scan, index) =>
    problemIf(
      !used.has(`${id}@${index}`),
      `QR volba místa ${scan.location} v uzlu ${id} není dostupná v žádném dosažitelném stavu.`,
    ),
  ),
];

/**
 * Mistakes the type checker cannot see. Plays every reachable (node, state) pair from the start
 * and reports nodes nobody reaches, choices nobody can take, dead ends, empty screens and labels,
 * blocks that throw, bad team and location numbers and two QR choices for one location.
 */
export const validateStory = (
  story: Story,
  { maxStates = 10_000 }: ValidateOptions = {},
): readonly string[] => {
  const starts = story.order.filter((id) => story.nodes[id]!.initialState !== undefined);
  const start = starts[0];
  if (start === undefined) return ['Příběh nemá start (uzel s initialState).'];

  const known = new Set(story.locations.map((location) => location.id));
  const exploration = explore(
    story,
    { node: start, state: story.nodes[start]!.initialState! },
    maxStates,
  );
  const problems = [
    ...problemIf(
      starts.length > 1,
      `Příběh má víc startů (${starts.join(', ')}), smí mít jen jeden.`,
    ),
    ...introProblems(story),
    ...teamProblems(story),
    ...locationProblems(story),
    ...story.order.flatMap((id) => nodeProblems(story, known, id, story.nodes[id]!)),
    ...exploration.problems,
    ...story.order.flatMap((id) =>
      exploration.reached.has(id)
        ? unusedProblems(story.nodes[id]!, id, exploration.used)
        : [`Uzel ${id} je nedosažitelný ze startu.`],
    ),
  ];
  // Several states can raise the same problem; the first occurrence keeps its place.
  return [...new Set(problems)];
};
