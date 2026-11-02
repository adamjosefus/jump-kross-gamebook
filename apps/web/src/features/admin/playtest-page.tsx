import type { PlaytestView } from '@gamebook/api';
import { parseQr } from '@gamebook/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
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
  /** The move that led here, as written in the URL. */
  readonly token?: string;
  /** The intro before login; it has no position yet. */
  readonly intro?: true;
}

/**
 * Moves in the URL, separated by dots: `c2` the choice with index 2, `s1` the QR code of place 1
 * skipped, `qL-1-5FV2` a scanned code, `x` the login skipped.
 */
const encodeMove = (move: Move | undefined) =>
  move === undefined
    ? 'x'
    : 'choice' in move
      ? `c${move.choice}`
      : 'scan' in move
        ? `s${move.scan}`
        : `q${move.code}`;

const decodeMove = (token: string): Move | undefined => {
  const rest = token.slice(1);
  if (token.startsWith('c')) return { choice: Number(rest) };
  if (token.startsWith('s')) return { scan: Number(rest) };
  if (token.startsWith('q')) return { code: rest };
  return undefined;
};

/** How the path shows the move from `from`. */
const viaOf = (from: Step, move: Move | undefined) => {
  if (move === undefined) return 'Přihlášení přeskočeno';
  if ('choice' in move)
    return (
      from.view.choices.find((choice) => choice.index === move.choice)?.label ??
      `Volba ${move.choice}`
    );
  const location = 'scan' in move ? move.scan : parseQr(move.code)?.id;
  const name = from.view.scans.find((place) => place.id === location)?.name;
  if ('scan' in move) return `${name ?? `Místo ${move.scan}`} (přeskočeno)`;
  return from.intro === true ? `Kód týmu ${move.code}` : `QR ${name ?? move.code}`;
};

const playFrom = async (from: Step, move: Move | undefined): Promise<Step> => {
  const next = await api((client) =>
    client.admin.playtest({
      payload: {
        ...(from.intro === true ? {} : { position: { node: from.node, state: from.state } }),
        ...(move === undefined ? {} : { move }),
      },
    }),
  );
  return { ...next, via: viaOf(from, move), token: encodeMove(move) };
};

const introStep = (screens: PlaytestView['view']['screens']): Step => ({
  intro: true,
  node: 'Úvod',
  state: {},
  view: { id: 'intro', type: 'passage', screens, choices: [], scan: true, scans: [] },
});

/**
 * Plays the story as a team would, without a team: nothing is stored, the page keeps the path and
 * sends the position with every move. It begins with the intro and the login scan; QR codes are
 * scanned like in the game, or skipped from the toolbar. The moves and the screen are in the URL,
 * so a reload replays the same path.
 */
export const PlaytestPage = () => {
  const search = useSearch({ from: '/admin/playtest' });
  const navigate = useNavigate();
  const intro = useQuery({
    queryKey: ['player', 'intro'],
    queryFn: ({ signal }) => api((client) => client.player.intro(), { signal }),
    // The story changes only with a deploy.
    staleTime: Infinity,
  });
  const start = intro.data === undefined ? undefined : introStep(intro.data.screens);

  // The path the page opened with is replayed once; from then on the page keeps it.
  const [opened] = useState(() => search.path ?? '');
  const replay = useQuery({
    queryKey: ['admin', 'playtest', 'replay', opened],
    queryFn: async () => {
      const steps: Step[] = [];
      let from = start!;
      for (const token of opened.split('.')) {
        try {
          from = await playFrom(from, decodeMove(token));
        } catch (error) {
          // The story may have changed since; the path stops where it no longer goes on.
          toast.error(`Cestu z adresy nešlo celou přehrát: ${errorMessage(error)}`);
          break;
        }
        steps.push(from);
      }
      return steps;
    },
    enabled: start !== undefined && opened !== '',
    staleTime: Infinity,
    gcTime: 0,
  });
  // Steps after the intro; undefined until the first move, while the replayed path stands.
  const [moves, setMovesState] = useState<readonly Step[]>();
  const steps = moves ?? (opened === '' ? [] : (replay.data ?? []));
  const path: readonly Step[] = start === undefined ? [] : [start, ...steps];
  const current = path.at(-1);
  const scans = current?.view.scans ?? [];
  const pathParam = steps.map((step) => step.token).join('.');

  const setMoves = (next: readonly Step[]) => {
    setMovesState(next);
    const param = next.map((step) => step.token).join('.');
    void navigate({
      to: '/admin/playtest',
      search: param === '' ? {} : { path: param },
      replace: true,
    });
  };

  const play = useMutation({
    mutationFn: ({ from, move }: { from: Step; move?: Move }) => playFrom(from, move),
    onSuccess: (next) => setMoves([...steps, next]),
    onError: (error) => toast.error(errorMessage(error)),
  });

  /** Keeps the path up to and including the step with this index. */
  const backTo = (index: number) => setMoves(steps.slice(0, index));

  const take = (move: Move | undefined) => {
    if (current !== undefined)
      play.mutate({ from: current, ...(move === undefined ? {} : { move }) });
  };

  if (intro.isPending || (opened !== '' && replay.isPending))
    return <Loader2 className='m-8 size-6 animate-spin' />;
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
          <div className='phone-preview relative h-[min(44rem,calc(100dvh-12rem))] min-h-[32rem] overflow-hidden rounded-[2.5rem] border-4 bg-background shadow-sm'>
            <div className='safe-area-padding flex size-full flex-col overflow-auto font-story'>
              {current !== undefined && (
                <NodeScreens
                  node={current.view}
                  step={path.length}
                  busy={play.isPending}
                  onCode={(code) => take({ code })}
                  requireCamera={current.intro === true}
                  manualEntry
                  onPick={(choice) => take({ choice: choice.index })}
                  // The screen in the URL belongs to the path in it; after a move it starts over.
                  initialIndex={(search.path ?? '') === pathParam ? (search.screen ?? 0) : 0}
                  onIndexChange={(screen) =>
                    void navigate({
                      to: '/admin/playtest',
                      search: { ...(pathParam === '' ? {} : { path: pathParam }), screen },
                      replace: true,
                    })
                  }
                />
              )}
            </div>
            <div className='pointer-events-none absolute top-2.5 left-1/2 z-50 h-7 w-24 -translate-x-1/2 rounded-full bg-black' />
            <div className='pointer-events-none absolute bottom-2 left-1/2 z-50 h-1 w-28 -translate-x-1/2 rounded-full bg-foreground/60' />
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
              disabled={steps.length === 0 || play.isPending}
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
                onClick={() => take(undefined)}
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
                      onSelect={() => take({ scan: location.id })}
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
