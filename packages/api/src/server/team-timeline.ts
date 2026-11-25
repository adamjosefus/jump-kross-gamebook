import type { Story } from '@gamebook/core';

import type { StepRow, StoryIntervalRow, TeamRow } from './store.ts';

/** How a stretch of the team's time is spent. */
export interface TimeSplit {
  /** A text of the story was on at least one of the team's devices. */
  readonly storyMs: number;
  /** On the way: between the story and a station's task, navigation codes included. */
  readonly travelMs: number;
  /** At a station: from its arrival code to its reward code, reading left out. */
  readonly taskMs: number;
}

/** The time of one station: its task and the way to it. */
export interface StationTime {
  readonly travelMs: number;
  readonly taskMs: number;
}

/** What the team is doing now, from its last scan; it says nothing about reading. */
export type Phase =
  | { readonly kind: 'travel'; readonly since: Date }
  | { readonly kind: 'task'; readonly station: string; readonly since: Date };

export interface TeamTimeline {
  /** By chapter id; nodes without a chapter count under `NO_CHAPTER`. */
  readonly chapters: ReadonlyMap<string, TimeSplit>;
  /** By station id; only stations the team has been on its way to or at. */
  readonly stations: ReadonlyMap<string, StationTime>;
  /** Reading by node id. */
  readonly nodes: ReadonlyMap<string, number>;
  /** Missing before the first login and after the end. */
  readonly phase: Phase | undefined;
}

/** The chapter key of nodes that belong to none. */
export const NO_CHAPTER = '';

/** A stretch of reading credited to one node; reading stretches never overlap. */
interface Reading {
  readonly from: number;
  readonly to: number;
  readonly node: string;
}

/**
 * The team's reading as stretches that do not overlap. Phones of one team often show a text at
 * the same moment, and that is one team reading: the earlier stretch keeps the time, the later
 * one counts only past it.
 */
const readingOf = (intervals: readonly StoryIntervalRow[]): readonly Reading[] =>
  intervals
    .toSorted((first, second) => first.startedAt.getTime() - second.startedAt.getTime())
    .reduce<{ readonly stretches: readonly Reading[]; readonly coveredTo: number }>(
      ({ stretches, coveredTo }, interval) => {
        const from = Math.max(interval.startedAt.getTime(), coveredTo);
        const to = interval.endedAt.getTime();
        return to <= from
          ? { stretches, coveredTo }
          : { stretches: [...stretches, { from, to, node: interval.node }], coveredTo: to };
      },
      { stretches: [], coveredTo: Number.NEGATIVE_INFINITY },
    ).stretches;

/** Where the team is and what it does, as the log has it at some moment. */
interface Position {
  readonly node: string | undefined;
  /** The station whose task runs; undefined on the way. */
  readonly station: string | undefined;
  /** When the current phase began. */
  readonly since: number;
}

const SCAN = /^scan:(\d+)$/;

/**
 * The station whose task a team at `node` is doing: the one whose reward code the node waits
 * for. Undefined for a node that waits for no reward.
 */
const taskStationOf = (story: Story, node: string | undefined): string | undefined => {
  const scans = node === undefined ? undefined : story.nodes[node]?.scans;
  return scans
    ?.map((scan) => story.codes.find((qrCode) => qrCode.id === scan.code))
    .find((qrCode) => qrCode?.role === 'reward')?.station;
};

/**
 * Whether the row takes the team somewhere else than its own steps would: back to the start, or
 * to another node by the admin. An admin's fix of the state alone leaves the team where it is.
 */
const isJump = (position: Position, row: StepRow) =>
  row.action === 'reset' ||
  row.action === 'start' ||
  (row.action === 'admin' && (row.toNode ?? position.node) !== position.node);

/** The position after a step of the log. */
const step = (story: Story, position: Position, row: StepRow): Position => {
  const at = row.at.getTime();
  const node = row.toNode ?? position.node;
  // A jump ends whatever the team was doing. Where it lands tells what it does next: at a node
  // that waits for a station's reward (the admin moved it there, say, because the arrival card
  // could not be read) the station's task runs, anywhere else the team is on its way.
  if (isJump(position, row)) return { node, station: taskStationOf(story, node), since: at };
  const scanned = SCAN.exec(row.action)?.[1];
  const code =
    scanned === undefined ? undefined : story.codes.find((qrCode) => qrCode.id === Number(scanned));
  if (code?.role === 'arrival') return { node, station: code.station, since: at };
  // Only the reward of the station whose task runs ends it.
  if (code?.role === 'reward' && code.station === position.station)
    return { node, station: undefined, since: at };
  return { ...position, node };
};

