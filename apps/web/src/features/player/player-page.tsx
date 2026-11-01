import type { PlayerView } from '@gamebook/api';
import { parseQr } from '@gamebook/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, QrCode } from 'lucide-react';
import { useState } from 'react';
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

import { NodeScreens } from './node-screens';
import { QrScannerDialog } from './qr-scanner-dialog';

const STATE_KEY = ['player', 'state'] as const;

/** Polling keeps every device of a team on the same node; slower while the team walks to a location. */
const refetchInterval = (view: PlayerView | null | undefined) =>
  view == null || view.status === 'finished' ? false : view.node?.scan === true ? 30_000 : 10_000;

export const PlayerPage = () => {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
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
    setScanning(false);
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
              onCode={onCode}
              onPick={pick}
            />
          )}
        </>
      )}

      <QrScannerDialog open={scanning} onOpenChange={setScanning} onCode={onCode} />

      <AlertDialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <AlertDialogContent>
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
