import { defineStory } from '@gamebook/core';
import { describe, expect, it } from 'vitest';

import type { MoveRow, TeamRow } from '../src/server/store.ts';
import { gapKey, teamTimeline } from '../src/server/team-timeline.ts';

// The introduction does not count; the way between the two chapters belongs to none.
const story = defineStory<{ readonly n: number }>()({
  teams: { 1: 'Vlci', 2: 'Lišky' },
  codes: { 1: 'Rozcestí', 2: 'Studna' },
  chapters: { intro: { name: 'Úvod', counts: false }, one: 'První', two: 'Druhá' },
  introNode: 'INTRO',
  outroNode: 'OUTRO',
  nodes: {
    INTRO: { segments: ['Úvod'] },
    A: {
      chapter: 'intro',
      initialState: { n: 0 },
      segments: ['A'],
      choices: [{ label: 'Dál', goto: 'B' }],
    },
    B: { chapter: 'one', segments: ['B'], scans: [{ code: 1, goto: 'C' }] },
    C: { chapter: 'one', segments: ['C'], scans: [{ code: 2, goto: 'WAY' }] },
    WAY: { segments: ['Cesta'], choices: [{ label: 'Dál', goto: 'D' }] },
    D: { chapter: 'two', segments: ['D'], choices: [{ label: 'Konec', goto: 'OUTRO' }] },
    OUTRO: { segments: ['Konec'] },
  },
});

const T0 = Date.UTC(2027, 4, 1, 9);
const at = (seconds: number) => new Date(T0 + seconds * 1000);

const team = (finishedAt?: number): TeamRow => ({
  id: 1,
  node: 'D',
  state: { n: 0 },
  revision: 5,
  startedAt: at(0),
  finishedAt: finishedAt === undefined ? undefined : at(finishedAt),
  updatedAt: at(0),
});

const move = (seconds: number, action: string, toNode: string | undefined): MoveRow => ({
  teamId: 1,
  at: at(seconds),
  action,
  toNode,
});

// Sent to the start before the login, then through the introduction, the first chapter, the way
// and the second chapter to the end.
const LOG: readonly MoveRow[] = [
  move(-1000, 'start', 'A'),
  move(60, 'choice:0', 'B'),
  move(200, 'scan:1', 'C'),
  move(400, 'scan:2', 'WAY'),
  move(550, 'choice:0', 'D'),
  move(700, 'choice:0', 'OUTRO'),
  // Another team's steps do not count.
  { ...move(50, 'scan:2', 'WAY'), teamId: 2 },
];

const seconds = (map: ReadonlyMap<string, number>) =>
  Object.fromEntries([...map].map(([key, ms]) => [key, ms / 1000]));

describe('teamTimeline', () => {
  it('measures each chapter and the gaps between them, and leaves out what does not count', () => {
    const timeline = teamTimeline(story, team(700), LOG, T0 + 10_000_000);
    // Two steps within the first chapter make one stretch of it.
    expect(seconds(timeline.chapters)).toEqual({ intro: 60, one: 340, two: 150 });
    expect(seconds(timeline.gaps)).toEqual({ [gapKey({ from: 'one', to: 'two' })]: 150 });
    expect(timeline.gapsSeen).toEqual([{ from: 'one', to: 'two' }]);
    // The total is 700 s; the introduction's 60 s do not count.
    expect(timeline.resultMs).toBe(640_000);
    expect(timeline.phase).toBeUndefined();
  });

  it('counts up to now for a team on its way and tells where it is', () => {
    const introduced = teamTimeline(story, team(), LOG.slice(0, 1), T0 + 30_000);
    expect(introduced.phase).toEqual({ chapter: 'intro', counts: false, since: at(0) });
    // Nothing counts yet: the team is in the introduction.
    expect(introduced.resultMs).toBe(0);

    const walking = teamTimeline(story, team(), LOG.slice(0, 4), T0 + 450_000);
    expect(walking.phase).toEqual({ chapter: undefined, counts: true, since: at(400) });
    // The way leads to no chapter yet.
    expect(seconds(walking.gaps)).toEqual({ [gapKey({ from: 'one', to: '' })]: 50 });
    expect(walking.resultMs).toBe(390_000);
  });

  it('credits the moment between the first login and the start to the start node', () => {
    // A first login records the start before the team is moved to the start node.
    const log = [move(2, 'start', 'A'), move(100, 'choice:0', 'B')];
    const timeline = teamTimeline(story, team(), log, T0 + 200_000);
    expect(seconds(timeline.chapters)).toEqual({ intro: 100, one: 100 });
    expect(timeline.gaps.size).toBe(0);
  });

  it('sums a chapter the team came back to and keeps the gaps apart', () => {
    // The admin moved the team back from the way to the first chapter.
    const log = [...LOG.slice(0, 4), move(450, 'admin', 'C'), move(500, 'scan:2', 'WAY')];
    const timeline = teamTimeline(story, team(), log, T0 + 600_000);
    expect(seconds(timeline.chapters)).toEqual({ intro: 60, one: 390 });
    expect(seconds(timeline.gaps)).toEqual({
      [gapKey({ from: 'one', to: 'one' })]: 50,
      [gapKey({ from: 'one', to: '' })]: 100,
    });
  });

  it('has nothing for a team that has not logged in', () => {
    const timeline = teamTimeline(story, { ...team(), startedAt: undefined }, LOG, T0);
    expect(timeline.chapters.size).toBe(0);
    expect(timeline.resultMs).toBe(0);
    expect(timeline.phase).toBeUndefined();
  });
});
