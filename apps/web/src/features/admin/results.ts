import { gapKey, type ChapterGap, type TeamStatus, type TimeBreakdown } from '@gamebook/api';
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
 * When the times are read: `now` and when the server measured them (`measuredAt`), both by this
 * browser's clock, and whether the game is closed, which stops every team's clock.
 */
export interface Clock {
  readonly now: number;
  readonly measuredAt: number;
  readonly paused: boolean;
}

/**
 * How much a running team's times have grown since the server measured them: nothing for a team
 * at the end or while the game is closed. Both ends are read from this browser's clock, so a clock
 * that is off does not show.
 */
export const sinceMeasured = (team: TeamStatus, clock: Clock) =>
  team.finishedAt !== undefined || clock.paused ? 0 : Math.max(clock.now - clock.measuredAt, 0);

/**
 * The team's play time as of `clock.now`: the server's, moved on for a running team, so it ticks
 * every second rather than every poll. Undefined before the first login.
 */
export const playTime = (team: TeamStatus, clock: Clock) =>
  team.startedAt === undefined ? undefined : (team.playtimeMs ?? 0) + sinceMeasured(team, clock);

/**
 * The team's result as of `clock.now`: its total time without the chapters that do not count. It
 * ticks with the play time, unless the team is in a chapter that does not count, where it stands.
 * Undefined before the first login.
 */
export const resultTime = (team: TeamStatus, clock: Clock) =>
  team.startedAt === undefined || team.resultMs === undefined
    ? undefined
    : team.resultMs + (team.phase?.counts === false ? 0 : sinceMeasured(team, clock));

/** The name of a gap in the results: `home>shopping`, with `start` and `end` for none. */
export const gapName = ({ from, to }: ChapterGap) => `${from || 'start'}>${to || 'end'}`;

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
  /** Whole seconds from the first login to the end, or until now; zero before the first login. */
  readonly playtimeDuration: number;
  /** Whole seconds of play time without the chapters that do not count: what the team is ranked by. */
  readonly resultDuration: number;
  /** Whole seconds by chapter id, every chapter of the story. */
  readonly chapters: Readonly<Record<string, number>>;
  /** Whole seconds by gap (`gapName`), every gap some team went through. */
  readonly gaps: Readonly<Record<string, number>>;
  readonly state: Readonly<Record<string, Value>>;
}

const seconds = (ms: number) => Math.max(0, Math.floor(ms / 1000));

/**
 * The results of the teams; the chapters and gaps come from `breakdown`, none without it. The
 * breakdown is as of its own fetch, so a running team's parts may lag its total a little.
 */
export const teamResults = (
  teams: readonly TeamStatus[],
  clock: Clock,
  breakdown?: TimeBreakdown,
): readonly TeamResult[] =>
  teams.map((team) => {
    const times = breakdown?.teams.find((entry) => entry.id === team.id);
    return {
      id: team.id,
      name: team.name,
      nodeId: team.node ?? null,
      finished: team.finished,
      startedAt: team.startedAt ?? null,
      finishedAt: team.finishedAt ?? null,
      playtimeDuration: seconds(playTime(team, clock) ?? 0),
      resultDuration: seconds(resultTime(team, clock) ?? 0),
      chapters: Object.fromEntries(
        (breakdown?.chapters ?? []).map(({ id }) => [id, seconds(times?.chapters[id] ?? 0)]),
      ),
      gaps: Object.fromEntries(
        (breakdown?.gaps ?? []).map((gap) => [
          gapName(gap),
          seconds(times?.gaps[gapKey(gap)] ?? 0),
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
 * The results as a table, one row per team: the total and the result both as `h:mm:ss` and as
 * whole seconds, one column per chapter (`chapter_<id>_s`) and per gap (`gap_<from>_<to>_s`, with
 * `start` and `end`), then one column per key of the state. The column names are English, as the
 * JSON's keys are, though not the same ones: a table has `team` and `playtime_s` where the JSON has
 * `name` and `playtimeDuration`. Separated by semicolons, which is what a Czech Excel expects, and
 * ended with CRLF.
 */
export const resultsCsv = (results: readonly TeamResult[]) => {
  const stateKeys = [...new Set(results.flatMap((result) => Object.keys(result.state)))];
  const chapterIds = Object.keys(results[0]?.chapters ?? {});
  const gapNames = Object.keys(results[0]?.gaps ?? {});
  const header = [
    'id',
    'team',
    'node_id',
    'finished',
    'started_at',
    'finished_at',
    'playtime',
    'result',
    'playtime_s',
    'result_s',
    ...chapterIds.map((id) => `chapter_${id}_s`),
    ...gapNames.map((name) => `gap_${name.replace('>', '_')}_s`),
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
    formatted(result.resultDuration),
    result.playtimeDuration,
    result.resultDuration,
    ...chapterIds.map((id) => result.chapters[id]),
    ...gapNames.map((name) => result.gaps[name]),
    ...stateKeys.map((key) => result.state[key]),
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n';
};
