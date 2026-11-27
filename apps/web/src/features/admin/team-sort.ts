import type { TeamStatus } from '@gamebook/api';
import type { Value } from '@gamebook/core';

import { playTime, resultTime, type Clock } from './results';

/**
 * What the live list of teams is ordered by: the story's own order, the name, the total time or the
 * result, or one key of the state (the state is flat, so a key is a column).
 */
export type TeamSortKey = 'order' | 'name' | 'playtime' | 'result' | `state:${string}`;

export type SortDirection = 'asc' | 'desc';

export interface TeamSort {
  readonly key: TeamSortKey;
  readonly direction: SortDirection;
}

export const DEFAULT_TEAM_SORT: TeamSort = { key: 'order', direction: 'asc' } as const;

const FIXED_OPTIONS = [
  { key: 'order', label: 'Pořadí' },
  { key: 'name', label: 'Název' },
  { key: 'result', label: 'Výsledný čas' },
  { key: 'playtime', label: 'Celkový čas' },
] as const satisfies readonly { readonly key: TeamSortKey; readonly label: string }[];

/** The choices of the order: the fixed ones, then every key some team has in its state. */
export const sortOptions = (
  teams: readonly TeamStatus[],
): readonly { readonly key: TeamSortKey; readonly label: string }[] => [
  ...FIXED_OPTIONS,
  ...[...new Set(teams.flatMap((team) => Object.keys(team.state)))].map((key) => ({
    key: `state:${key}` as const,
    label: `Stav: ${key}`,
  })),
];

/** A key the list can be ordered by; a key of the state may be one no team has. */
export const isTeamSortKey = (key: string): key is TeamSortKey =>
  FIXED_OPTIONS.some((option) => option.key === key) || key.startsWith('state:');

const collator = new Intl.Collator('cs', { numeric: true });

// Values of different types do not compare; they are grouped by type instead.
const typeRank = (value: Value) =>
  typeof value === 'boolean' ? 0 : typeof value === 'number' ? 1 : 2;

const compareValues = (first: Value, second: Value) => {
  if (typeof first === 'number' && typeof second === 'number') {
    return first - second;
  }
  if (typeof first === 'boolean' && typeof second === 'boolean') {
    return Number(first) - Number(second);
  }
  if (typeof first === 'string' && typeof second === 'string') {
    return collator.compare(first, second);
  }
  return typeRank(first) - typeRank(second);
};

/** What the team is ordered by; undefined when it has no such value (yet). */
const sortValue = (team: TeamStatus, key: TeamSortKey, clock: Clock): Value | undefined => {
  if (key === 'order') {
    return team.id;
  }
  if (key === 'name') {
    return team.name;
  }
  if (key.startsWith('state:')) {
    return team.state[key.slice('state:'.length)];
  }
  // A team that has not logged in has no time; zero would put it first among the fastest.
  return key === 'playtime' ? playTime(team, clock) : resultTime(team, clock);
};

const TIME_KEYS: ReadonlySet<TeamSortKey> = new Set(['playtime', 'result']);

/**
 * The teams in the chosen order. A team without the value stays at the end in both directions,
 * so the ones that have something to compare are always on top; equal teams keep the story's order.
 * By a time, the teams at the end come first, as the standings: their times are final, while the
 * clock of a team on its way still runs and would carry it through the list.
 */
export const sortTeams = (
  teams: readonly TeamStatus[],
  { key, direction }: TeamSort,
  clock: Clock,
): readonly TeamStatus[] =>
  teams
    .map((team) => ({ team, value: sortValue(team, key, clock) }))
    .toSorted((first, second) => {
      if (first.value === undefined || second.value === undefined) {
        if (first.value !== undefined) {
          return -1;
        }
        if (second.value !== undefined) {
          return 1;
        }
        return first.team.id - second.team.id;
      }
      if (TIME_KEYS.has(key) && first.team.finished !== second.team.finished) {
        return first.team.finished ? -1 : 1;
      }
      const order = compareValues(first.value, second.value);
      if (order === 0) {
        return first.team.id - second.team.id;
      }
      return direction === 'asc' ? order : -order;
    })
    .map(({ team }) => team);

/** A stored order, when it is one; the state key may no longer exist, which sorts nothing. */
export const readTeamSort = (stored: unknown): TeamSort =>
  typeof stored === 'object' &&
  stored !== null &&
  'key' in stored &&
  'direction' in stored &&
  typeof stored.key === 'string' &&
  isTeamSortKey(stored.key) &&
  (stored.direction === 'asc' || stored.direction === 'desc')
    ? { key: stored.key, direction: stored.direction }
    : DEFAULT_TEAM_SORT;
