import type { GameInfo, TeamStatus } from '@gamebook/api';
import { IconLoader2, IconPlayerPlay, IconRotate } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

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
import { api, errorMessage } from '@/lib/api';

import { formatTime } from './format';
import { GameSwitch } from './game-switch';
import { adminKeys, useOverview } from './queries';
import { ResetDialog } from './reset-dialog';

/**
 * Whether the teams may log in. Until the organisers start the game no team gets in; from then
 * on each team's clock runs from its first login. „Nová hra“ stops the game again.
 */
const GameCard = ({ game }: { readonly game: GameInfo }) => {
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: () => api((client) => client.admin.startGame()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
      toast.success('Hra běží. Týmy se mohou přihlásit.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card className='lg:col-span-2'>
      <CardHeader className='flex flex-row items-start justify-between gap-4'>
        <div className='flex flex-col gap-1.5'>
          <CardTitle>Hra</CardTitle>
          <CardDescription>
            {game.startedAt === undefined
              ? 'Hra neběží: týmy se zatím nemohou přihlásit. Spusťte ji, až budou týmy připravené naskenovat svůj kód.'
              : `Hra běží od ${formatTime(game.startedAt, { seconds: true })}. Čas každého týmu se počítá od jeho prvního přihlášení.`}
          </CardDescription>
        </div>
        {game.startedAt === undefined ? (
          <Button size='sm' disabled={start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? <IconLoader2 className='animate-spin' /> : <IconPlayerPlay />}
            Spustit hru
          </Button>
        ) : (
          // A closed game keeps its start, but nobody plays until it opens again.
          <Badge variant={game.closed ? 'destructive' : 'default'}>
            {game.closed ? 'zavřená' : 'běží'}
          </Badge>
        )}
      </CardHeader>
    </Card>
  );
};

/**
 * The game's start, whether it is open, its teams and QR codes, the latter two from the story. The
 * admin starts the game, closes and opens it, and puts teams back on the start: one team, or every
 * team for a new game.
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
  // The last data stay when a refresh fails; the error is the page only without any.
  if (overview.data === undefined)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { game, teams, codes } = overview.data;

  return (
    <div className='mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-2'>
      <GameCard game={game} />
      <GameSwitch game={game} />

      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-4'>
          <div className='flex flex-col gap-1.5'>
            <CardTitle>Týmy</CardTitle>
            <CardDescription>
              Týmy jsou součástí příběhu (<code>teams</code> v{' '}
              <code>packages/story/src/story.ts</code>). Tým začne na startu, když se po spuštění
              hry poprvé přihlásí svým kódem. Nová hra hru zase zastaví a odhlásí všechny telefony.
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
          <CardTitle>Kódy v příběhu</CardTitle>
          <CardDescription>
            QR kódy, které posouvají týmy dál, jsou součástí příběhu (<code>codes</code> v{' '}
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
              {codes.map((qrCode) => (
                <TableRow key={qrCode.id}>
                  <TableCell className='font-mono'>{qrCode.id}</TableCell>
                  <TableCell>{qrCode.name}</TableCell>
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
