import type { NamedPart, TeamStatus, TimeBreakdown, TimeSplit } from '@gamebook/api';
import { IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamAvatar } from '@/features/teams/team-avatar';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import { useOverview, useTimeBreakdown } from './queries';
import { formatDuration } from './results';

const POLL_MS = 15_000;

type View = 'chapters' | 'stations';

type TeamTimes = TimeBreakdown['teams'][number];

/** The time a column measures, for one team; undefined when the team has none of it yet. */
type Measure = (times: TeamTimes) => number | undefined;

const splitTotal = (split: TimeSplit) => split.storyMs + split.travelMs + split.taskMs;

const chapterMeasure =
  (id: string): Measure =>
  (times) => {
    const split = times.chapters[id];
    return split === undefined ? undefined : splitTotal(split);
  };

const stationMeasure =
  (id: string): Measure =>
  (times) =>
    times.stations[id]?.taskMs;

/**
 * The fastest and the slowest of the teams in the finish: a team on its way may not have left the
 * chapter or station yet, so its time is not final and would look the fastest.
 */
const extremes = (
  parts: readonly NamedPart[],
  measureOf: (id: string) => Measure,
  teams: readonly TeamTimes[],
  finished: ReadonlySet<number>,
) =>
  new Map(
    parts.map(({ id }) => {
      const measure = measureOf(id);
      const values = teams
        .filter((times) => finished.has(times.id))
        .flatMap((times) => measure(times) ?? []);
      return [
        id,
        // With fewer than two times, or all the same, there is no fastest or slowest.
        values.length < 2 || Math.min(...values) === Math.max(...values)
          ? undefined
          : { fastest: Math.min(...values), slowest: Math.max(...values) },
      ] as const;
    }),
  );

const ChapterCell = ({ split }: { readonly split: TimeSplit | undefined }) =>
  split === undefined ? (
    <span className='text-muted-foreground'>–</span>
  ) : (
    <div className='flex flex-col gap-0.5'>
      <span className='font-mono font-medium'>{formatDuration(splitTotal(split))}</span>
      <span className='text-xs whitespace-nowrap text-muted-foreground'>
        čtení {formatDuration(split.storyMs)} · cesta {formatDuration(split.travelMs)} · úkol{' '}
        {formatDuration(split.taskMs)}
      </span>
    </div>
  );

const StationCell = ({
  time,
}: {
  readonly time: { readonly travelMs: number; readonly taskMs: number } | undefined;
}) =>
  time === undefined ? (
    <span className='text-muted-foreground'>–</span>
  ) : (
    <div className='flex flex-col gap-0.5'>
      <span className='font-mono font-medium'>{formatDuration(time.taskMs)}</span>
      <span className='text-xs whitespace-nowrap text-muted-foreground'>
        cesta {formatDuration(time.travelMs)}
      </span>
    </div>
  );

/**
 * How long each team took on each chapter of the story, or at each station, side by side: where
 * the teams spend their time and where one got stuck. Times of a team on its way count up to now.
 */
export const TimesPage = () => {
  const breakdown = useTimeBreakdown(POLL_MS);
  const overview = useOverview(POLL_MS);
  const [view, setView] = useState<View>('chapters');

  if (breakdown.isPending || overview.isPending)
    return <IconLoader2 className='m-8 size-6 animate-spin' />;
  if (breakdown.data === undefined || overview.data === undefined)
    return (
      <p className='p-8 text-destructive'>{errorMessage(breakdown.error ?? overview.error)}</p>
    );

  const { chapters, stations, teams } = breakdown.data;
  const statuses: ReadonlyMap<number, TeamStatus> = new Map(
    overview.data.teams.map((team) => [team.id, team]),
  );
  const finished = new Set(overview.data.teams.filter((team) => team.finished).map(({ id }) => id));
  const parts = view === 'chapters' ? chapters : stations;
  const measureOf = view === 'chapters' ? chapterMeasure : stationMeasure;
  const marks = extremes(parts, measureOf, teams, finished);
  const started = teams.filter((times) => statuses.get(times.id)?.startedAt !== undefined);

  return (
    <div className='mx-auto flex max-w-6xl flex-col gap-4 p-4 md:gap-6 md:p-6'>
      <Card>
        <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <div className='flex flex-col gap-1.5'>
            <CardTitle>Časy</CardTitle>
            <CardDescription>
              {view === 'chapters'
                ? 'Jak dlouho byl tým v kapitole příběhu a z toho čtením, cestou a úkolem na stanovišti.'
                : 'Jak dlouho tým plnil úkol na stanovišti (od kódu příchodu po kód odměny, bez čtení) a jak dlouho k němu šel.'}{' '}
              Zeleně je nejrychlejší a červeně nejpomalejší tým v cíli. U týmu na cestě se čas
              počítá do teď.
            </CardDescription>
          </div>
          <Tabs
            value={view}
            onValueChange={(value) => setView(value === 'stations' ? 'stations' : 'chapters')}
          >
            <TabsList>
              <TabsTrigger value='chapters'>Kapitoly</TabsTrigger>
              <TabsTrigger value='stations'>Stanoviště</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {parts.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {view === 'chapters'
                ? 'Příběh nemá žádné kapitoly.'
                : 'Příběh nemá žádná stanoviště.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='sticky left-0 z-10 bg-card'>Tým</TableHead>
                  {parts.map((part) => (
                    <TableHead key={part.id}>{part.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {started.map((times) => {
                  const name = statuses.get(times.id)?.name ?? `#${times.id}`;
                  return (
                    <TableRow key={times.id}>
                      <TableCell className='sticky left-0 z-10 bg-card'>
                        <div className='flex items-center gap-2'>
                          <TeamAvatar id={times.id} name={name} />
                          <span className='whitespace-nowrap'>{name}</span>
                        </div>
                      </TableCell>
                      {parts.map((part) => {
                        const value = measureOf(part.id)(times);
                        const mark = finished.has(times.id) ? marks.get(part.id) : undefined;
                        // The color has a word too, for a screen reader and for whom colors look alike.
                        const rank =
                          mark === undefined
                            ? undefined
                            : value === mark.fastest
                              ? 'Nejrychlejší tým v cíli'
                              : value === mark.slowest
                                ? 'Nejpomalejší tým v cíli'
                                : undefined;
                        return (
                          <TableCell
                            key={part.id}
                            title={rank}
                            className={cn(
                              'align-top',
                              rank === 'Nejrychlejší tým v cíli' &&
                                'bg-emerald-500/10 dark:bg-emerald-400/15',
                              rank === 'Nejpomalejší tým v cíli' &&
                                'bg-red-500/10 dark:bg-red-400/15',
                            )}
                          >
                            {view === 'chapters' ? (
                              <ChapterCell split={times.chapters[part.id]} />
                            ) : (
                              <StationCell time={times.stations[part.id]} />
                            )}
                            {rank !== undefined && <span className='sr-only'>{rank}</span>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {started.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={parts.length + 1} className='text-muted-foreground'>
                      Zatím žádný tým nezačal.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
