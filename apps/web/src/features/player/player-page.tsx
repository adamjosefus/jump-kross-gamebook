import type { PlayerView } from '@gamebook/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Flag, Loader2, QrCode } from 'lucide-react';
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

/** Polling keeps every device of a team on the same node; slower while the team walks to a location. */
const refetchInterval = (view: PlayerView | null | undefined) =>
  view == null || view.status === 'finished'
    ? false
    : view.node?.scan !== undefined
      ? 30_000
      : 10_000;

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
            <article
              key={`${view.node.id}-${view.step}`}
              className={cn(
                'flex flex-1 animate-in flex-col gap-6 duration-300 fade-in slide-in-from-bottom-2',
                view.node.theme === 'intro' && 'justify-center text-center',
              )}
            >
              <div
                className={cn(
                  'prose-gamebook text-lg leading-relaxed',
                  view.node.theme === 'intro' && 'text-xl',
                  view.node.type === 'end' && 'text-center',
                )}
              >
                <Markdown>{view.node.markdown}</Markdown>
              </div>

              <div className='mt-auto flex flex-col gap-3'>
                {view.node.type === 'end' ? (
                  <p className='flex items-center justify-center gap-2 text-sm text-muted-foreground'>
                    <Flag className='size-4' /> Konec hry
                  </p>
                ) : view.node.scan !== undefined ? (
                  <Button
                    size='lg'
                    className='h-14 text-base'
                    onClick={() => setScanning(true)}
                    disabled={busy}
                  >
                    <Camera /> Naskenovat QR kód
                  </Button>
                ) : (
                  view.node.choices.map((choice) => (
                    <Button
                      key={choice.index}
                      size='lg'
                      variant={view.node!.choices.length === 1 ? 'default' : 'outline'}
                      className='h-auto min-h-14 py-3 text-base whitespace-normal'
                      onClick={() => pick(choice)}
                      disabled={busy}
                    >
                      {choice.label}
                    </Button>
                  ))
                )}
              </div>
            </article>
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
