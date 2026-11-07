import type { GameInfo, TeamStatus } from '@gamebook/api';
import {
  IconClock,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconRotate,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import { formatDateTime, formatTime } from './format';
import { adminKeys } from './queries';

/**
 * Where the game is in its life: not started (no team logs in), running, or paused (the admin
 * closed it; the teams keep their progress and go on once it runs again).
 */
type GamePhase = 'idle' | 'running' | 'paused';

const phaseOf = (game: GameInfo): GamePhase =>
  game.startedAt === undefined ? 'idle' : game.closed ? 'paused' : 'running';

const PHASE_BADGE = {
  idle: { label: 'Nespuštěná', variant: 'secondary', Icon: IconClock },
  running: { label: 'Běží', variant: 'default', Icon: IconPlayerPlay },
  paused: { label: 'Pozastavená', variant: 'destructive', Icon: IconPlayerPause },
} as const satisfies Readonly<
  Record<
    GamePhase,
    {
      readonly label: string;
      readonly variant: 'secondary' | 'default' | 'destructive';
      readonly Icon: typeof IconClock;
    }
  >
>;

/** What the phase means for the teams, under the card's title. */
const DESCRIPTION: Readonly<Record<GamePhase, (game: GameInfo) => string>> = {
  idle: () =>
    'Týmy se zatím nemohou přihlásit. Spusťte hru, až budou připravené naskenovat svůj kód.',
  running: (game) =>
    `Běží od ${formatTime(game.startedAt ?? '', { seconds: true })}. Čas každého týmu se počítá od jeho prvního přihlášení.`,
  paused: (game) =>
    `Pozastavená${game.closedChangedAt === undefined ? '' : ` od ${formatDateTime(game.closedChangedAt)}`}. Týmy teď nemohou hrát; po pokračování navážou, kde skončily. Týmy v cíli zůstávají u svého konce. Test v adminu funguje dál.`,
} as const;

/**
 * The one place that runs the game: its state with the single action that makes sense in it
 * (start, pause or go on), and, apart below, wiping every team's progress for a new game.
 */
export const GameControl = ({
  game,
  teams,
  onResetAll,
}: {
  readonly game: GameInfo;
  readonly teams: readonly TeamStatus[];
  /** Opens the confirmation of wiping every team's progress. */
  readonly onResetAll: () => void;
}) => {
  const queryClient = useQueryClient();
  const phase = phaseOf(game);
  const badge = PHASE_BADGE[phase];
  const [confirming, setConfirming] = useState(false);
  // What the dialog asks for is fixed when it opens: a refresh of the overview meanwhile (another
  // organizer's change) must not turn „Pozastavit“ into „Pokračovat“ under the admin's cursor.
  const [pause, setPause] = useState(phase === 'running');
  const ask = () => {
    setPause(phase === 'running');
    setConfirming(true);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminKeys.overview });

  const start = useMutation({
    mutationFn: async () => {
      await api((client) => client.admin.startGame());
      // A game paused and then wiped is not started but still closed; starting it lets teams in.
      if (game.closed)
        await api((client) => client.admin.setClosed({ payload: { closed: false } }));
    },
    onSuccess: () => {
      void refresh();
      toast.success('Hra běží. Týmy se mohou přihlásit.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const change = useMutation({
    mutationFn: () => api((client) => client.admin.setClosed({ payload: { closed: pause } })),
    onSuccess: (settings) => {
      void refresh();
      toast.success(settings.closed ? 'Hra je pozastavená.' : 'Hra pokračuje.');
      setConfirming(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Nothing to wipe in a game never started that no team has entered yet.
  const hasProgress = phase !== 'idle' || teams.some((team) => team.node !== undefined);

  return (
    <Card className={cn('lg:col-span-2', phase === 'paused' && 'ring-2 ring-destructive')}>
      <CardHeader className='flex flex-row items-center justify-between gap-4'>
        <div className='flex flex-col gap-1.5'>
          <CardTitle className='flex items-center gap-2'>
            Hra
            <Badge variant={badge.variant}>
              <badge.Icon /> {badge.label}
            </Badge>
          </CardTitle>
          <CardDescription>{DESCRIPTION[phase](game)}</CardDescription>
        </div>
        {phase === 'idle' ? (
          <Button size='sm' disabled={start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? <IconLoader2 className='animate-spin' /> : <IconPlayerPlay />}
            Spustit hru
          </Button>
        ) : phase === 'running' ? (
          <Button variant='outline' size='sm' onClick={ask}>
            <IconPlayerPause /> Pozastavit
          </Button>
        ) : (
          <Button size='sm' onClick={ask}>
            <IconPlayerPlay /> Pokračovat
          </Button>
        )}
      </CardHeader>

      {hasProgress && (
        <CardFooter className='justify-between gap-4'>
          <p className='text-sm text-muted-foreground'>
            Smaže postup všech týmů a odhlásí jejich telefony. Hru pak spustíte znovu.
          </p>
          <Button
            variant='outline'
            size='sm'
            className='shrink-0 text-destructive hover:text-destructive'
            onClick={onResetAll}
          >
            <IconRotate /> Smazat postup…
          </Button>
        </CardFooter>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pause ? 'Pozastavit hru?' : 'Pokračovat ve hře?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pause
                ? 'Všechny týmy na cestě hned přestanou hrát: telefony ukážou, že je hra zavřená, a nové se nepřihlásí. Týmy, které už došly do cíle, zůstanou u svého konce. Postup týmů zůstane a po pokračování navážou, kde skončily.'
                : 'Týmy mohou hned pokračovat a nové telefony se mohou přihlásit.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            {/* A plain button, so the dialog stays open until the server confirms. */}
            <Button
              variant={pause ? 'destructive' : 'default'}
              disabled={change.isPending}
              onClick={() => change.mutate()}
            >
              {change.isPending && <IconLoader2 className='animate-spin' />}
              {pause ? 'Pozastavit' : 'Pokračovat'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