const ZERO: TimeSplit = { storyMs: 0, travelMs: 0, taskMs: 0 };

const add = <K>(map: Map<K, TimeSplit>, key: K, kind: keyof TimeSplit, ms: number): void => {
  if (ms <= 0) return;
  const current = map.get(key) ?? ZERO;
  map.set(key, { ...current, [kind]: current[kind] + ms });
};

/**
 * Splits the team's time from its first login until its end (or `now`) into reading, the way and
 * the stations' tasks. Reading wins where it overlaps the others: while the team reads, its game
 * time stands still. The way counts towards the station the team arrives at next; a way that
 * leads to no station counts only in the chapters. All the parts together make the team's total
 * time, and the reading makes its reading time.
 */
export const teamTimeline = (
  story: Story,
  team: TeamRow,
  log: readonly StepRow[],
  intervals: readonly StoryIntervalRow[],
  now: number,
): TeamTimeline => {
  const chapters = new Map<string, TimeSplit>();
  const stations = new Map<string, StationTime>();
  const nodes = new Map<string, number>();
  if (team.startedAt === undefined) return { chapters, stations, nodes, phase: undefined };

  const start = team.startedAt.getTime();
  const end = Math.max(team.finishedAt?.getTime() ?? now, start);
  const chapterOf = (node: string | undefined) =>
    (node === undefined ? undefined : story.nodes[node]?.chapter) ?? NO_CHAPTER;
  const rows = log
    .filter((row) => row.teamId === team.id)
    .toSorted((first, second) => first.at.getTime() - second.at.getTime());
  const reading = readingOf(intervals.filter((interval) => interval.teamId === team.id));

  const replayed = rows
    .filter((row) => row.at.getTime() <= start)
    .reduce<Position>((position, row) => step(story, position, row), {
      node: undefined,
      station: undefined,
      since: start,
    });
  // The first login records the start a moment before the team is moved to the start node, so
  // that moment belongs to the node the team arrives at first.
  const atStart: Position =
    replayed.node !== undefined
      ? replayed
      : { ...replayed, node: rows.find((row) => row.toNode !== undefined)?.toNode };
  // The way to the next station, waiting for the arrival that tells which station it is.
  let way = 0;

  /** Credits the time from `from` to `to`, spent in one position. */
  const credit = (from: number, to: number, position: Position) => {
    if (to <= from) return;
    let read = 0;
    for (const stretch of reading) {
      const ms = Math.min(stretch.to, to) - Math.max(stretch.from, from);
      if (ms <= 0) continue;
      read += ms;
      // A device that reported no node is credited where the log has the team.
      const node = stretch.node === '' ? position.node : stretch.node;
      add(chapters, chapterOf(node), 'storyMs', ms);
      if (node !== undefined) nodes.set(node, (nodes.get(node) ?? 0) + ms);
    }
    const rest = to - from - read;
    const chapter = chapterOf(position.node);
    if (position.station === undefined) {
      add(chapters, chapter, 'travelMs', rest);
      way += rest;
    } else {
      add(chapters, chapter, 'taskMs', rest);
      const current = stations.get(position.station) ?? { travelMs: 0, taskMs: 0 };
      stations.set(position.station, { ...current, taskMs: current.taskMs + rest });
    }
  };

  let position: Position = { ...atStart, since: Math.max(atStart.since, start) };
  let cursor = start;
  for (const row of rows) {
    const at = row.at.getTime();
    if (at <= start || at > end) continue;
    credit(cursor, at, position);
    const next = step(story, position, row);
    // A way cut short by a jump led to no station: the next one gets only the way from here.
    if (isJump(position, row) && next.station === undefined) way = 0;
    if (next.station !== undefined && next.station !== position.station) {
      const current = stations.get(next.station) ?? { travelMs: 0, taskMs: 0 };
      stations.set(next.station, { ...current, travelMs: current.travelMs + way });
      way = 0;
    }
    position = next;
    cursor = at;
  }
  credit(cursor, end, position);

  const phase: Phase | undefined =
    team.finishedAt !== undefined
      ? undefined
      : position.station === undefined
        ? { kind: 'travel', since: new Date(position.since) }
        : { kind: 'task', station: position.station, since: new Date(position.since) };
  return { chapters, stations, nodes, phase };
};
