import { gapKey, type ChapterGap, type TeamStatus, type TimeBreakdown } from '@gamebook/api';
import { IconLoader2 } from '@tabler/icons-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TeamAvatar } from '@/features/teams/team-avatar';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import { useOverview, useTimeBreakdown } from './queries';
import { formatDuration, playTime, resultTime, type Clock } from './results';

const POLL_MS = 15_000;

type TeamTimes = TimeBreakdown['teams'][number];

/** A column of the table: the result, the total, a chapter or a gap between two. */
interface Column {
  readonly key: string;
  readonly label: string;
  /** Shown small under the label, e.g. that the chapter does not count. */
  readonly note?: string;
  /** The column's ms for a team; undefined when the team has none of it (yet). */
  readonly ms: (
    times: TeamTimes | undefined,
    status: TeamStatus,
    clock: Clock,
  ) => number | undefined;
}

/** Two times shown the same are never one fastest and one not: they compare as shown. */
const shownSeconds = (ms: number) => Math.floor(ms / 1000);

/**
 * The columns in the order the teams go through the story: the gaps from the start, then every
 * chapter followed by the gaps that lead from it.
 */
const columnsOf = ({ chapters, gaps }: TimeBreakdown): readonly Column[] => {
  const names = new Map(chapters.map((chapter) => [chapter.id, chapter.name]));
  const gapColumn = (gap: ChapterGap): Column => ({
    key: `gap:${gapKey(gap)}`,
    label: `${gap.from === '' ? 'Start' : (names.get(gap.from) ?? gap.from)} → ${
      gap.to === '' ? 'konec' : (names.get(gap.to) ?? gap.to)
    }`,
    note: 'mezi kapitolami',
    ms: (times) => times?.gaps[gapKey(gap)],
  });
  return [
    {
      key: 'result',
      label: 'Výsledek',
      note: 'bez nepočítaných kapitol',
      ms: (_times, status, clock) => resultTime(status, clock),
    },
    { key: 'total', label: 'Celkem', ms: (_times, status, clock) => playTime(status, clock) },
    ...gaps.filter((gap) => gap.from === '').map(gapColumn),
    ...chapters.flatMap((chapter): readonly Column[] => [
      {
        key: `chapter:${chapter.id}`,
        label: chapter.name,
        ...(chapter.counts ? {} : { note: 'nepočítá se' }),
        ms: (times) => times?.chapters[chapter.id],
      },
      ...gaps.filter((gap) => gap.from === chapter.id).map(gapColumn),
    ]),
  ];
};

/**
 * The fastest and the slowest of the teams in the finish, per column: a team on its way may not
 * have left a chapter yet, so its time is not final and would look the fastest. Undefined where
 * fewer than two teams have a time, or all have the same.
 */
const extremesOf = (values: readonly number[]) =>
  values.length < 2 || Math.min(...values) === Math.max(...values)
    ? undefined
    : { fastest: Math.min(...values), slowest: Math.max(...values) };

/**
 * How long each team took in each chapter of the story and between the chapters, side by side with
 * its total and its result: where the teams spend their time and where one got stuck. Times of a
 * team on its way count up to now.
 */
export const TimesPage = () => {
  const breakdown = useTimeBreakdown(POLL_MS);
  const overview = useOverview(POLL_MS);

  if (breakdown.isPending || overview.isPending)
    return <IconLoader2 className='m-8 size-6 animate-spin' />;
  if (breakdown.data === undefined || overview.data === undefined)
    return (
      <p className='p-8 text-destructive'>{errorMessage(breakdown.error ?? overview.error)}</p>
    );

  // The times as the server measured them; the parts of the breakdown cannot move on anyway.
  const clock: Clock = {
    now: overview.dataUpdatedAt,
    measuredAt: overview.dataUpdatedAt,
    paused: true,
  };
  const columns = columnsOf(breakdown.data);
  const times: ReadonlyMap<number, TeamTimes> = new Map(
    breakdown.data.teams.map((entry) => [entry.id, entry]),
  );
  const started = overview.data.teams.filter((team) => team.startedAt !== undefined);
  const marks = new Map(
    columns.map((column) => [
      column.key,
      extremesOf(
        started
          .filter((team) => team.finished)
          .flatMap((team) => {
            const ms = column.ms(times.get(team.id), team, clock);
            return ms === undefined ? [] : [shownSeconds(ms)];
          }),
      ),
    ]),
  );

  return (
    <div className='mx-auto flex max-w-6xl flex-col gap-4 p-4 md:gap-6 md:p-6'>
      <Card>
        <CardHeader>
          <CardTitle>Časy</CardTitle>
          <CardDescription>
            Jak dlouho byl tým v každé kapitole příběhu a mezi kapitolami, celkem a ve výsledku, do
            kterého se nepočítají kapitoly označené „nepočítá se“. Zeleně je nejrychlejší a červeně
            nejpomalejší tým v cíli. U týmu na cestě se čas počítá do teď.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='sticky left-0 z-10 bg-card'>Tým</TableHead>
                {columns.map((column) => (
                  <TableHead key={column.key} className='h-auto py-2 align-bottom'>
                    <div className='flex flex-col'>
                      <span>{column.label}</span>
                      {column.note !== undefined && (
                        <span className='text-xs font-normal text-muted-foreground'>
                          {column.note}
                        </span>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {started.map((team) => (
                <TableRow key={team.id}>
                  {/* The row's header, so a screen reader names the team with each time. */}
                  <TableHead
                    scope='row'
                    className='sticky left-0 z-10 h-auto bg-card p-2 font-normal'
                  >
                    <div className='flex items-center gap-2'>
                      <TeamAvatar id={team.id} name={team.name} />
                      <span className='whitespace-nowrap'>{team.name}</span>
                    </div>
                  </TableHead>
                  {columns.map((column) => {
                    const ms = column.ms(times.get(team.id), team, clock);
                    const mark = team.finished ? marks.get(column.key) : undefined;
                    const shown = ms === undefined ? undefined : shownSeconds(ms);
                    const rank =
                      mark === undefined || shown === undefined
                        ? undefined
                        : shown === mark.fastest
                          ? 'nejrychlejší'
                          : shown === mark.slowest
                            ? 'nejpomalejší'
                            : undefined;
                    return (
                      <TableCell
                        key={column.key}
                        className={cn(
                          'align-top',
                          rank === 'nejrychlejší' && 'bg-emerald-500/10 dark:bg-emerald-400/15',
                          rank === 'nejpomalejší' && 'bg-red-500/10 dark:bg-red-400/15',
                        )}
                      >
                        {ms === undefined ? (
                          <span className='text-muted-foreground'>–</span>
                        ) : (
                          <div className='flex flex-col gap-0.5'>
                            <span
                              className={cn(
                                'font-mono',
                                column.key === 'result' && 'font-semibold',
                              )}
                            >
                              {formatDuration(ms)}
                            </span>
                            {/* The color has a word too, for a screen reader and for whom the
                                colors look alike. */}
                            {rank !== undefined && (
                              <span className='text-xs text-muted-foreground'>{rank}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {started.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className='text-muted-foreground'>
                    Zatím žádný tým nezačal.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
