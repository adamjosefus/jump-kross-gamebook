import type { PlayerScreen, PlayerView } from '@gamebook/api';
import type { Theme } from '@gamebook/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronLeft, ChevronRight, Flag, Loader2, QrCode } from 'lucide-react';
import { useState } from 'react';
import Markdown from 'react-markdown';
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
import { Button } from '@/components/ui/button';
import { api, errorMessage, isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

import { QrScannerDialog } from './qr-scanner-dialog';

const STATE_KEY = ['player', 'state'] as const;

type PlayerNode = NonNullable<PlayerView['node']>;

/** The locked checkpoint the team has to scan, if any; it is always the last screen. */
const lockedCheckpoint = (node: PlayerNode | undefined) => {
  const last = node?.screens.at(-1)?.checkpoint;
  return last?.unlocked === false ? last : undefined;
};

/** Polling keeps every device of a team on the same node; slower while the team walks to a location. */
const refetchInterval = (view: PlayerView | null | undefined) =>
  view == null || view.status === 'finished'
    ? false
    : lockedCheckpoint(view.node) !== undefined
      ? 30_000
      : 10_000;

const THEME_SCREEN: Record<Theme, string> = {
  default: '',
  intro: 'justify-center text-center',
  letter: '',
  night: '',
};

const THEME_TEXT: Record<Theme, string> = {
  default: '',
  intro: 'text-xl',
  letter:
    'rounded-lg border bg-amber-50 p-6 font-serif text-amber-950 shadow-sm dark:bg-amber-950/30 dark:text-amber-50',
  night: 'rounded-lg bg-slate-950 p-6 text-slate-100 ring-1 ring-slate-800',
};

export const PlayerPage = () => {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  // The choice stays set while the dialog animates out, so its label does not blink.
  const [confirm, setConfirm] = useState<{ index: number; label: string }>();
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    setScanning(false);
    // A team code always logs in, so a device can switch teams by scanning another login code.
    if (code.trim().toUpperCase().startsWith('T:') || view == null) login.mutate(code);
    else scan.mutate({ code, step: view.step });
  };

  const pick = (choice: { index: number; label: string }) => {
    if (view == null) return;
    if (view.node !== undefined && view.node.choices.length >= 2) {
      setConfirm(choice);
      setConfirmOpen(true);
    } else choose.mutate({ index: choice.index, step: view.step });
  };

  const busy = login.isPending || choose.isPending || scan.isPending;

  if (state.isPending)
    return (
      <Centered>
        <Loader2 className='size-6 animate-spin' />
      </Centered>
    );

  return (
    <main className='mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]'>
      {view == null ? (
        <Welcome onScan={() => setScanning(true)} busy={busy} />
      ) : (
        <>
          <header className='flex items-center justify-between text-sm text-muted-foreground'>
            <span>
              Tým <strong className='text-foreground'>{view.team.name}</strong>
            </span>
            {busy && <Loader2 className='size-4 animate-spin' />}
          </header>

          {view.status === 'not-ready' || view.node === undefined ? (
            <Centered>
              <p className='text-center text-muted-foreground'>
                Hra ještě nezačala. Vyčkejte na pokyn organizátorů.
              </p>
            </Centered>
          ) : (
            <NodeScreens
              node={view.node}
              step={view.step}
              busy={busy}
              onScan={() => setScanning(true)}
              onPick={pick}
            />
          )}
        </>
      )}

      <QrScannerDialog open={scanning} onOpenChange={setScanning} onCode={onCode} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opravdu?</AlertDialogTitle>
            <AlertDialogDescription>
              Vybíráte „{confirm?.label}“. Rozhodnutí platí pro celý tým a nejde vrátit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zpět</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm !== undefined && view != null)
                  choose.mutate({ index: confirm.index, step: view.step });
              }}
            >
              Potvrdit volbu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

/**
 * One screen at a time, paged locally with „Další“. When a scan unlocks more screens, the device
 * jumps to the first new one; a new node starts from its first screen.
 */
const NodeScreens = ({
  node,
  step,
  busy,
  onScan,
  onPick,
}: {
  node: PlayerNode;
  step: number;
  busy: boolean;
  onScan: () => void;
  onPick: (choice: { index: number; label: string }) => void;
}) => {
  const count = node.screens.length;
  const [paging, setPaging] = useState({ node: node.id, step, count, index: 0 });
  if (paging.node !== node.id || paging.step !== step) {
    const unlocked = paging.node === node.id && count > paging.count;
    setPaging({ node: node.id, step, count, index: unlocked ? paging.count : 0 });
  }
  const index = Math.min(paging.index, count - 1);
  const go = (to: number) => setPaging({ ...paging, index: to });
  const screen: PlayerScreen | undefined = node.screens[index];
  const theme = screen?.theme ?? 'default';
  const last = index >= count - 1;
  const locked = last ? lockedCheckpoint(node) : undefined;

  return (
    <article
      key={`${node.id}-${step}-${index}`}
      className={cn(
        'flex flex-1 animate-in flex-col gap-6 duration-300 fade-in slide-in-from-bottom-2',
        THEME_SCREEN[theme],
      )}
    >
      {screen !== undefined && (
        <div
          className={cn(
            'prose-gamebook text-lg leading-relaxed',
            THEME_TEXT[theme],
            node.type === 'end' && 'text-center',
          )}
        >
          <Markdown>{screen.content}</Markdown>
        </div>
      )}

      <div className='mt-auto flex flex-col gap-3'>
        {!last ? (
          <Button size='lg' className='h-14 text-base' onClick={() => go(index + 1)}>
            Další <ChevronRight />
          </Button>
        ) : locked !== undefined ? (
          <Button size='lg' className='h-14 text-base' onClick={onScan} disabled={busy}>
            <Camera /> Naskenovat QR kód
          </Button>
        ) : node.type === 'end' ? (
          <p className='flex items-center justify-center gap-2 text-sm text-muted-foreground'>
            <Flag className='size-4' /> Konec hry
          </p>
        ) : (
          node.choices.map((choice) => (
            <Button
              key={choice.index}
              size='lg'
              variant={node.choices.length === 1 ? 'default' : 'outline'}
              className='h-auto min-h-14 py-3 text-base whitespace-normal'
              onClick={() => onPick(choice)}
              disabled={busy}
            >
              {choice.label}
            </Button>
          ))
        )}
        {count > 1 && (
          <div className='flex items-center justify-between text-sm text-muted-foreground'>
            <Button variant='ghost' size='sm' onClick={() => go(index - 1)} disabled={index === 0}>
              <ChevronLeft /> Zpět
            </Button>
            <span>
              {index + 1} / {count}
            </span>
          </div>
        )}
      </div>
    </article>
  );
};

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className='flex min-h-[60dvh] flex-1 items-center justify-center'>{children}</div>
);

const Welcome = ({ onScan, busy }: { onScan: () => void; busy: boolean }) => (
  <Centered>
    <div className='flex max-w-xs flex-col items-center gap-6 text-center'>
      <QrCode className='size-12' strokeWidth={1.5} />
      <div className='flex flex-col gap-2'>
        <h1 className='text-2xl font-semibold'>Vítejte ve hře</h1>
        <p className='text-muted-foreground'>Naskenujte přihlašovací QR kód svého týmu.</p>
      </div>
      <Button size='lg' className='h-14 w-full text-base' onClick={onScan} disabled={busy}>
        {busy ? <Loader2 className='animate-spin' /> : <Camera />} Naskenovat QR kód
      </Button>
    </div>
  </Centered>
);
