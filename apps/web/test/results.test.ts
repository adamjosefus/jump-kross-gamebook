import type { TeamStatus, TimeBreakdown } from '@gamebook/api';
import { describe, expect, it } from 'vitest';

import {
  formatDuration,
  playTime,
  resultsCsv,
  resultsJson,
  resultTime,
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
  // 1 231 s were in a chapter that does not count.
  resultMs: 4_781_500,
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
  resultMs: 1_735_000,
  phase: { chapter: 'shop', counts: true, since: '2027-05-15T09:45:00.000Z', ms: 895_000 },
};

const waiting: TeamStatus = {
  id: 3,
  name: 'Sovy',
  nodeExists: true,
  state: {},
  step: 0,
  finished: false,
  devices: 0,
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

describe('resultTime', () => {
  it('ticks with the play time, except in a chapter that does not count', () => {
    expect(resultTime(finished, NOW)).toBe(4_781_500);
    // The 5 s the client's clock has moved on since the poll count too.
    expect(resultTime(running, NOW)).toBe(1_740_000);
    const standing = { ...running, phase: { ...running.phase!, counts: false } };
    expect(resultTime(standing, NOW)).toBe(1_735_000);
    expect(resultTime(waiting, NOW)).toBeUndefined();
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
      resultDuration: 4_781,
      chapters: {},
      gaps: {},
      state: { coins: 30, hasMap: true, note: 'řekl; "ano"' },
    });
    expect(results[1]).toMatchObject({ playtimeDuration: 1_800, resultDuration: 1_740 });
    // Every key is there, with null for what is not known yet and zero for the durations.
    expect(results[2]).toStrictEqual({
      id: 3,
      name: 'Sovy',
      nodeId: null,
      finished: false,
      startedAt: null,
      finishedAt: null,
      playtimeDuration: 0,
      resultDuration: 0,
      chapters: {},
      gaps: {},
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
      'id;team;node_id;finished;started_at;finished_at;playtime;result;playtime_s;result_s;state_coins;state_hasMap;state_note',
      '1;Vlci;OUTRO;true;2027-05-15T08:00:00.000Z;2027-05-15T09:40:12.500Z;1:40:12;1:19:41;6012;4781;30;true;"řekl; ""ano"""',
      '2;Lišky;MISTO_2;false;2027-05-15T09:30:00.000Z;;30:00;29:00;1800;1740;10;false;',
      '3;Sovy;;false;;;0:00;0:00;0;0;;;',
      '',
    ]);
  });

  it('adds the chapters and the gaps of the breakdown, zero where a team has none', () => {
    const breakdown: TimeBreakdown = {
      chapters: [
        { id: 'home', name: 'Doma', counts: false },
        { id: 'shop', name: 'Nákup', counts: true },
      ],
      gaps: [
        { from: 'home', to: 'shop' },
        { from: 'shop', to: '' },
      ],
      teams: [
        {
          id: 1,
          chapters: { home: 1_231_000, shop: 4_000_900 },
          gaps: { 'home>shop': 780_600 },
        },
      ],
    };
    const split = teamResults([finished, waiting], NOW, breakdown);
    expect(split[0]!.chapters).toEqual({ home: 1_231, shop: 4_000 });
    expect(split[0]!.gaps).toEqual({ 'home>shop': 780, 'shop>end': 0 });
    expect(split[1]!.gaps).toEqual({ 'home>shop': 0, 'shop>end': 0 });
    const [header, first] = resultsCsv(split).split('\r\n');
    expect(header).toContain(
      'result_s;chapter_home_s;chapter_shop_s;gap_home_shop_s;gap_shop_end_s;state_coins',
    );
    expect(first).toContain(';4781;1231;4000;780;0;30;');
  });
});
