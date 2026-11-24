import type { TeamStatus, TimeBreakdown } from '@gamebook/api';
import { describe, expect, it } from 'vitest';

import {
  formatDuration,
  playTime,
  resultsCsv,
  resultsJson,
  teamResults,
} from '@/features/admin/results';

const NOW = Date.parse('2027-05-15T10:00:00.000Z');

const finished: TeamStatus = {
  id: 1,
  name: 'Vlci',
  node: 'OUTRO',
  nodeExists: true,
  state: { coins: 30, hasMap: true, note: 'řekl; "ano"' },
  step: 9,
  finished: true,
  updatedAt: '2027-05-15T09:40:00.000Z',
  devices: 2,
  startedAt: '2027-05-15T08:00:00.000Z',
  finishedAt: '2027-05-15T09:40:12.500Z',
  playtimeMs: 6_012_500,
  storyMs: 1_230_900,
};

const running: TeamStatus = {
  id: 2,
  name: 'Lišky',
  node: 'MISTO_2',
  nodeExists: true,
  state: { coins: 10, hasMap: false },
  step: 4,
  finished: false,
  updatedAt: '2027-05-15T09:50:00.000Z',
  devices: 1,
  startedAt: '2027-05-15T09:30:00.000Z',
  // The server counted this a poll ago; the client's clock has moved on since.
  playtimeMs: 1_795_000,
  storyMs: 60_000,
};

const waiting: TeamStatus = {
  id: 3,
  name: 'Sovy',
  nodeExists: true,
  state: {},
  step: 0,
  finished: false,
  devices: 0,
  storyMs: 0,
};

describe('formatDuration', () => {
  it('counts to the second, with hours only from an hour on', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7_999)).toBe('0:07');
    expect(formatDuration(754_000)).toBe('12:34');
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(37_953_000)).toBe('10:32:33');
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});

describe('playTime', () => {
  it('is the server time for a finished team, the clock since the login for a running one', () => {
    expect(playTime(finished, NOW)).toBe(6_012_500);
    expect(playTime(running, NOW)).toBe(1_800_000);
    expect(playTime(waiting, NOW)).toBeUndefined();
  });
});

describe('teamResults', () => {
  const results = teamResults([finished, running, waiting], NOW);

  it('rounds the times down to whole seconds and keeps the state', () => {
    expect(results[0]).toEqual({
      id: 1,
      name: 'Vlci',
      nodeId: 'OUTRO',
      finished: true,
      startedAt: '2027-05-15T08:00:00.000Z',
      finishedAt: '2027-05-15T09:40:12.500Z',
      playtimeDuration: 6_012,
      storyDuration: 1_230,
      liveActionDuration: 4_781,
      chapters: {},
      stations: {},
      state: { coins: 30, hasMap: true, note: 'řekl; "ano"' },
    });
    expect(results[1]).toMatchObject({
      playtimeDuration: 1_800,
      storyDuration: 60,
      liveActionDuration: 1_740,
    });
    // Every key is there, with null for what is not known yet and zero for the durations.
    expect(results[2]).toStrictEqual({
      id: 3,
      name: 'Sovy',
      nodeId: null,
      finished: false,
      startedAt: null,
      finishedAt: null,
      playtimeDuration: 0,
      storyDuration: 0,
      liveActionDuration: 0,
      chapters: {},
      stations: {},
      state: {},
    });
  });

  it('writes JSON one can read back', () => {
    // Strict, so a key JSON leaves out (an undefined value) fails here.
    expect(JSON.parse(resultsJson(results))).toStrictEqual(results);
    const keys = (index: number) => Object.keys(JSON.parse(resultsJson(results))[index]);
    expect(keys(2)).toEqual(keys(0));
    expect(resultsJson(results)).toContain('\n  {\n    "id": 1,');
  });

  it('writes a semicolon CSV with a column per state key and quoted cells where needed', () => {
    expect(resultsCsv(results).split('\r\n')).toEqual([
      'id;team;node_id;finished;started_at;finished_at;playtime;story;live_action;playtime_s;story_s;live_action_s;state_coins;state_hasMap;state_note',
      '1;Vlci;OUTRO;true;2027-05-15T08:00:00.000Z;2027-05-15T09:40:12.500Z;1:40:12;20:30;1:19:41;6012;1230;4781;30;true;"řekl; ""ano"""',
      '2;Lišky;MISTO_2;false;2027-05-15T09:30:00.000Z;;30:00;1:00;29:00;1800;60;1740;10;false;',
      '3;Sovy;;false;;;0:00;0:00;0:00;0;0;0;;;',
      '',
    ]);
  });

  it('adds the chapters and stations of the breakdown, zero where a team has none', () => {
    const breakdown: TimeBreakdown = {
      chapters: [
        { id: 'shop', name: 'Nákup' },
        { id: '', name: 'Bez kapitoly' },
      ],
      stations: [{ id: 'bakery', name: 'Pekárna' }],
      teams: [
        {
          id: 1,
          chapters: { shop: { storyMs: 60_500, travelMs: 120_000, taskMs: 300_900 } },
          stations: { bakery: { travelMs: 120_000, taskMs: 300_900 } },
          nodes: {},
        },
      ],
    };
    const split = teamResults([finished, waiting], NOW, breakdown);
    expect(split[0]!.chapters).toEqual({
      shop: { duration: 480, storyDuration: 60, travelDuration: 120, taskDuration: 300 },
      '': { duration: 0, storyDuration: 0, travelDuration: 0, taskDuration: 0 },
    });
    expect(split[1]!.stations).toEqual({ bakery: { travelDuration: 0, taskDuration: 0 } });
    const [header, first] = resultsCsv(split).split('\r\n');
    expect(header).toContain(
      'live_action_s;chapter_shop_s;chapter_shop_story_s;chapter_shop_travel_s;chapter_shop_task_s;no_chapter_s;no_chapter_story_s;no_chapter_travel_s;no_chapter_task_s;station_bakery_travel_s;station_bakery_task_s;state_coins',
    );
    expect(first).toContain(';4781;480;60;120;300;0;0;0;0;120;300;30;');
  });
});
