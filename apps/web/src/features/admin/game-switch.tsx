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

import { formatDateTime } from './format';
import { adminKeys } from './queries';

/**
 * Opens or closes the whole game. Closed, no device logs in or moves; the logged-in ones stay
 * logged in, show that the game is closed and go on where they were once it opens again.
 */
export const GameSwitch = ({ game }: { readonly game: GameInfo }) => {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  // What the dialog asks for is fixed when it opens: a refresh of the overview meanwhile (another
  // organizer's change) must not turn „Zavřít“ into „Otevřít“ under the admin's cursor.
  const [next, setNext] = useState(!game.closed);
  const ask = () => {
    setNext(!game.closed);
    setConfirming(true);
  };

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
              ? 'Týmy teď nemohou hrát: nové telefony se nepřihlásí a přihlášené jen ukazují, že je hra zavřená. Týmy, které už došly do cíle, zůstávají u svého konce. Test v adminu funguje dál.'
              : 'Týmy mohou hrát. Zavřením hru zastavíte všem najednou, postup týmů zůstane.'}
            {game.closedChangedAt !== undefined && (
              <>
                {' '}
                {game.closed ? 'Zavřená od' : 'Otevřená od'} {formatDateTime(game.closedChangedAt)}.
              </>
            )}
          </CardDescription>
        </div>
        <Button variant={game.closed ? 'default' : 'destructive'} size='sm' onClick={ask}>
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
                ? 'Všechny týmy na cestě hned přestanou hrát: telefony ukážou, že je hra zavřená, a nové se nepřihlásí. Týmy, které už došly do cíle, zůstanou u svého konce. Postup týmů zůstane a po otevření pokračují, kde skončily.'
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
