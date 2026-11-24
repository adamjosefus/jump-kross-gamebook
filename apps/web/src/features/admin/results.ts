import type { TeamStatus, TimeBreakdown } from '@gamebook/api';
import type { Value } from '@gamebook/core';

/** `m:ss`, and `h:mm:ss` from an hour on: the organisers compare teams to the second. */
export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
};

/**
 * The team's play time as of `now`: the server's for a finished team (exact), counted here for a
 * running one, so it ticks every second rather than every poll. Undefined before the first login.
 */
export const playTime = (team: TeamStatus, now: number) => {
  if (team.startedAt === undefined) return undefined;
  if (team.finishedAt !== undefined) return team.playtimeMs ?? 0;
  return Math.max(team.playtimeMs ?? 0, now - Date.parse(team.startedAt));
};

/**
 * One team's result, as the organisers take it away: times to the second and the state. A value
 * not known yet is null rather than missing, so every team has every key in the JSON (which
 * leaves out undefined ones) and a script reading it finds the same fields for every team. The
 * durations are always whole seconds, zero before the first login, so they add up without checks.
 */
export interface TeamResult {
  readonly id: number;
  readonly name: string;
  /** Where the team is; null for one that never logged in. */
  readonly nodeId: string | null;
  readonly finished: boolean;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  /** Whole seconds of play time; zero before the first login. */
  readonly playtimeDuration: number;
  /** Whole seconds spent reading the story. */
  readonly storyDuration: number;
  /** Whole seconds of play time outside reading: walking and puzzles; zero before the first login. */
  readonly liveActionDuration: number;
  /** By chapter id, every chapter of the story; "" holds the nodes without a chapter. */
  readonly chapters: Readonly<Record<string, ChapterResult>>;
  /** By station id, every station of the story. */
  readonly stations: Readonly<Record<string, StationResult>>;
  readonly state: Readonly<Record<string, Value>>;
}

/** Whole seconds a team spent in a chapter, in all and split as its total time is. */
export interface ChapterResult {
  readonly duration: number;
  readonly storyDuration: number;
  readonly travelDuration: number;
  readonly taskDuration: number;
}

/** Whole seconds of a station's task and of the way that led to it. */
export interface StationResult {
  readonly travelDuration: number;
  readonly taskDuration: number;
}

const seconds = (ms: number) => Math.max(0, Math.floor(ms / 1000));

/**
 * The results of the teams; the chapters and stations come from `breakdown`, all zero without
 * it. The breakdown is as of its own fetch, so a running team's parts may lag its total a little.
 */
export const teamResults = (
  teams: readonly TeamStatus[],
  now: number,
  breakdown?: TimeBreakdown,
): readonly TeamResult[] =>
  teams.map((team) => {
    const playtimeMs = playTime(team, now) ?? 0;
    const times = breakdown?.teams.find((entry) => entry.id === team.id);
    return {
      id: team.id,
      name: team.name,
      nodeId: team.node ?? null,
      finished: team.finished,
      startedAt: team.startedAt ?? null,
      finishedAt: team.finishedAt ?? null,
      playtimeDuration: seconds(playtimeMs),
      storyDuration: seconds(team.storyMs),
      liveActionDuration: seconds(playtimeMs - team.storyMs),
      chapters: Object.fromEntries(
        (breakdown?.chapters ?? []).map(({ id }) => {
          const split = times?.chapters[id];
          const storyDuration = seconds(split?.storyMs ?? 0);
          const travelDuration = seconds(split?.travelMs ?? 0);
          const taskDuration = seconds(split?.taskMs ?? 0);
          return [
            id,
            {
              duration: storyDuration + travelDuration + taskDuration,
              storyDuration,
              travelDuration,
              taskDuration,
            },
          ];
        }),
      ),
      stations: Object.fromEntries(
        (breakdown?.stations ?? []).map(({ id }) => [
          id,
          {
            travelDuration: seconds(times?.stations[id]?.travelMs ?? 0),
            taskDuration: seconds(times?.stations[id]?.taskMs ?? 0),
          },
        ]),
      ),
      state: team.state,
    };
  });

/** Pretty JSON of the results, one object per team. */
export const resultsJson = (results: readonly TeamResult[]) => JSON.stringify(results, null, 2);

/** A CSV cell: quoted when it holds the separator, a quote or a line break. */
const cell = (value: Value | null | undefined) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * The results as a table, one row per team: the times both as `h:mm:ss` and as whole seconds,
 * then one column per key of the state. The column names are English, as the JSON's keys
 * are, though not the same ones: a table has `team` and `playtime_s` where the JSON has `name` and
 * `playtimeDuration`. Separated by semicolons, which is what a Czech Excel
 * expects, and ended with CRLF.
 */
export const resultsCsv = (results: readonly TeamResult[]) => {
  const stateKeys = [...new Set(results.flatMap((result) => Object.keys(result.state)))];
  const chapterIds = Object.keys(results[0]?.chapters ?? {});
  const stationIds = Object.keys(results[0]?.stations ?? {});
  // Nodes without a chapter are the chapter "", which makes the columns `chapter_none_s` etc.
  const chapterName = (id: string) => (id === '' ? 'none' : id);
  const header = [
    'id',
    'team',
    'node_id',
    'finished',
    'started_at',
    'finished_at',
    'playtime',
    'story',
    'live_action',
    'playtime_s',
    'story_s',
    'live_action_s',
    ...chapterIds.flatMap((id) => [
      `chapter_${chapterName(id)}_s`,
      `chapter_${chapterName(id)}_story_s`,
      `chapter_${chapterName(id)}_travel_s`,
      `chapter_${chapterName(id)}_task_s`,
    ]),
    ...stationIds.flatMap((id) => [`station_${id}_travel_s`, `station_${id}_task_s`]),
    ...stateKeys.map((key) => `state_${key}`),
  ];
  const formatted = (value: number) => formatDuration(value * 1000);
  const rows = results.map((result) => [
    result.id,
    result.name,
    result.nodeId,
    result.finished,
    result.startedAt,
    result.finishedAt,
    formatted(result.playtimeDuration),
    formatted(result.storyDuration),
    formatted(result.liveActionDuration),
    result.playtimeDuration,
    result.storyDuration,
    result.liveActionDuration,
    ...chapterIds.flatMap((id) => {
      const chapter = result.chapters[id];
      return [
        chapter?.duration,
        chapter?.storyDuration,
        chapter?.travelDuration,
        chapter?.taskDuration,
      ];
    }),
    ...stationIds.flatMap((id) => [
      result.stations[id]?.travelDuration,
      result.stations[id]?.taskDuration,
    ]),
    ...stateKeys.map((key) => result.state[key]),
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n';
};
