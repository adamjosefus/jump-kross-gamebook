import type { PlayerIntro, PlaytestView, PrintableCode } from '@gamebook/api';
import { parseQr } from '@gamebook/core';
import {
  IconArrowBackUp,
  IconLoader2,
  IconPlayerSkipForward,
  IconQrcode,
  IconRotate,
  IconRun,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NodeScreens } from '@/features/player/node-screens';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import { adminKeys } from './queries';

const ANIMATIONS_KEY = 'gamebook.playtest.animations';

/** Whether the preview animates; off is remembered in this browser for the next test run. */
const useAnimations = () => {
  const [animated, setAnimated] = useState(() => {
    try {
      return localStorage.getItem(ANIMATIONS_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const change = (next: boolean) => {
    setAnimated(next);
    try {
      if (next) localStorage.removeItem(ANIMATIONS_KEY);
      else localStorage.setItem(ANIMATIONS_KEY, 'off');
    } catch {
      // Storage may be blocked; the switch then holds only until a reload.
    }
  };
  return [animated, change] as const;
};

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
        ...(from.intro === true
          ? {}
          : { position: { node: from.node, state: from.state }, team: from.team.id }),
        ...(move === undefined ? {} : { move }),
      },
    }),
  );
  return { ...next, via: viaOf(from, move), token: encodeMove(move) };
};

/**
 * Replays the moves one after another from `from`. The story may have changed since the path was
 * written; the path stops where it no longer goes on.
 */
const replaySteps = async (from: Step, tokens: readonly string[]): Promise<readonly Step[]> => {
  const [token, ...rest] = tokens;
  if (token === undefined) return [];
  const next = await playFrom(from, decodeMove(token)).catch((error: unknown) => {
    toast.error(`Cestu z adresy nešlo celou přehrát: ${errorMessage(error)}`);
    return undefined;
  });
  return next === undefined ? [] : [next, ...(await replaySteps(next, rest))];
};

const introStep = (intro: PlayerIntro): Step => ({
  intro: true,
  team: { id: 0, name: '' },
  node: 'Úvod',
  state: {},
  view: { ...intro, id: 'intro', type: 'passage', choices: [], scan: true, scans: [] },
});

