import type { PlaytestView } from '@gamebook/api';
import { parseQr } from '@gamebook/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, QrCode, RotateCcw, SkipForward, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NodeScreens } from '@/features/player/node-screens';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

type Move = { readonly choice: number } | { readonly scan: number } | { readonly code: string };

/** One visited node and how the run got there; the first step has no `via`. */
interface Step extends PlaytestView {
  readonly via?: string;
  /** The intro before login; it has no position yet. */
  readonly intro?: true;
}

/**
 * Plays the story as a team would, without a team: nothing is stored, the page keeps the path and
 * sends the position with every move. It begins with the intro and the login scan; QR codes are
 * scanned like in the game, or skipped from the toolbar.
 */
export const PlaytestPage = () => {
  const intro = useQuery({
    queryKey: ['player', 'intro'],
    queryFn: ({ signal }) => api((client) => client.player.intro(), { signal }),
    // The story changes only with a deploy.
    staleTime: Infinity,
  });
  // Steps after the intro.
  const [moves, setMoves] = useState<readonly Step[]>([]);

  const path: readonly Step[] =
    intro.data === undefined
      ? []
      : [
          {
            intro: true,
            node: 'Úvod',
            state: {},
            view: {
              id: 'intro',
              type: 'passage',
              screens: intro.data.screens,
              choices: [],
              scan: true,
              scans: [],
            },
          },
          ...moves,
        ];
  const current = path.at(-1);
  const scans = current?.view.scans ?? [];

  const play = useMutation({
    mutationFn: ({ from, move }: { from: Step; move?: Move; via: string }) =>
      api((client) =>
        client.admin.playtest({
          payload: {
            ...(from.intro === true ? {} : { position: { node: from.node, state: from.state } }),
            ...(move === undefined ? {} : { move }),
          },
        }),
      ),
    onSuccess: (next, { via }) => setMoves((steps) => [...steps, { ...next, via }]),
    onError: (error) => toast.error(errorMessage(error)),
  });

  /** Keeps the path up to and including the step with this index. */
  const backTo = (index: number) => setMoves((steps) => steps.slice(0, index));

  const take = (move: Move | undefined, via: string) => {
    if (current !== undefined)
      play.mutate({ from: current, ...(move === undefined ? {} : { move }), via });
  };

  if (intro.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (intro.isError) return <p className='p-8 text-destructive'>{errorMessage(intro.error)}</p>;

  return (
    <div className='flex h-full flex-col'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm text-muted-foreground'>
        {play.isPending && <Loader2 className='size-4 animate-spin' />}
        <span>Test se nikam neukládá.</span>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4 md:flex-row md:items-start'>
        <div className='mx-auto flex w-full max-w-sm shrink-0 flex-col gap-3 md:mx-0'>
          {/* Exactly what the players see; test tools are in the toolbar under it. */}
          <div className='flex h-[min(44rem,calc(100dvh-12rem))] min-h-[32rem] flex-col overflow-auto rounded-[2rem] border-4 bg-background p-5 shadow-sm'>
            {current !== undefined && (
              <NodeScreens
                node={current.view}
                step={path.length}
                busy={play.isPending}
                onCode={(code) => {
                  const id = parseQr(code)?.id;
                  const name = scans.find((location) => location.id === id)?.name;
                  take(
                    { code },
                    current.intro === true ? `Kód týmu ${code}` : `QR ${name ?? code}`,
                  );
                }}
                onPick={(choice) => take({ choice: choice.index }, choice.label)}
              />
            )}
          </div>
          <div className='flex flex-wrap items-center gap-1 rounded-xl border bg-muted/40 p-1'>
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
              disabled={moves.length === 0 || play.isPending}
              onClick={() => setMoves([])}
            >
              <RotateCcw /> Znovu
            </Button>
            <span className='flex-1' />
            {current?.intro === true ? (
              <Button
                variant='ghost'
                size='sm'
                disabled={play.isPending}
                onClick={() => take(undefined, 'Přihlášení přeskočeno')}
              >
                <SkipForward /> Přeskočit přihlášení
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={current?.view.scan !== true || scans.length === 0 || play.isPending}
                    title={
                      current?.view.scan === true && scans.length === 0
                        ? 'V tomto stavu nevede žádný QR kód dál.'
                        : undefined
                    }
                  >
                    <SkipForward /> Přeskočit sken <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuLabel>Jako by tým naskenoval</DropdownMenuLabel>
                  {scans.map((location) => (
                    <DropdownMenuItem
                      key={location.id}
                      onSelect={() => take({ scan: location.id }, `${location.name} (přeskočeno)`)}
                    >
                      <QrCode /> {location.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className='flex min-w-0 flex-1 flex-col gap-6 text-sm'>
          {current !== undefined && current.intro !== true && (
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
