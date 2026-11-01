import type { PlaytestView } from '@gamebook/api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, QrCode, RotateCcw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NodeScreens } from '@/features/player/node-screens';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import { startNodes, useStoryGraph } from './queries';

type Move = { readonly choice: number } | { readonly scan: number };

/** One visited node and how the run got there; the first step has no `via`. */
interface Step extends PlaytestView {
  readonly via?: string;
}

/**
 * Plays the story from a chosen start as a team would, without a team: nothing is stored, the
 * page keeps the path and sends the position with every move. QR codes are skipped by picking the
 * place the team would scan.
 */
export const PlaytestPage = () => {
  const graph = useStoryGraph();
  const starts = startNodes(graph.data);
  const [chosen, setChosen] = useState<string>();
  const start = chosen ?? starts[0];
  // Steps after the start; the start itself is a query, so it loads with the page.
  const [moves, setMoves] = useState<readonly Step[]>([]);

  const begin = useQuery({
    queryKey: ['admin', 'playtest', start],
    queryFn: () => api((client) => client.admin.playtest({ payload: { node: start! } })),
    enabled: start !== undefined,
    // The story changes only with a deploy.
    staleTime: Infinity,
  });
  const path: readonly Step[] = begin.data === undefined ? [] : [begin.data, ...moves];
  const current = path.at(-1);

  const play = useMutation({
    mutationFn: ({ from, move }: { from: Step; move: Move; via: string }) =>
      api((client) =>
        client.admin.playtest({ payload: { node: from.node, state: from.state, move } }),
      ),
    onSuccess: (next, { via }) => setMoves((steps) => [...steps, { ...next, via }]),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const restart = (node: string) => {
    setChosen(node);
    setMoves([]);
  };
  /** Keeps the path up to and including the step with this index. */
  const backTo = (index: number) => setMoves((steps) => steps.slice(0, index));

  const take = (move: Move, via: string) => {
    if (current !== undefined) play.mutate({ from: current, move, via });
  };

  if (graph.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (graph.isError) return <p className='p-8 text-destructive'>{errorMessage(graph.error)}</p>;

  return (
    <div className='flex h-full flex-col'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm text-muted-foreground'>
        <span className='flex items-center gap-2'>
          Start
          <Select value={start ?? ''} onValueChange={restart}>
            <SelectTrigger size='sm' className='font-mono'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {starts.map((id) => (
                <SelectItem key={id} value={id} className='font-mono'>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        <Button
          variant='ghost'
          size='sm'
          disabled={path.length < 2 || play.isPending}
          onClick={() => backTo(path.length - 2)}
        >
          <Undo2 /> Krok zpět
        </Button>
        <Button
          variant='ghost'
          size='sm'
          disabled={start === undefined || play.isPending}
          onClick={() => start !== undefined && restart(start)}
        >
          <RotateCcw /> Znovu
        </Button>
        {(play.isPending || begin.isFetching) && <Loader2 className='size-4 animate-spin' />}
        <span>Test se nikam neukládá, QR kódy jde přeskočit.</span>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4 md:flex-row md:items-start'>
        <div className='mx-auto flex h-[min(44rem,100%)] min-h-[32rem] w-full max-w-sm shrink-0 flex-col overflow-auto rounded-[2rem] border-4 bg-background p-5 shadow-sm md:mx-0'>
          {begin.isError && <p className='text-destructive'>{errorMessage(begin.error)}</p>}
          {current !== undefined && (
            <NodeScreens
              node={current.view}
              step={path.length}
              busy={play.isPending}
              onPick={(choice) => take({ choice: choice.index }, choice.label)}
              scanActions={
                current.view.scans.length === 0 ? (
                  <p className='text-center text-sm text-destructive'>
                    V tomto stavu nevede žádný QR kód dál.
                  </p>
                ) : (
                  current.view.scans.map((location) => (
                    <Button
                      key={location.id}
                      size='lg'
                      variant='outline'
                      className='h-auto min-h-14 justify-start border-dashed py-3 text-base whitespace-normal'
                      disabled={play.isPending}
                      onClick={() => take({ scan: location.id }, `QR ${location.name}`)}
                    >
                      <QrCode /> Přeskočit sken: {location.name}
                    </Button>
                  ))
                )
              }
            />
          )}
        </div>

        <div className='flex min-w-0 flex-1 flex-col gap-6 text-sm'>
          {current !== undefined && (
            <section className='flex flex-col gap-2'>
              <h2 className='font-medium'>Stav</h2>
              <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border p-3 font-mono'>
                {Object.entries(current.state).map(([key, value]) => (
                  <div key={key} className='contents'>
                    <dt className='text-muted-foreground'>{key}</dt>
                    <dd>{JSON.stringify(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className='flex flex-col gap-2'>
            <h2 className='font-medium'>Cesta</h2>
            <ol className='flex flex-col gap-1'>
              {path.map((step, index) => (
                <li key={index}>
                  <button
                    type='button'
                    className={cn(
                      'flex w-full items-baseline gap-3 rounded-md px-2 py-1 text-left hover:bg-accent',
                      index === path.length - 1 && 'bg-accent',
                    )}
                    disabled={play.isPending}
                    onClick={() => backTo(index)}
                    title='Vrátit se sem'
                  >
                    <span className='w-6 shrink-0 text-right text-muted-foreground tabular-nums'>
                      {index + 1}.
                    </span>
                    <span className='rounded bg-muted px-1.5 font-mono text-xs'>{step.node}</span>
                    {step.via !== undefined && (
                      <span className='truncate text-muted-foreground'>← {step.via}</span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
};