/** A tooltip over a tool; the wrapper lets it show on a disabled button too. */
const Hint = ({ text, children }: { readonly text: string; readonly children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className='inline-flex'>{children}</span>
    </TooltipTrigger>
    <TooltipContent sideOffset={6}>{text}</TooltipContent>
  </Tooltip>
);

/** A QR code picked from the story's codes or typed in, for a test run without a printed one. */
const CodeEntry = ({
  kind,
  disabled,
  busy,
  onCode,
}: {
  /** The codes that make sense here: teams at the login, places in the story. */
  readonly kind: PrintableCode['kind'];
  readonly disabled: boolean;
  readonly busy: boolean;
  /** `done` is called once the code worked; one that did not stays in the field to be fixed. */
  readonly onCode: (code: string, done: () => void) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const codes = useQuery({
    queryKey: adminKeys.codes,
    queryFn: ({ signal }) => api((client) => client.admin.codes(), { signal }),
    enabled: open,
  });
  const offered = codes.data?.filter((entry) => entry.kind === kind);
  const code = text.trim();
  const send = (value: string) =>
    onCode(value, () => {
      setText('');
      setOpen(false);
    });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code !== '' && !busy) send(code);
  };
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <Hint text='Kód'>
        <PopoverTrigger asChild>
          <Button variant='ghost' size='icon-sm' disabled={disabled} aria-label='Kód'>
            <IconQrcode />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent side='top' sideOffset={6} className='flex flex-col gap-3'>
        <PopoverArrow />
        <section className='flex flex-col gap-1'>
          <h3 className='text-sm font-medium'>{kind === 'T' ? 'Kódy týmů' : 'Kódy míst'}</h3>
          {codes.isError ? (
            <p className='text-xs text-destructive'>{errorMessage(codes.error)}</p>
          ) : offered === undefined ? (
            <IconLoader2 className='size-4 animate-spin' />
          ) : offered.length === 0 ? (
            <p className='text-xs text-muted-foreground'>Příběh žádné nemá.</p>
          ) : (
            <ul className='-mx-1 flex max-h-56 flex-col overflow-y-auto'>
              {offered.map((entry) => (
                <li key={entry.code}>
                  <button
                    type='button'
                    disabled={busy}
                    onClick={() => send(entry.code)}
                    className='flex w-full items-baseline justify-between gap-3 rounded-md px-1 py-1 text-left text-sm hover:bg-accent disabled:opacity-50'
                  >
                    <span className='truncate'>{entry.label}</span>
                    <span className='shrink-0 font-mono text-xs text-muted-foreground'>
                      {entry.code}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <form onSubmit={submit} className='flex flex-col gap-2 border-t pt-3'>
          <h3 className='text-sm font-medium'>Zadat ručně</h3>
          <div className='flex gap-2'>
            <Input
              value={text}
              onChange={(event) => setText(event.target.value.toUpperCase())}
              placeholder='L-12-ABCD'
              aria-label='Kód z QR'
              autoCapitalize='characters'
              autoComplete='off'
              className='min-w-0 flex-1 font-mono'
            />
            <Button type='submit' disabled={code === '' || busy}>
              {busy ? <IconLoader2 className='animate-spin' /> : 'Potvrdit'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Plays the story as a team would, without a team: nothing is stored, the page keeps the path and
 * sends the position with every move. It begins with the intro and the login scan; QR codes are
 * scanned like in the game, or typed in or skipped from the toolbar. The moves and the screen are
 * in the URL, so a reload replays the same path.
 */
export const PlaytestPage = () => {
  const search = useSearch({ from: '/admin/playtest' });
  const navigate = useNavigate();
  const [animated, setAnimated] = useAnimations();
  const intro = useQuery({
    queryKey: ['player', 'intro'],
    queryFn: ({ signal }) => api((client) => client.player.intro(), { signal }),
    // The story changes only with a deploy.
    staleTime: Infinity,
  });
  const start = intro.data === undefined ? undefined : introStep(intro.data);

  // The path the page opened with is replayed once; from then on the page keeps it.
  const [opened] = useState(() => search.path ?? '');
  const replay = useQuery({
    queryKey: ['admin', 'playtest', 'replay', opened],
    queryFn: () => replaySteps(start!, opened.split('.')),
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
    mutationFn: ({ from, move }: { readonly from: Step; readonly move?: Move }) =>
      playFrom(from, move),
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
    return <IconLoader2 className='m-8 size-6 animate-spin' />;
  if (intro.isError) return <p className='p-8 text-destructive'>{errorMessage(intro.error)}</p>;

  return (
    <div className='flex h-full flex-col'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm text-muted-foreground'>
        {play.isPending && <IconLoader2 className='size-4 animate-spin' />}
        <span>Test se nikam neukládá.</span>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4 md:flex-row md:items-start'>
        <div className='mx-auto flex w-full max-w-sm shrink-0 flex-col gap-3 md:mx-0'>
          {/* Exactly what the players see; test tools are in the toolbar under it. */}
          <div
            className={cn(
              'phone-preview relative h-[min(44rem,calc(100dvh-12rem))] min-h-[32rem] overflow-hidden rounded-[2.5rem] border-4 bg-background shadow-sm',
              !animated && 'no-animations',
            )}
          >
            <div className='flex size-full flex-col overflow-auto font-story'>
              {current !== undefined && (
                <NodeScreens
                  node={current.view}
                  step={path.length}
                  visitScope='playtest'
                  busy={play.isPending}
                  onCode={(code) => take({ code })}
                  requireCamera={current.intro === true}
                  animated={animated}
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
          <div className='flex items-center gap-1 rounded-xl border bg-muted/40 p-1'>
            <Hint text='Krok zpět'>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label='Krok zpět'
                disabled={path.length < 2 || play.isPending}
                onClick={() => backTo(path.length - 2)}
              >
                <IconArrowBackUp />
              </Button>
            </Hint>
            <Hint text='Znovu od začátku'>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label='Znovu od začátku'
                disabled={steps.length === 0 || play.isPending}
                onClick={() => setMoves([])}
              >
                <IconRotate />
              </Button>
            </Hint>
            <span className='flex-1' />
            <CodeEntry
              kind={current?.intro === true ? 'T' : 'L'}
              disabled={current?.view.scan !== true}
              busy={play.isPending}
              onCode={(code, done) => {
                if (current !== undefined)
                  play.mutate({ from: current, move: { code } }, { onSuccess: done });
              }}
            />
            {current?.intro === true ? (
              <Hint text='Přeskočit přihlášení'>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label='Přeskočit přihlášení'
                  disabled={play.isPending}
                  onClick={() => take(undefined)}
                >
                  <IconPlayerSkipForward />
                </Button>
              </Hint>
            ) : (
              <DropdownMenu>
                <Hint
                  text={
                    current?.view.scan === true && scans.length === 0
                      ? 'V tomto stavu nevede žádný QR kód dál.'
                      : 'Přeskočit sken'
                  }
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label='Přeskočit sken'
                      disabled={current?.view.scan !== true || scans.length === 0 || play.isPending}
                    >
                      <IconPlayerSkipForward />
                    </Button>
                  </DropdownMenuTrigger>
                </Hint>
                <DropdownMenuContent align='end'>
                  <DropdownMenuLabel>Jako by tým naskenoval</DropdownMenuLabel>
                  {scans.map((location) => (
                    <DropdownMenuItem
                      key={location.id}
                      onSelect={() => take({ scan: location.id })}
                    >
                      <IconQrcode /> {location.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Separator orientation='vertical' className='mx-1 h-5 self-center!' />
            <Hint text={animated ? 'Vypnout animace' : 'Zapnout animace'}>
              <label className='flex h-7 cursor-pointer items-center gap-1.5 px-1.5'>
                <IconRun className='size-4 text-muted-foreground' />
                <Switch aria-label='Animace' checked={animated} onCheckedChange={setAnimated} />
              </label>
            </Hint>
          </div>
        </div>

        <div className='flex min-w-0 flex-1 flex-col gap-6 text-sm'>
          {current !== undefined && current.intro !== true && (
            <section className='flex flex-col gap-2'>
              <h2 className='font-medium'>Tým</h2>
              <p>{current.team.name}</p>
              <h2 className='mt-4 font-medium'>Stav</h2>
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
