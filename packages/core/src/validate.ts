import { availableChoices, availableScans, introScreens, mergeState, screensOf } from './engine.ts';
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
 * Mistakes the type checker cannot see. Plays every reachable (node, state) pair from the start
 * and reports nodes nobody reaches, choices nobody can take, dead ends, empty screens and labels,
 * blocks that throw, bad team and location numbers and two QR choices for one location.
 */
export const validateStory = (story: Story, { maxStates = 10_000 }: ValidateOptions = {}) => {
  const problems: string[] = [];
  const report = (problem: string) => {
    if (!problems.includes(problem)) problems.push(problem);
  };

  const starts = story.order.filter((id) => story.nodes[id]!.initialState !== undefined);
  if (starts.length === 0) return ['Příběh nemá start (uzel s initialState).'];
  if (starts.length > 1) report(`Příběh má víc startů (${starts.join(', ')}), smí mít jen jeden.`);

  if (story.intro.length === 0) report('Příběh nemá úvod (intro).');
  introScreens(story).forEach((screen, index) => {
    if (screen.content.trim() === '') report(`Úvod má prázdnou obrazovku č. ${index + 1}.`);
  });

  if (story.teams.length === 0) report('Příběh nemá žádný tým.');
  for (const { id, name } of story.teams) {
    if (!Number.isInteger(id) || id <= 0) report(`Tým „${name}“ má neplatné číslo ${id}.`);
    if (name.trim() === '') report(`Tým ${id} nemá název.`);
  }

  const known = new Set(story.locations.map((location) => location.id));
  for (const { id, name } of story.locations) {
    if (!Number.isInteger(id) || id <= 0) report(`Místo „${name}“ má neplatné číslo ${id}.`);
    if (name.trim() === '') report(`Místo ${id} nemá název.`);
  }
  const scanned = new Set(
    story.order.flatMap((id) => story.nodes[id]!.scans ?? []).map((s) => s.location),
  );
  for (const { id, name } of story.locations) {
    if (!scanned.has(id)) report(`Místo ${id} („${name}“) nepoužívá žádná QR volba.`);
  }

  for (const id of story.order) {
    const labels = new Set<string>();
    for (const { location, goto } of story.nodes[id]!.scans ?? []) {
      if (!known.has(location))
        report(`QR volba v uzlu ${id} vede přes neznámé místo ${location}.`);
      if (!Object.hasOwn(story.nodes, goto))
        report(`QR volba místa ${location} v uzlu ${id} vede na neexistující uzel ${goto}.`);
    }
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
  enqueue(starts[0]!, story.nodes[starts[0]!]!.initialState!);

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
      });
    } catch (error) {
      report(`Obsah uzlu ${id} ve stavu ${show(state)} spadl: ${message(error)}`);
    }

    if (node.end === true) continue;
    let available;
    try {
      available = [
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
    } catch (error) {
      report(`Podmínka volby v uzlu ${id} ve stavu ${show(state)} spadla: ${message(error)}`);
      continue;
    }
    if (available.length === 0)
      report(`Uzel ${id} je ve stavu ${show(state)} slepá ulička: žádná volba není dostupná.`);
    const locations = new Set<number>();
    for (const { transition } of available) {
      if (!('location' in transition)) continue;
      if (locations.has(transition.location))
        report(
          `Uzel ${id} má ve stavu ${show(state)} dvě QR volby pro místo ${transition.location}.`,
        );
      locations.add(transition.location);
    }
    for (const { transition, key, name } of available) {
      usedChoices.add(key);
      if (!Object.hasOwn(story.nodes, transition.goto)) continue;
      try {
        enqueue(transition.goto, mergeState(state, transition.nextState?.(state)));
      } catch (error) {
        report(`nextState ${name} v uzlu ${id} spadl: ${message(error)}`);
      }
    }
  }

  for (const id of story.order) {
    if (!visited.has(id)) {
      report(`Uzel ${id} je nedosažitelný ze startu.`);
      continue;
    }
    (story.nodes[id]!.choices ?? []).forEach((choice, index) => {
      if (!usedChoices.has(`${id}#${index}`))
        report(`Volba „${choice.label}“ v uzlu ${id} není dostupná v žádném dosažitelném stavu.`);
    });
    (story.nodes[id]!.scans ?? []).forEach((scan, index) => {
      if (!usedChoices.has(`${id}@${index}`))
        report(
          `QR volba místa ${scan.location} v uzlu ${id} není dostupná v žádném dosažitelném stavu.`,
        );
    });
  }

  return problems;
};
