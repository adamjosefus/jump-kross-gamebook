import type { PlayerView } from '@gamebook/api';
import { parseQr } from '@gamebook/core';
import { IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type ComponentProps } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api, errorMessage, isApiError } from '@/lib/api';

import { NodeScreens } from './node-screens';
import { PlayerFrame } from './player-frame';
import { useReadingReport } from './reading';

const STATE_KEY = ['player', 'state'] as const;

/** Polling keeps every device of a team on the same node; slower while the team walks to a location. */
const refetchInterval = (view: PlayerView | null | undefined) =>
  view == null || view.status === 'finished' ? false : view.node?.scan === true ? 30_000 : 10_000;

export const PlayerPage = () => {
  const queryClient = useQueryClient();
  const search = useSearch({ from: '/' });
  const navigate = useNavigate();
  // Login code of another team scanned mid-game; kept while the dialog animates out.
  const [switchCode, setSwitchCode] = useState<string>();
  const [switchOpen, setSwitchOpen] = useState(false);

  const state = useQuery({
    queryKey: STATE_KEY,
    queryFn: ({ signal }) =>
      api((client) => client.player.state(), { signal }).catch((error: unknown) => {
        if (isApiError(error, 'Unauthorized')) return null;
        throw error;
      }),
    refetchInterval: (query) => refetchInterval(query.state.data),
  });
  const view = state.data;

  const onResult = (next: PlayerView) => queryClient.setQueryData(STATE_KEY, next);
  const onError = (error: unknown) => {
    toast.error(errorMessage(error));
    if (isApiError(error, 'StepConflict') || isApiError(error, 'InvalidMove')) {
      void queryClient.invalidateQueries({ queryKey: STATE_KEY });
    }
  };

  const login = useMutation({
    mutationFn: (code: string) => api((client) => client.player.login({ payload: { code } })),
    onSuccess: (next) => {
      onResult(next);
      toast.success(`Jste tým ${next.team.name}`);
    },
    onError,
  });
  const choose = useMutation({
    mutationFn: ({ index, step }: { index: number; step: number }) =>
      api((client) => client.player.choose({ payload: { index, expectedStep: step } })),
    onSuccess: onResult,
    onError,
  });
  const scan = useMutation({
    mutationFn: ({ code, step }: { code: string; step: number }) =>
      api((client) => client.player.scan({ payload: { code, expectedStep: step } })),
    onSuccess: onResult,
    onError,
  });

  const onCode = (code: string) => {
    if (view == null) return login.mutate(code);
    const parsed = parseQr(code);
    if (parsed?.kind !== 'T') return scan.mutate({ code, step: view.step });
    // A login code switches the device to that team, but only after asking: a stray card of
    // another team must not move a player over by accident.
    if (parsed.id === view.team.id) return toast.info(`Už hrajete za tým ${view.team.name}.`);
    setSwitchCode(code);
    setSwitchOpen(true);
  };

  // The slide button is the confirmation, so a choice is sent right away.
  const pick = (choice: { index: number }) => {
    if (view != null) choose.mutate({ index: choice.index, step: view.step });
  };

  const busy = login.isPending || choose.isPending || scan.isPending;

  if (state.isPending)
    return (
      <main className={PAGE}>
        <PlayerFrame>
          <Centered>
            <IconLoader2 className='size-6 animate-spin' />
          </Centered>
        </PlayerFrame>
      </main>
    );

  const aside = view != null && (
    <div className='flex items-center gap-2'>
      <span>
        Tým <strong className='text-foreground'>{view.team.name}</strong>
      </span>
      {busy && <IconLoader2 className='size-4 animate-spin' />}
    </div>
  );

  return (
    <main className={PAGE}>
      {view == null ? (
        <Intro
          onCode={onCode}
          busy={busy}
          initialIndex={search.step === undefined ? (search.screen ?? 0) : 0}
          onIndexChange={(screen) => void navigate({ to: '/', search: { screen }, replace: true })}
        />
      ) : view.status === 'not-ready' || view.node === undefined ? (
        <PlayerFrame aside={aside}>
          <Centered>
            <p className='text-center text-balance'>
              Hra ještě nezačala. Vyčkejte na pokyn organizátorů.
            </p>
          </Centered>
        </PlayerFrame>
      ) : (
        <TeamNodeScreens
          teamId={view.team.id}
          node={view.node}
          step={view.step}
          visitScope={`team-${view.team.id}`}
          aside={aside}
          busy={busy}
          onCode={onCode}
          onPick={pick}
          // The screen in the URL belongs to one step; after a move the node opens at its start.
          initialIndex={search.step === view.step ? (search.screen ?? 0) : 0}
          onIndexChange={(screen) =>
            void navigate({ to: '/', search: { step: view.step, screen }, replace: true })
          }
        />
      )}

      <AlertDialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <AlertDialogContent className='font-story'>
          <AlertDialogHeader>
            <AlertDialogTitle>Přepnout na jiný tým?</AlertDialogTitle>
            <AlertDialogDescription>
              Naskenovali jste přihlašovací kód jiného týmu. Když přepnete, bude tento telefon hrát
              za něj místo za tým {view?.team.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zůstat v týmu {view?.team.name}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (switchCode !== undefined) login.mutate(switchCode);
              }}
            >
              Přepnout tým
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

/** The screens of a logged-in team, whose reading time is measured. */
const TeamNodeScreens = ({
  teamId,
  ...props
}: ComponentProps<typeof NodeScreens> & { teamId: number }) => (
  <NodeScreens {...props} onRead={useReadingReport(teamId)} />
);

const PAGE = 'flex min-h-dvh flex-col font-story';

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className='flex min-h-[60dvh] flex-1 items-center justify-center'>{children}</div>
);

/**
 * Before login: the story's intro, the same for every team, and after it the scanner like at the
 * end of any node. Scanning a team's code logs the device in.
 */
const Intro = ({
  onCode,
  busy,
  initialIndex,
  onIndexChange,
}: {
  onCode: (code: string) => void;
  busy: boolean;
  initialIndex: number;
  onIndexChange: (index: number) => void;
}) => {
  const intro = useQuery({
    queryKey: ['player', 'intro'],
    queryFn: ({ signal }) => api((client) => client.player.intro(), { signal }),
    staleTime: Infinity,
  });
  if (intro.isPending)
    return (
      <PlayerFrame>
        <Centered>
          <IconLoader2 className='size-6 animate-spin' />
        </Centered>
      </PlayerFrame>
    );
  if (intro.isError)
    return (
      <PlayerFrame>
        <Centered>
          <p className='text-center text-balance text-destructive'>{errorMessage(intro.error)}</p>
        </Centered>
      </PlayerFrame>
    );
  return (
    <NodeScreens
      node={{ ...intro.data, id: 'intro', type: 'passage', choices: [], scan: true }}
      step={0}
      visitScope='intro'
      busy={busy}
      onCode={onCode}
      onPick={() => {}}
      initialIndex={initialIndex}
      onIndexChange={onIndexChange}
      requireCamera
    />
  );
};
