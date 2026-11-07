import type { PlayerView } from '@gamebook/api';
import { parseQr } from '@gamebook/core';
import { IconLoader2, IconRefresh, IconWifiOff } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type ComponentProps, type ReactNode } from 'react';

import { ActionButton } from '@/components/action-button';
import { api, errorMessage, isApiError } from '@/lib/api';
import { APP_VERSION } from '@/lib/version';

import { ConfirmDialog } from './confirm-dialog';
import { NodeScreens } from './node-screens';
import { PlayerFrame } from './player-frame';
import { playerToast } from './player-toast';
import { ACCEPTED_MS, type ScanOutcome } from './qr-scanner';
import { useReadingReport } from './reading';

const STATE_KEY = ['player', 'state'] as const;

/** Polling keeps every device of a team on the same node; slower while the team walks to a location. */
const refetchInterval = (view: PlayerView | null | undefined) =>
  view == null || view.status === 'finished' ? false : view.node?.scan === true ? 30_000 : 10_000;

/** After a failed request (no signal in the field) the next try comes soon, whatever the node. */
const RETRY_MS = 10_000;

const isView = (value: unknown): value is PlayerView =>
  typeof value === 'object' && value !== null && 'step' in value && 'team' in value;

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
    refetchInterval: (query) =>
      query.state.status === 'error' ? RETRY_MS : refetchInterval(query.state.data),
    // A poll that left before a move and arrives after it carries the team's old step; it must
    // not take the screen back. Being logged out (null) or in is not a step and always applies.
    structuralSharing: (old: unknown, next: unknown) =>
      isView(old) && isView(next) && next.team.id === old.team.id && next.step < old.step
        ? old
        : next,
  });
  const view = state.data;

  // A poll still in flight would overwrite the move's result when it lands; it is dropped first.
  const onResult = async (next: PlayerView) => {
    await queryClient.cancelQueries({ queryKey: STATE_KEY });
    queryClient.setQueryData(STATE_KEY, next);
  };
  const onError = (error: unknown) => {
    playerToast.error(errorMessage(error));
    if (isApiError(error, 'StepConflict') || isApiError(error, 'InvalidMove')) {
      void queryClient.invalidateQueries({ queryKey: STATE_KEY });
    }
  };

  const onLogin = (next: PlayerView) => {
    void onResult(next);
    playerToast.success(next.loginMessages.loggedIn);
  };
  const login = useMutation({
    mutationFn: (code: string) => api((client) => client.player.login({ payload: { code } })),
    onError,
  });
  const choose = useMutation({
    mutationFn: ({ index, step }: { readonly index: number; readonly step: number }) =>
      api((client) => client.player.choose({ payload: { index, expectedStep: step } })),
    onSuccess: (next) => void onResult(next),
    onError,
  });
  const scan = useMutation({
    mutationFn: ({ code, step }: { readonly code: string; readonly step: number }) =>
      api((client) => client.player.scan({ payload: { code, expectedStep: step } })),
    onError,
  });

  /**
   * A scanned code taken by the game is shown with a check mark, and the game moves on only after
   * it; one refused (the mutation reports why) is shown with an exclamation mark.
   */
  const answer = async <T,>(
    pending: Promise<T>,
    apply: (result: T) => void,
  ): Promise<ScanOutcome> => {
    try {
      const result = await pending;
      setTimeout(() => apply(result), ACCEPTED_MS);
      return 'accepted';
    } catch {
      return 'rejected';
    }
  };

  const onCode = (code: string): ScanOutcome | Promise<ScanOutcome> => {
    if (view == null) return answer(login.mutateAsync(code), onLogin);
    const parsed = parseQr(code);
    if (parsed?.kind !== 'T')
      return answer(scan.mutateAsync({ code, step: view.step }), (next) => void onResult(next));
    // A login code switches the device to that team, but only after asking: a stray card of
    // another team must not move a player over by accident.
    if (parsed.id === view.team.id) {
      playerToast.info(view.loginMessages.sameTeam);
      return 'rejected';
    }
    setSwitchCode(code);
    setSwitchOpen(true);
    return undefined;
  };

  // The slide button is the confirmation, so a choice is sent right away.
  const pick = (choice: { readonly index: number }) => {
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

  // The last state is kept while the server cannot be reached; the bar says so instead of the
  // game pretending that nothing happened.
  const aside =
    view != null &&
    (busy ? (
      <IconLoader2 className='size-4 animate-spin' />
    ) : state.isError ? (
      <span className='flex items-center gap-1 text-destructive' role='status'>
        <IconWifiOff className='size-4' aria-hidden />
        <span className='sr-only'>{errorMessage(state.error)}</span>
      </span>
    ) : undefined);

  // Without a state to show (the first load failed) the device may well be logged in: the login
  // screen would be wrong, so the problem is shown with a way to try again.
  if (view === undefined && state.isError)
    return (
      <main className={PAGE}>
        <PlayerFrame>
          <Centered>
            <Problem message={errorMessage(state.error)} onRetry={() => void state.refetch()} />
          </Centered>
        </PlayerFrame>
      </main>
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

      <ConfirmDialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
        title={view?.loginMessages.switchTitle ?? ''}
        confirmLabel={view?.loginMessages.switchConfirm ?? ''}
        cancelLabel={view?.loginMessages.switchCancel ?? ''}
        onConfirm={() => {
          if (switchCode !== undefined) login.mutate(switchCode, { onSuccess: onLogin });
        }}
      >
        {view?.loginMessages.switchText}
      </ConfirmDialog>
    </main>
  );
};

/** The screens of a logged-in team, whose reading time is measured. */
const TeamNodeScreens = ({
  teamId,
  ...props
}: ComponentProps<typeof NodeScreens> & { readonly teamId: number }) => (
  <NodeScreens {...props} onRead={useReadingReport(teamId)} />
);

const PAGE = 'player-page flex min-h-dvh flex-col font-story';

const Centered = ({ children }: { readonly children: ReactNode }) => (
  <div className='flex min-h-[60dvh] flex-1 items-center justify-center'>{children}</div>
);

/** A request that did not go through, with the button to send it again. */
const Problem = ({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) => (
  <div className='flex w-full flex-col items-center gap-6'>
    <p className='text-center text-balance' role='alert'>
      {message}
    </p>
    <ActionButton icon={<IconRefresh className='size-5' />} onClick={onRetry}>
      Zkusit znovu
    </ActionButton>
  </div>
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
  readonly onCode: (code: string) => ScanOutcome | Promise<ScanOutcome>;
  readonly busy: boolean;
  readonly initialIndex: number;
  readonly onIndexChange: (index: number) => void;
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
          <Problem message={errorMessage(intro.error)} onRetry={() => void intro.refetch()} />
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
      corner={APP_VERSION}
    />
  );
};
