import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

import { adminKeys } from './queries';

const NEW_GAME = 'NOVÁ HRA';

/**
 * Puts one team, or every team, back on the start with the initial state. The progress is lost
 * on every device of the team at once, so the admin has to type the team's name (or „NOVÁ HRA“)
 * to confirm.
 */
export const ResetDialog = ({
  team,
  open,
  onOpenChange,
  onDone,
}: {
  /** Missing: every team, as for a new game. */
  readonly team?: { readonly id: number; readonly name: string };
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone?: () => void;
}) => {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const word = team?.name ?? NEW_GAME;

  const reset = useMutation({
    mutationFn: async () => {
      await (team === undefined
        ? api((client) => client.admin.resetAll())
        : api((client) => client.admin.resetTeam({ params: { id: team.id } })));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
      toast.success(
        team === undefined ? 'Všechny týmy jsou na startu.' : `Tým ${team.name} je na startu.`,
      );
      close(false);
      onDone?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Every way of closing forgets what was typed, so the destructive button is never armed on the
  // next opening.
  const close = (next: boolean) => {
    if (!next) setTyped('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-destructive'>
            <IconAlertTriangle className='size-5' />
            {team === undefined ? 'Nová hra pro všechny týmy' : `Vrátit tým ${team.name} na start`}
          </DialogTitle>
          <DialogDescription>
            {team === undefined
              ? 'Všechny týmy přijdou o celý postup a začnou znovu od startu s výchozím stavem. Hra se zastaví a všechny telefony se odhlásí; přihlásí se zase, až hru znovu spustíte.'
              : 'Tým přijde o celý postup a začne znovu od startu s výchozím stavem. Jeho telefony se odhlásí a čas týmu začne běžet znovu od jeho dalšího přihlášení.'}{' '}
            Projeví se to hned na všech telefonech a nejde to vrátit.
          </DialogDescription>
        </DialogHeader>
        <form
          className='flex flex-col gap-2'
          onSubmit={(event) => {
            event.preventDefault();
            if (typed === word) reset.mutate();
          }}
        >
          <label htmlFor='reset-confirm' className='text-sm'>
            Pro potvrzení napište <strong className='font-mono'>{word}</strong>
          </label>
          <Input
            id='reset-confirm'
            autoComplete='off'
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <DialogFooter className='mt-2'>
            <Button type='button' variant='outline' onClick={() => close(false)}>
              Zrušit
            </Button>
            <Button
              type='submit'
              variant='destructive'
              disabled={typed !== word || reset.isPending}
            >
              {reset.isPending && <IconLoader2 className='animate-spin' />}
              {team === undefined ? 'Začít novou hru' : 'Vrátit na start'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
