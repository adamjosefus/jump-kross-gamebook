import type { Story } from '@gamebook/core';

import type { MoveRow, PauseRow, TeamRow } from './store.ts';
import { runningMs } from './team-time.ts';

/** A gap between two chapters: the chapter the team left and the one it came to ("" for none). */
export interface Gap {
  readonly from: string;
  readonly to: string;
}

/** Where the team is now: in a chapter or between two, since when, and whether that counts. */
export interface Phase {
  /** Undefined between chapters. */
  readonly chapter: string | undefined;
  readonly counts: boolean;
  readonly since: Date;
}

export interface TeamTimeline {
  /** Ms by chapter id; a chapter the team was in more than once sums up. */
  readonly chapters: ReadonlyMap<string, number>;
  /** Ms by gap, keyed by `gapKey`; the gaps themselves in `gapsSeen`. */
  readonly gaps: ReadonlyMap<string, number>;
  /** The gaps the team went through, in the order it did. */
  readonly gapsSeen: readonly Gap[];
  /** From the first login to the end, or to now; the chapters and gaps add up to it. */
  readonly totalMs: number;
  /** The total time without the chapters that do not count. */
  readonly resultMs: number;
  /** Missing before the first login and after the end. */
  readonly phase: Phase | undefined;
}

/** The key of a gap in `TeamTimeline.gaps`, the same as the API's `gapKey`. */
export const gapKey = ({ from, to }: Gap) => `${from}>${to}`;

/** A stretch of the team's time in one chapter, or between chapters (`chapter` ""). */
interface Stretch {
  readonly chapter: string;
  readonly from: number;
  readonly to: number;
}

const EMPTY: TeamTimeline = {
  chapters: new Map(),
  gaps: new Map(),
  gapsSeen: [],
  totalMs: 0,
  resultMs: 0,
  phase: undefined,
};

/**
 * Splits the team's time from its first login until its end (or `now`) by the chapters of the
 * nodes it was at. The time on nodes of no chapter is a gap between the chapter before and the one
 * after. The chapters and gaps together make the team's total time; the result leaves out the
 * chapters that do not count. The game's pauses count nowhere. `log` may hold other teams' moves
 * too.
 */
export const teamTimeline = (
  story: Story,
  team: TeamRow,
  log: readonly MoveRow[],
  pauses: readonly PauseRow[],
  now: number,
): TeamTimeline => {
  if (team.startedAt === undefined) {
    return EMPTY;
  }

  const start = team.startedAt.getTime();
  const end = Math.max(team.finishedAt?.getTime() ?? now, start);
  const chapterOf = (node: string | undefined) =>
    (node === undefined ? undefined : story.nodes[node]?.chapter) ?? '';
  const countsOf = (chapter: string) =>
    story.chapters.find((known) => known.id === chapter)?.counts ?? true;

  const rows = log
    .filter((row) => row.teamId === team.id)
    .toSorted((first, second) => first.at.getTime() - second.at.getTime());
  // Where the team was at its start: the last node before it, or, as the first login records the
  // start a moment before the move to the start node, the first node after it.
  const before = rows.filter((row) => row.at.getTime() <= start && row.toNode !== undefined);
  const startNode = before.at(-1)?.toNode ?? rows.find((row) => row.toNode !== undefined)?.toNode;

  // The moments the team changed node within the game, each with the node it came to.
  const moves = rows.filter(
    (row) => row.at.getTime() > start && row.at.getTime() <= end && row.toNode !== undefined,
  );
  const pieces = [
    { node: startNode, at: start },
    ...moves.map((row) => ({ node: row.toNode, at: row.at.getTime() })),
  ];
  // Consecutive pieces in the same chapter make one stretch, however many moves it took.
  const stretches = pieces.reduce<readonly Stretch[]>((done, piece, index) => {
    const to = pieces[index + 1]?.at ?? end;
    const chapter = chapterOf(piece.node);
    const last = done.at(-1);
    return last !== undefined && last.chapter === chapter
      ? [...done.slice(0, -1), { ...last, to }]
      : [...done, { chapter, from: piece.at, to }];
  }, []);

  const chapters = new Map<string, number>();
  const gaps = new Map<string, number>();
  const gapsSeen: Gap[] = [];
  for (const [index, stretch] of stretches.entries()) {
    const ms = runningMs(stretch.from, stretch.to, pauses, now);
    if (stretch.chapter !== '') {
      chapters.set(stretch.chapter, (chapters.get(stretch.chapter) ?? 0) + ms);
      continue;
    }

    // A moment on the outro, where the game ends, is no gap.
    if (ms <= 0) {
      continue;
    }

    const gap = {
      from: stretches[index - 1]?.chapter ?? '',
      to: stretches[index + 1]?.chapter ?? '',
    };
    const key = gapKey(gap);
    if (!gaps.has(key)) {
      gapsSeen.push(gap);
    }

    gaps.set(key, (gaps.get(key) ?? 0) + ms);
  }

  const leftOut = [...chapters].reduce(
    (sum, [chapter, ms]) => (countsOf(chapter) ? sum : sum + ms),
    0,
  );
  const current = stretches.at(-1);
  const phase: Phase | undefined =
    team.finishedAt !== undefined || current === undefined
      ? undefined
      : {
          chapter: current.chapter === '' ? undefined : current.chapter,
          counts: current.chapter === '' || countsOf(current.chapter),
          since: new Date(current.from),
        };
  const totalMs = runningMs(start, end, pauses, now);
  return { chapters, gaps, gapsSeen, totalMs, resultMs: totalMs - leftOut, phase };
};
