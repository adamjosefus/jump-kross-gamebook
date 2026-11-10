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
import { jittered, pollSeed } from './poll';
import { ACCEPTED_MS, type ScanOutcome } from './qr-scanner';
import { useReadingReport } from './reading';
import { CLOSED_TEXT, type NextCheck, NOT_STARTED_TEXT, WaitingScreen } from './waiting-screen';

const STATE_KEY = ['player', 'state'] as const;
const INTRO_KEY = ['player', 'intro'] as const;

/**
 * Polling keeps every device of a team on the same node and stops it soon after the organizers
 * pause the game; slower while the team walks to a code. Every interval is jittered, so the phones
 * of all teams do not ask the server at the same moment.
 */
const refetchInterval = (view: PlayerView | null | undefined) =>
  view == null || view.status === 'finished' ? false : view.node?.scan === true ? 30_000 : 10_000;

/** After a failed request (no signal in the field) the next try comes soon, whatever the node. */
const RETRY_MS = 10_000;

type PollState<T> = {
  readonly status: 'pending' | 'error' | 'success';
  readonly data: T | undefined;
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
};

/** The jittered delay of the team's next poll, or false when it does not poll. */
const statePoll = (state: PollState<PlayerView | null>) => {
  const interval = state.status === 'error' ? RETRY_MS : refetchInterval(state.data);
  return interval === false ? false : jittered(interval, pollSeed(state));
};

/** The same delay the query runs on, as the span the waiting screen shows. */
const nextCheck = (state: PollState<unknown>, delay: number | false): NextCheck | undefined => {
  if (delay === false) return undefined;
  const from = pollSeed(state);
  return { from, at: from + delay };
};

/**
 * While the game is not started yet or the admin keeps it closed, the device asks now and then
 * whether the teams can log in.
 */
const WAITING_POLL_MS = 15_000;

/** The jittered delay of the intro's next poll, or false once the teams can log in. */
const introPoll = (state: PollState<{ readonly started: boolean; readonly closed: boolean }>) =>
  state.data !== undefined && (!state.data.started || state.data.closed)
    ? jittered(WAITING_POLL_MS, pollSeed(state))
    : false;

/**
 * Turning a page asks the server again when its last answer is older than this, so a paused game
 * stops a team in the middle of a text, not only at the next poll. Paging quickly through a text
 * does not send a request per page.
 */
const PAGE_CHECK_MS = 3_000;

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
    refetchInterval: (query) => statePoll(query.state),
    // A poll that left before a move and arrives after it carries the team's old step; it must
    // not take the screen back. Being logged out (null) or in is not a step and always applies.
    structuralSharing: (old: unknown, next: unknown) =>
      isView(old) && isView(next) && next.team.id === old.team.id && next.step < old.step
        ? old
        : next,
  });
  const view = state.data;

  // A request already in flight is enough; it is not cancelled for a new one.
  const checkOnPage = () => {
    if (!state.isFetching && Date.now() - state.dataUpdatedAt > PAGE_CHECK_MS)
      void state.refetch({ cancelRefetch: false });
  };

  // A poll still in flight would overwrite the move's result when it lands; it is dropped first.
  const onResult = async (next: PlayerView) => {
    await queryClient.cancelQueries({ queryKey: STATE_KEY });
    queryClient.setQueryData(STATE_KEY, next);
  };
  const onError = (error: unknown) => {
    playerToast.error(errorMessage(error));
    if (
      isApiError(error, 'StepConflict') ||
      isApiError(error, 'InvalidMove') ||
      isApiError(error, 'GameClosed')
    ) {
      void queryClient.invalidateQueries({ queryKey: STATE_KEY });
    }
    // The intro shows a game not started or closed in place of the scanner.
    if (isApiError(error, 'GameClosed') || isApiError(error, 'GameNotStarted'))
      void queryClient.invalidateQueries({ queryKey: INTRO_KEY });
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
      ) : view.status === 'closed' ? (
        // The node is gone from the screen: a paused game is not read on. The page polls and
        // opens the team's screen again once the game runs.
        <WaitingScreen
          message={CLOSED_TEXT}
          aside={aside}
          nextCheck={nextCheck(state, statePoll(state))}
        />
      ) : view.status === 'not-ready' || view.node === undefined ? (
        <WaitingScreen
          message={NOT_STARTED_TEXT}
          aside={aside}
          nextCheck={nextCheck(state, statePoll(state))}
        />
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
          onIndexChange={(screen) => {
            checkOnPage();
            void navigate({ to: '/', search: { step: view.step, screen }, replace: true });
          }}
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
    queryKey: INTRO_KEY,
    queryFn: ({ signal }) => api((client) => client.player.intro(), { signal }),
    // The story changes only with a deploy; only a game the teams cannot log in to yet is asked
    // again, until they can.
    staleTime: Infinity,
    refetchInterval: (query) => introPoll(query.state),
  });
  // A poll that fails while waiting keeps the last answer on the screen and the next one tries
  // again; only an intro never loaded shows the problem.
  if (intro.data === undefined)
    return (
      <PlayerFrame>
        <Centered>
          {intro.isError ? (
            <Problem message={errorMessage(intro.error)} onRetry={() => void intro.refetch()} />
          ) : (
            <IconLoader2 className='size-6 animate-spin' />
          )}
        </Centered>
      </PlayerFrame>
    );
  const { started, closed, ...content } = intro.data;
  // Until the teams can log in, the waiting screen comes first, before the intro.
  if (!started || closed)
    return (
      <WaitingScreen
        message={started ? CLOSED_TEXT : NOT_STARTED_TEXT}
        corner={APP_VERSION}
        nextCheck={nextCheck(intro, introPoll(intro))}
      />
    );
  return (
    <NodeScreens
      node={{ ...content, id: 'intro', type: 'passage', choices: [], scan: true }}
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
