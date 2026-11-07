import type { GameInfo } from '@gamebook/api';
import { IconLoader2, IconLock, IconLockOpen } from '@tabler/icons-react';
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
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';

import { adminKeys } from './queries';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Opens or closes the whole game. Closed, no device logs in or moves; the logged-in ones stay
 * logged in, show that the game is closed and go on where they were once it opens again.
 */
export const GameSwitch = ({ game }: { readonly game: GameInfo }) => {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const next = !game.closed;

  const change = useMutation({
    mutationFn: () => api((client) => client.admin.setClosed({ payload: { closed: next } })),
    onSuccess: (settings) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
      toast.success(settings.closed ? 'Hra je zavřená.' : 'Hra je otevřená.');
      setConfirming(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card className={game.closed ? 'ring-2 ring-destructive lg:col-span-2' : 'lg:col-span-2'}>
      <CardHeader className='flex flex-row items-center justify-between gap-4'>
        <div className='flex flex-col gap-1.5'>
          <CardTitle className='flex items-center gap-2'>
            Stav hry
            {game.closed ? (
              <Badge variant='destructive'>
                <IconLock /> Zavřená
              </Badge>
            ) : (
              <Badge variant='secondary'>
                <IconLockOpen /> Otevřená
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {game.closed
              ? 'Týmy teď nemohou hrát: nové telefony se nepřihlásí a přihlášené jen ukazují, že je hra zavřená. Test v adminu funguje dál.'
              : 'Týmy mohou hrát. Zavřením hru zastavíte všem najednou, postup týmů zůstane.'}
            {game.closedChangedAt !== undefined && (
              <>
                {' '}
                {game.closed ? 'Zavřená od' : 'Otevřená od'} {formatTime(game.closedChangedAt)}.
              </>
            )}
          </CardDescription>
        </div>
        <Button
          variant={game.closed ? 'default' : 'destructive'}
          size='sm'
          onClick={() => setConfirming(true)}
        >
          {game.closed ? <IconLockOpen /> : <IconLock />}
          {game.closed ? 'Otevřít hru' : 'Zavřít hru'}
        </Button>
      </CardHeader>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{next ? 'Zavřít hru?' : 'Otevřít hru?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {next
                ? 'Všechny týmy hned přestanou hrát: telefony ukážou, že je hra zavřená, a nové se nepřihlásí. Postup týmů zůstane a po otevření pokračují, kde skončily.'
                : 'Týmy mohou hned pokračovat a nové telefony se mohou přihlásit.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            {/* A plain button, so the dialog stays open until the server confirms. */}
            <Button
              variant={next ? 'destructive' : 'default'}
              disabled={change.isPending}
              onClick={() => change.mutate()}
            >
              {change.isPending && <IconLoader2 className='animate-spin' />}
              {next ? 'Zavřít hru' : 'Otevřít hru'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
