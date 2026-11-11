import type { TeamStatus } from '@gamebook/api';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEAM_SORT,
  readTeamSort,
  sortOptions,
  sortTeams,
  type TeamSort,
} from '@/features/admin/team-sort';

const NOW = Date.parse('2027-05-15T10:00:00.000Z');

const team = (id: number, name: string, rest: Partial<TeamStatus> = {}): TeamStatus => ({
  id,
  name,
  nodeExists: true,
  state: {},
  step: 0,
  finished: false,
  devices: 0,
  storyMs: 0,
  ...rest,
});

/** Finished after `playtimeMs`, of which `storyMs` was reading. */
const played = (
  id: number,
  name: string,
  playtimeMs: number,
  storyMs: number,
  state: TeamStatus['state'],
) =>
  team(id, name, {
    startedAt: '2027-05-15T08:00:00.000Z',
    finishedAt: new Date(Date.parse('2027-05-15T08:00:00.000Z') + playtimeMs).toISOString(),
    finished: true,
    playtimeMs,
    storyMs,
    state,
  });

const teams = [
  played(1, 'Klan 10', 3_000_000, 600_000, { coins: 5, hasMap: true }),
  played(2, 'Klan 2', 2_000_000, 1_500_000, { coins: 30, hasMap: false }),
  // Never logged in: no time and an empty state.
  team(3, 'Čápi'),
  played(4, 'Zubři', 2_500_000, 100_000, { coins: 5, note: 'b' }),
];

const ids = (sort: TeamSort) => sortTeams(teams, sort, NOW).map(({ id }) => id);

describe('sortTeams', () => {
  it('keeps the order of the story by default', () => {
    expect(ids(DEFAULT_TEAM_SORT)).toEqual([1, 2, 3, 4]);
    expect(ids({ key: 'order', direction: 'desc' })).toEqual([4, 3, 2, 1]);
  });

  it('orders names the Czech way, numbers in them by value', () => {
    expect(ids({ key: 'name', direction: 'asc' })).toEqual([3, 2, 1, 4]);
    expect(ids({ key: 'name', direction: 'desc' })).toEqual([4, 1, 2, 3]);
  });

  it('orders by each of the three times, a team without a time last either way', () => {
    expect(ids({ key: 'playtime', direction: 'asc' })).toEqual([2, 4, 1, 3]);
    expect(ids({ key: 'playtime', direction: 'desc' })).toEqual([1, 4, 2, 3]);
    expect(ids({ key: 'story', direction: 'asc' })).toEqual([4, 1, 2, 3]);
    expect(ids({ key: 'story', direction: 'desc' })).toEqual([2, 1, 4, 3]);
    // Play without reading: 2 400 s, 500 s and 2 400 s; the tie keeps the story's order.
    expect(ids({ key: 'liveAction', direction: 'asc' })).toEqual([2, 1, 4, 3]);
    expect(ids({ key: 'liveAction', direction: 'desc' })).toEqual([1, 4, 2, 3]);
  });

  it('puts the teams at the end before the running ones when ordering by a time', () => {
    // A minute and two minutes on the way: both shorter than any finished team's time.
    const late = team(5, 'Běžci', { startedAt: '2027-05-15T09:59:00.000Z', playtimeMs: 0 });
    const early = team(6, 'Chodci', { startedAt: '2027-05-15T09:58:00.000Z', playtimeMs: 0 });
    const order = (sort: TeamSort) =>
      sortTeams([...teams, late, early], sort, NOW).map(({ id }) => id);
    expect(order({ key: 'playtime', direction: 'asc' })).toEqual([2, 4, 1, 5, 6, 3]);
    expect(order({ key: 'playtime', direction: 'desc' })).toEqual([1, 4, 2, 6, 5, 3]);
    // Other orders do not group them.
    expect(order({ key: 'order', direction: 'asc' })).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('orders by a key of the state, teams without the key last', () => {
    expect(ids({ key: 'state:coins', direction: 'asc' })).toEqual([1, 4, 2, 3]);
    expect(ids({ key: 'state:coins', direction: 'desc' })).toEqual([2, 1, 4, 3]);
    expect(ids({ key: 'state:hasMap', direction: 'asc' })).toEqual([2, 1, 3, 4]);
    expect(ids({ key: 'state:note', direction: 'desc' })).toEqual([4, 1, 2, 3]);
    expect(ids({ key: 'state:gone', direction: 'asc' })).toEqual([1, 2, 3, 4]);
  });
});

describe('sortOptions', () => {
  it('offers the fixed orders and every key of the state', () => {
    expect(sortOptions(teams).map(({ key }) => key)).toEqual([
      'order',
      'name',
      'playtime',
      'liveAction',
      'story',
      'state:coins',
      'state:hasMap',
      'state:note',
    ]);
  });
});

describe('readTeamSort', () => {
  it('takes a stored order and falls back to the default for anything else', () => {
    expect(readTeamSort({ key: 'state:coins', direction: 'desc' })).toEqual({
      key: 'state:coins',
      direction: 'desc',
    });
    expect(readTeamSort({ key: 'speed', direction: 'asc' })).toEqual(DEFAULT_TEAM_SORT);
    expect(readTeamSort({ key: 'name', direction: 'up' })).toEqual(DEFAULT_TEAM_SORT);
    expect(readTeamSort(null)).toEqual(DEFAULT_TEAM_SORT);
  });
});
