import type { Device } from '@gamebook/api';
import { IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
import { errorMessage } from '@/lib/api';

import { deviceLabel } from './device-label';
import { useOverview } from './queries';

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
 */
export const DevicesPage = () => {
  const overview = useOverview(POLL_MS);
  const [team, setTeam] = useState(ALL_TEAMS);

  if (overview.isPending) return <IconLoader2 className='m-8 size-6 animate-spin' />;
  if (overview.data === undefined)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { devices, teams } = overview.data;
  const shown =
    team === ALL_TEAMS ? devices : devices.filter(({ teamId }) => String(teamId) === team);
  const active = devices.filter((device) => device.active).length;

  return (
    <div className='mx-auto max-w-6xl p-6'>
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
              adresa je ta, ze které se zařízení přihlásilo.
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((device) => (
                <DeviceRow key={device.id} device={device} />
              ))}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className='text-muted-foreground'>
                    Žádné přihlášené zařízení.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const DeviceRow = ({ device }: { readonly device: Device }) => (
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
  </TableRow>
);
