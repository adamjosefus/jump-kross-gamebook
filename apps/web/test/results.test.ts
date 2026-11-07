import type { TeamStatus } from '@gamebook/api';
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
  playMs: 6_012_500,
  readingMs: 1_230_900,
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
  playMs: 1_795_000,
  readingMs: 60_000,
};

const waiting: TeamStatus = {
  id: 3,
  name: 'Sovy',
  nodeExists: true,
  state: {},
  step: 0,
  finished: false,
  devices: 0,
  readingMs: 0,
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
      node: 'OUTRO',
      finished: true,
      startedAt: '2027-05-15T08:00:00.000Z',
      finishedAt: '2027-05-15T09:40:12.500Z',
      playSeconds: 6_012,
      readingSeconds: 1_230,
      otherSeconds: 4_781,
      state: { coins: 30, hasMap: true, note: 'řekl; "ano"' },
    });
    expect(results[1]).toMatchObject({
      playSeconds: 1_800,
      readingSeconds: 60,
      otherSeconds: 1_740,
    });
    expect(results[2]).toMatchObject({
      node: undefined,
      playSeconds: undefined,
      readingSeconds: 0,
      otherSeconds: undefined,
    });
  });

  it('writes JSON one can read back', () => {
    expect(JSON.parse(resultsJson(results))).toEqual(results);
    expect(resultsJson(results)).toContain('\n  {\n    "id": 1,');
  });

  it('writes a semicolon CSV with a column per state key and quoted cells where needed', () => {
    expect(resultsCsv(results).split('\r\n')).toEqual([
      'id;tym;uzel;v_cili;zacatek;konec;hra;cteni;mimo_cteni;hra_s;cteni_s;mimo_cteni_s;stav_coins;stav_hasMap;stav_note',
      '1;Vlci;OUTRO;ano;2027-05-15T08:00:00.000Z;2027-05-15T09:40:12.500Z;1:40:12;20:30;1:19:41;6012;1230;4781;30;true;"řekl; ""ano"""',
      '2;Lišky;MISTO_2;ne;2027-05-15T09:30:00.000Z;;30:00;1:00;29:00;1800;60;1740;10;false;',
      '3;Sovy;;ne;;;;0:00;;;0;;;;',
      '',
    ]);
  });
});
