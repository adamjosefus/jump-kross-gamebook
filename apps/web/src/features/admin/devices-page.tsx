import type { BannedDevice, Device } from '@gamebook/api';
import { IconBan, IconLoader2, IconLockOpen, IconLogout } from '@tabler/icons-react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TeamAvatar } from '@/features/teams/team-avatar';
import { api, errorMessage } from '@/lib/api';

import { DeviceActionDialog, type DeviceAction } from './device-action-dialog';
import { deviceLabel } from './device-label';
import { adminKeys, useOverview } from './queries';

const POLL_MS = 10_000;

const ALL_TEAMS = 'all';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const timeAgo = (iso: string) => {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `před ${seconds} s`;
  if (seconds < 3600) return `před ${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `před ${Math.round(seconds / 3600)} h`;
  return formatTime(iso);
};

/**
 * Every device logged in to a team: when it logged in, from which address, what it is and when
 * it was last seen. A device stays here until it logs out or its login expires after two days.
 * The admin can log a device out or ban it; banned devices are listed below, to be unbanned.
 */
export const DevicesPage = () => {
  const overview = useOverview(POLL_MS);
  const [team, setTeam] = useState(ALL_TEAMS);
  const [acting, setActing] = useState<{
    readonly device: Device;
    readonly action: DeviceAction;
  }>();

  if (overview.isPending) return <IconLoader2 className='m-8 size-6 animate-spin' />;
  if (overview.data === undefined)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { devices, teams, bans } = overview.data;
  const shown =
    team === ALL_TEAMS ? devices : devices.filter(({ teamId }) => String(teamId) === team);
  const active = devices.filter((device) => device.active).length;

  return (
    <div className='mx-auto flex max-w-6xl flex-col gap-6 p-6'>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div className='flex flex-col gap-1.5'>
            <CardTitle>
              Přihlášená zařízení{' '}
              <span className='font-normal text-muted-foreground'>
                {devices.length} · aktivních {active}
              </span>
            </CardTitle>
            <CardDescription>
              Telefony přihlášené kódem týmu, naposledy viděné nahoře. Aktivní je zařízení, které se
              ozvalo v posledních dvou minutách. Přihlášení vyprší po dvou dnech nebo odhlášením. IP
              adresa je ta, ze které se zařízení přihlásilo. Zařízení můžete odhlásit nebo
              zablokovat.
            </CardDescription>
          </div>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className='w-44 shrink-0' aria-label='Tým'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TEAMS}>Všechny týmy</SelectItem>
              {teams.map(({ id, name }) => (
                <SelectItem key={id} value={String(id)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {overview.isError && (
            <p role='alert' className='mb-3 text-sm text-destructive'>
              Nepodařilo se obnovit ({errorMessage(overview.error)}). Zobrazená data jsou z{' '}
              {new Date(overview.dataUpdatedAt).toLocaleTimeString('cs-CZ')}.
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tým</TableHead>
                <TableHead>Zařízení</TableHead>
                <TableHead>Přihlášeno</TableHead>
                <TableHead>Naposledy</TableHead>
                <TableHead>IP adresa</TableHead>
                <TableHead className='w-20' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onAction={(action) => setActing({ device, action })}
                />
              ))}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className='text-muted-foreground'>
                    Žádné přihlášené zařízení.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BansCard bans={bans} />

      {acting !== undefined && (
        <DeviceActionDialog
          device={acting.device}
          action={acting.action}
          onClose={() => setActing(undefined)}
        />
      )}
    </div>
  );
};

const DeviceRow = ({
  device,
  onAction,
}: {
  readonly device: Device;
  readonly onAction: (action: DeviceAction) => void;
}) => (
  <TableRow>
    <TableCell>
      <span className='flex items-center gap-2'>
        <TeamAvatar id={device.teamId} name={device.teamName} />
        {device.teamName}
      </span>
    </TableCell>
    <TableCell title={device.userAgent}>
      <span className='flex items-center gap-2'>
        {deviceLabel(device.userAgent)}
        <span className='font-mono text-xs text-muted-foreground'>{device.id.slice(0, 6)}</span>
      </span>
    </TableCell>
    <TableCell className='tabular-nums'>{formatTime(device.loggedInAt)}</TableCell>
    <TableCell className='tabular-nums' title={formatTime(device.lastSeenAt)}>
      <span className='flex items-center gap-2'>
        {device.active ? (
          <Badge variant='secondary'>aktivní</Badge>
        ) : (
          <Badge variant='outline'>neaktivní</Badge>
        )}
        {timeAgo(device.lastSeenAt)}
      </span>
    </TableCell>
    <TableCell className='font-mono text-xs'>
      {device.ip ?? <span className='text-muted-foreground'>neznámá</span>}
    </TableCell>
    <TableCell>
      <span className='flex justify-end'>
        <Button
          variant='ghost'
          size='icon'
          title='Odhlásit zařízení'
          aria-label={`Odhlásit zařízení ${deviceLabel(device.userAgent)} týmu ${device.teamName}`}
          onClick={() => onAction('logout')}
        >
          <IconLogout />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          className='text-destructive hover:text-destructive'
          title={
            device.bannable
              ? 'Zablokovat zařízení'
              : 'Zařízení se přihlásilo před zavedením blokování; jde ho jen odhlásit.'
          }
          aria-label={`Zablokovat zařízení ${deviceLabel(device.userAgent)} týmu ${device.teamName}`}
          disabled={!device.bannable}
          onClick={() => onAction('ban')}
        >
          <IconBan />
        </Button>
      </span>
    </TableCell>
  </TableRow>
);

/** Banned devices, each with the way back. */
const BansCard = ({ bans }: { readonly bans: readonly BannedDevice[] }) => {
  const queryClient = useQueryClient();
  // The ban stays set while the dialog animates out.
  const [unbanning, setUnbanning] = useState<BannedDevice>();
  const [open, setOpen] = useState(false);
  const unban = useMutation({
    mutationFn: (ban: BannedDevice) =>
      api((client) => client.admin.unbanDevice({ params: { id: ban.id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
      toast.success('Zařízení je odblokované.');
      setOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Zablokovaná zařízení{' '}
          <span className='font-normal text-muted-foreground'>{bans.length}</span>
        </CardTitle>
        <CardDescription>
          Zablokované zařízení se nepřihlásí k žádnému týmu. Údaje jsou z chvíle zablokování.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tým</TableHead>
              <TableHead>Zařízení</TableHead>
              <TableHead>Zablokováno</TableHead>
              <TableHead>IP adresa</TableHead>
              <TableHead className='w-32' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bans.map((ban) => (
              <TableRow key={ban.id}>
                <TableCell>
                  <span className='flex items-center gap-2'>
                    <TeamAvatar id={ban.teamId} name={ban.teamName} />
                    {ban.teamName}
                  </span>
                </TableCell>
                <TableCell title={ban.userAgent}>{deviceLabel(ban.userAgent)}</TableCell>
                <TableCell className='tabular-nums'>{formatTime(ban.bannedAt)}</TableCell>
                <TableCell className='font-mono text-xs'>
                  {ban.ip ?? <span className='text-muted-foreground'>neznámá</span>}
                </TableCell>
                <TableCell>
                  <span className='flex justify-end'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setUnbanning(ban);
                        setOpen(true);
                      }}
                    >
                      <IconLockOpen /> Odblokovat
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {bans.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className='text-muted-foreground'>
                  Žádné zablokované zařízení.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odblokovat zařízení?</AlertDialogTitle>
            <AlertDialogDescription>
              {unbanning === undefined
                ? ''
                : `${deviceLabel(unbanning.userAgent)} (tým ${unbanning.teamName}) se pak může znovu přihlásit kódem kteréhokoli týmu.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <Button
              disabled={unban.isPending || unbanning === undefined}
              onClick={() => unbanning !== undefined && unban.mutate(unbanning)}
            >
              {unban.isPending && <IconLoader2 className='animate-spin' />}
              Odblokovat
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
