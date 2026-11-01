import { availableChoices, mergeState, screensOf } from './engine.ts';
import type { Story } from './story.ts';
import type { State } from './types.ts';

export interface ValidateOptions {
  /** Upper bound on explored (node, state) pairs; stories with counters could otherwise explode. */
  readonly maxStates?: number;
}

const stateKey = (state: State) =>
  JSON.stringify(
    Object.keys(state)
      .toSorted()
      .map((key) => [key, state[key]]),
  );

const show = (state: State) => JSON.stringify(state);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Mistakes the type checker cannot see. Plays every reachable (node, state) pair from every start
 * and reports nodes nobody reaches, choices nobody can take, dead ends, empty screens and labels,
 * blocks that throw and checkpoints that would trap a team at an end.
 */
export const validateStory = (story: Story, { maxStates = 10_000 }: ValidateOptions = {}) => {
  const problems: string[] = [];
  const report = (problem: string) => {
    if (!problems.includes(problem)) problems.push(problem);
  };

  const starts = story.order.filter((id) => story.nodes[id]!.initialState !== undefined);
  if (starts.length === 0) return ['Příběh nemá žádný start (uzel s initialState).'];

  for (const id of story.order) {
    const labels = new Set<string>();
    for (const { label, goto } of story.nodes[id]!.choices ?? []) {
      if (label.trim() === '') report(`Uzel ${id} má volbu bez popisku.`);
      else if (labels.has(label)) report(`Uzel ${id} má dvě volby „${label}“.`);
      labels.add(label);
      if (!Object.hasOwn(story.nodes, goto))
        report(`Volba „${label}“ v uzlu ${id} vede na neexistující uzel ${goto}.`);
    }
  }

  const visited = new Map<string, Set<string>>();
  const usedChoices = new Set<string>();
  const queue: { node: string; state: State }[] = [];
  let explored = 0;
  const enqueue = (node: string, state: State) => {
    const keys = visited.get(node) ?? new Set<string>();
    visited.set(node, keys);
    const key = stateKey(state);
    if (keys.has(key)) return;
    keys.add(key);
    queue.push({ node, state });
  };
  for (const id of starts) enqueue(id, story.nodes[id]!.initialState!);

  for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
    if (++explored > maxStates) {
      report(`Příběh má víc než ${maxStates} kombinací uzlu a stavu, kontrola prošla jen část.`);
      break;
    }
    const { node: id, state } = item;
    const node = story.nodes[id]!;

    try {
      const screens = screensOf(node, state);
      if (screens.length === 0) report(`Uzel ${id} nemá ve stavu ${show(state)} žádný obsah.`);
      screens.forEach((screen, index) => {
        if (screen.content.trim() === '')
          report(`Uzel ${id} má prázdnou obrazovku č. ${index + 1}.`);
        if (screen.location === undefined) return;
        if (!Number.isInteger(screen.location) || screen.location <= 0)
          report(`Checkpoint v uzlu ${id} má neplatné číslo místa ${screen.location}.`);
        if (node.end === true)
          report(`Konec ${id} obsahuje checkpoint, přes který by se tým nedostal.`);
      });
    } catch (error) {
      report(`Obsah uzlu ${id} ve stavu ${show(state)} spadl: ${message(error)}`);
    }

    if (node.end === true) continue;
    let available;
    try {
      available = availableChoices(node, state);
    } catch (error) {
      report(`Podmínka volby v uzlu ${id} ve stavu ${show(state)} spadla: ${message(error)}`);
      continue;
    }
    if (available.length === 0)
      report(`Uzel ${id} je ve stavu ${show(state)} slepá ulička: žádná volba není dostupná.`);
    for (const { choice, index } of available) {
      usedChoices.add(`${id}#${index}`);
      if (!Object.hasOwn(story.nodes, choice.goto)) continue;
      try {
        enqueue(choice.goto, mergeState(state, choice.nextState?.(state)));
      } catch (error) {
        report(`nextState volby „${choice.label}“ v uzlu ${id} spadl: ${message(error)}`);
      }
    }
  }

  for (const id of story.order) {
    if (!visited.has(id)) {
      report(`Uzel ${id} je nedosažitelný z žádného startu.`);
      continue;
    }
    (story.nodes[id]!.choices ?? []).forEach((choice, index) => {
      if (!usedChoices.has(`${id}#${index}`))
        report(`Volba „${choice.label}“ v uzlu ${id} není dostupná v žádném dosažitelném stavu.`);
    });
  }

  return problems;
};
