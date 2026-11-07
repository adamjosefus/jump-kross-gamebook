import type { Device } from '@gamebook/api';
import { IconAlertTriangle, IconBan, IconLoader2, IconLogout } from '@tabler/icons-react';
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

import { deviceLabel } from './device-label';
import { formatDateTime } from './format';
import { adminKeys } from './queries';

export type DeviceAction = 'logout' | 'ban';

const TEXTS = {
  logout: {
    title: 'Odhlásit zařízení',
    word: 'ODHLÁSIT',
    button: 'Odhlásit zařízení',
    warnings: [
      'Telefon se okamžitě odhlásí, i uprostřed hraní, a ukáže úvod hry.',
      'Tým o postup nepřijde, ale na tomto telefonu bude muset znovu naskenovat kód týmu.',
      'Kdo má kód týmu, může se tímto telefonem zase přihlásit.',
    ],
    done: 'Zařízení je odhlášené.',
  },
  ban: {
    title: 'Zablokovat zařízení',
    word: 'ZABLOKOVAT',
    button: 'Zablokovat zařízení',
    warnings: [
      'Telefon se okamžitě odhlásí ze všech týmů a už se nepřihlásí k žádnému, dokud ho neodblokujete.',
      'Tým o postup nepřijde; ostatní telefony týmu hrají dál.',
      'Blokuje se prohlížeč v telefonu: kdo smaže data prohlížeče nebo použije anonymní okno či jiný telefon, přihlásí se znovu.',
    ],
    done: 'Zařízení je zablokované.',
  },
} as const;

/**
 * Logs a device out or bans it. Both reach a phone in the middle of the game, so the dialog says
 * what happens, shows which device it is and has the admin type a word to confirm.
 */
export const DeviceActionDialog = ({
  device,
  action,
  onClose,
}: {
  readonly device: Device;
  readonly action: DeviceAction;
  readonly onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const texts = TEXTS[action];
  const confirmed = typed.trim().toLocaleUpperCase('cs-CZ') === texts.word;

  const run = useMutation({
    mutationFn: () =>
      action === 'logout'
        ? api((client) => client.admin.logoutDevice({ params: { id: device.id } }))
        : api((client) => client.admin.banDevice({ params: { id: device.id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.devices });
      toast.success(texts.done);
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='ring-2 ring-destructive'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 pr-6 text-destructive'>
            <IconAlertTriangle className='size-5 shrink-0' /> {texts.title}
          </DialogTitle>
          <DialogDescription>
            {deviceLabel(device.userAgent)} týmu {device.teamName}
          </DialogDescription>
        </DialogHeader>
        <form
          className='flex flex-col gap-4'
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed) run.mutate();
          }}
        >
          <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border p-3 text-sm'>
            <dt className='text-muted-foreground'>Tým</dt>
            <dd>{device.teamName}</dd>
            <dt className='text-muted-foreground'>Zařízení</dt>
            <dd className='break-words' title={device.userAgent}>
              {deviceLabel(device.userAgent)}{' '}
              <span className='font-mono text-xs text-muted-foreground'>
                {device.id.slice(0, 6)}
              </span>
            </dd>
            <dt className='text-muted-foreground'>Přihlášeno</dt>
            <dd className='tabular-nums'>{formatDateTime(device.loggedInAt)}</dd>
            <dt className='text-muted-foreground'>IP adresa</dt>
            <dd className='font-mono text-xs leading-5'>{device.ip ?? 'neznámá'}</dd>
          </dl>
          <div role='alert' className='rounded-lg bg-red-700 p-3 text-white'>
            <p className='font-semibold'>Pozor, zasahujete do živé hry!</p>
            <ul className='mt-1 list-disc pl-4'>
              {texts.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
          <div className='flex flex-col gap-2'>
            <label htmlFor='device-confirm' className='text-sm'>
              Pro potvrzení napište <strong className='font-mono'>{texts.word}</strong>
            </label>
            <Input
              id='device-confirm'
              autoComplete='off'
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type='submit'
              className='bg-red-700 text-white hover:bg-red-800'
              disabled={!confirmed || run.isPending}
            >
              {run.isPending ? (
                <IconLoader2 className='animate-spin' />
              ) : action === 'logout' ? (
                <IconLogout />
              ) : (
                <IconBan />
              )}
              {texts.button}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
