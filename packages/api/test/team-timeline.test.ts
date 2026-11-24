import { defineStory } from '@gamebook/core';
import { describe, expect, it } from 'vitest';

import type { LogRow, StoryIntervalRow, TeamRow } from '../src/server/store.ts';
import { NO_CHAPTER, teamTimeline } from '../src/server/team-timeline.ts';

const story = defineStory<{ readonly n: number }>()({
  teams: { 1: 'Vlci', 2: 'Lišky' },
  codes: {
    1: 'Rozcestí',
    2: { name: 'Studna', role: 'arrival', station: 'well' },
    3: { name: 'Studnař', role: 'reward', station: 'well' },
  },
  stations: { well: 'Studna' },
  chapters: { one: 'První', two: 'Druhá' },
  introNode: 'INTRO',
  outroNode: 'OUTRO',
  nodes: {
    INTRO: { blocks: ['Úvod'] },
    A: { chapter: 'one', initialState: { n: 0 }, blocks: ['A'], scans: [{ code: 1, goto: 'B' }] },
    B: { chapter: 'one', blocks: ['B'], scans: [{ code: 2, goto: 'C' }] },
    C: { chapter: 'two', blocks: ['C'], scans: [{ code: 3, goto: 'D' }] },
    D: { blocks: ['D'], choices: [{ label: 'Konec', goto: 'OUTRO' }] },
    OUTRO: { blocks: ['Konec'] },
  },
});

const T0 = Date.UTC(2027, 4, 1, 9);
const at = (seconds: number) => new Date(T0 + seconds * 1000);

const team = (finishedAt?: number): TeamRow => ({
  id: 1,
  node: 'D',
  state: { n: 0 },
  step: 4,
  startedAt: at(0),
  finishedAt: finishedAt === undefined ? undefined : at(finishedAt),
  updatedAt: at(0),
});

const move = (seconds: number, action: string, toNode: string | undefined): LogRow => ({
  teamId: 1,
  at: at(seconds),
  action,
  fromNode: undefined,
  toNode,
  state: { n: 0 },
});

// Sent to the start before the login, then a navigation code, the arrival, the reward and the end.
const LOG: readonly LogRow[] = [
  move(-1000, 'start', 'A'),
  move(100, 'scan:1', 'B'),
  move(300, 'scan:2', 'C'),
  move(600, 'scan:3', 'D'),
  move(700, 'choice:0', 'OUTRO'),
  // Another team's steps do not count.
  { ...move(50, 'scan:2', 'C'), teamId: 2 },
];

const read = (from: number, to: number, node: string, teamId = 1): StoryIntervalRow => ({
  teamId,
  node,
  startedAt: at(from),
  endedAt: at(to),
});

// Two phones reading A at once are 30 s, not 40 s.
const READING: readonly StoryIntervalRow[] = [
  read(0, 20, 'A'),
  read(10, 30, 'A'),
  read(310, 340, 'C'),
  read(600, 650, 'D'),
  read(0, 500, 'A', 2),
];

const seconds = (map: ReadonlyMap<string, unknown>) =>
  JSON.parse(
    JSON.stringify(Object.fromEntries(map), (_key, value: unknown) =>
      typeof value === 'number' ? value / 1000 : value,
    ),
  ) as unknown;

describe('teamTimeline', () => {
  it('splits the game into reading, the way and the task', () => {
    const timeline = teamTimeline(story, team(700), LOG, READING, T0 + 10_000_000);
    expect(seconds(timeline.nodes)).toEqual({ A: 30, C: 30, D: 50 });
    expect(seconds(timeline.chapters)).toEqual({
      one: { storyMs: 30, travelMs: 270, taskMs: 0 },
      two: { storyMs: 30, travelMs: 0, taskMs: 270 },
      [NO_CHAPTER]: { storyMs: 50, travelMs: 50, taskMs: 0 },
    });
    // The way from the start to the station, reading left out, counts towards it.
    expect(seconds(timeline.stations)).toEqual({ well: { travelMs: 270, taskMs: 270 } });
    expect(timeline.phase).toBeUndefined();

    // Together the parts are the total time, and the reading the reading time.
    const parts = [...timeline.chapters.values()];
    const total = parts.reduce((sum, part) => sum + part.storyMs + part.travelMs + part.taskMs, 0);
    expect(total).toBe(700_000);
    expect(parts.reduce((sum, part) => sum + part.storyMs, 0)).toBe(110_000);
  });

  it('counts up to now for a team on its way and tells its phase', () => {
    const now = T0 + 400_000;
    const playing = teamTimeline(story, team(), LOG.slice(0, 3), READING, now);
    expect(playing.phase).toEqual({ kind: 'task', station: 'well', since: at(300) });
    expect(seconds(playing.chapters)).toEqual({
      one: { storyMs: 30, travelMs: 270, taskMs: 0 },
      two: { storyMs: 30, travelMs: 0, taskMs: 70 },
    });

    const walking = teamTimeline(story, team(), LOG.slice(0, 2), [], T0 + 200_000);
    expect(walking.phase).toEqual({ kind: 'travel', since: at(0) });
    // No arrival yet: the way belongs to no station.
    expect(walking.stations.size).toBe(0);
  });

  it('ends the task when the admin moves the team on', () => {
    // The reward card got lost, so the admin moved the team past the station.
    const log = [...LOG.slice(0, 3), move(400, 'admin', 'D')];
    const moved = teamTimeline(story, team(), log, [], T0 + 1_000_000);
    expect(moved.phase).toEqual({ kind: 'travel', since: at(400) });
    expect(seconds(moved.stations)).toEqual({ well: { travelMs: 300, taskMs: 100 } });
  });

  it('credits the moment between the first login and the start to the start node', () => {
    // A first login records the start before the team is moved to the start node.
    const log = [move(2, 'start', 'A'), move(100, 'scan:1', 'B')];
    const timeline = teamTimeline(story, team(), log, [read(0, 1, '')], T0 + 200_000);
    expect([...timeline.chapters.keys()]).toEqual(['one']);
    expect(seconds(timeline.nodes)).toEqual({ A: 1 });
  });

  it('has nothing for a team that has not logged in', () => {
    const timeline = teamTimeline(story, { ...team(), startedAt: undefined }, LOG, READING, T0);
    expect(timeline.chapters.size).toBe(0);
    expect(timeline.phase).toBeUndefined();
  });
});
