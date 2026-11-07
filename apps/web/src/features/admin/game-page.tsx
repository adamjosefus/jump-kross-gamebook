import type { TeamStatus } from '@gamebook/api';
import { IconLoader2, IconRotate } from '@tabler/icons-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api';

import { useOverview } from './queries';
import { ResetDialog } from './reset-dialog';

/**
 * The game's teams and places, both from the story. The admin only puts teams back on the start:
 * one team, or every team for a new game.
 */
export const GamePage = () => {
  const overview = useOverview();
  // The team stays set while the dialog animates out; `null` means every team.
  const [reset, setReset] = useState<TeamStatus | null>();
  const [resetOpen, setResetOpen] = useState(false);
  const openReset = (team: TeamStatus | null) => {
    setReset(team);
    setResetOpen(true);
  };

  if (overview.isPending) return <IconLoader2 className='m-8 size-6 animate-spin' />;
  if (overview.isError)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { teams, locations } = overview.data;

  return (
    <div className='mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-2'>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div className='flex flex-col gap-1.5'>
            <CardTitle>Týmy</CardTitle>
            <CardDescription>
              Týmy jsou součástí příběhu (<code>teams</code> v{' '}
              <code>packages/story/src/story.ts</code>). Tým začne na startu, když se poprvé
              přihlásí svým kódem.
            </CardDescription>
          </div>
          <Button variant='destructive' size='sm' onClick={() => openReset(null)}>
            <IconRotate /> Nová hra
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-12'>#</TableHead>
                <TableHead>Název</TableHead>
                <TableHead>Kde je</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className='font-mono text-muted-foreground'>{team.id}</TableCell>
                  <TableCell>{team.name}</TableCell>
                  <TableCell>
                    {team.node === undefined ? (
                      <span className='text-muted-foreground'>Nezačal</span>
                    ) : (
                      <Badge
                        variant={team.finished ? 'default' : 'secondary'}
                        className='font-mono'
                      >
                        {team.node}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='icon'
                      title='Vrátit na start'
                      aria-label={`Vrátit tým ${team.name} na start`}
                      disabled={team.node === undefined}
                      onClick={() => openReset(team)}
                    >
                      <IconRotate />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Místa</CardTitle>
          <CardDescription>
            Místa s QR kódy jsou součástí příběhu (<code>locations</code> v{' '}
            <code>packages/story/src/story.ts</code>) a mění se s deployem. Kódy k tisku jsou na
            stránce QR kódy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16'>Číslo</TableHead>
                <TableHead>Název</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell className='font-mono'>{location.id}</TableCell>
                  <TableCell>{location.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ResetDialog
        {...(reset == null ? {} : { team: reset })}
        open={resetOpen}
        onOpenChange={setResetOpen}
      />
    </div>
  );
};
