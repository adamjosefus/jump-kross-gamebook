import type { TeamStatus } from '@gamebook/api';
import { IconArrowBackUp, IconLoader2 } from '@tabler/icons-react';
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

import { GameControl, teamHasProgress } from './game-control';
import { useOverview, useStoryGraph } from './queries';
import { ResetDialog } from './reset-dialog';

/**
 * A compact table across the whole width of its card: the rows run edge to edge and the outer
 * cells keep the card's padding, so the text lines up with the card's title.
 */
const CARD_TABLE =
  '[&_td]:py-1 [&_th]:h-8 [&_tr>*:first-child]:pl-(--card-spacing) [&_tr>*:last-child]:pr-(--card-spacing)';

/**
 * The game's phase, its teams and QR codes, the latter two from the story. The admin starts, pauses
 * and resumes the game, puts one team back on the start, or wipes every team's progress.
 */
export const GamePage = () => {
  const overview = useOverview();
  const startNode = useStoryGraph().data?.start;
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
      <GameControl game={game} teams={teams} onResetAll={() => openReset(null)} />

      <Card>
        <CardHeader>
          <CardTitle>Týmy</CardTitle>
          <CardDescription>
            Týmy jsou součástí příběhu (<code>teams</code> v{' '}
            <code>packages/story/src/story.ts</code>). Tým začne na startu, když se po spuštění hry
            poprvé přihlásí svým kódem.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-0'>
          <Table className={CARD_TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead className='w-12'>#</TableHead>
                <TableHead>Název</TableHead>
                <TableHead>Kde je</TableHead>
                <TableHead className='w-px' />
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
                  <TableCell className='text-right'>
                    {/* A team without progress is already where this would put it. */}
                    {teamHasProgress(team, startNode) && (
                      <Button
                        variant='ghost'
                        size='xs'
                        className='text-muted-foreground'
                        title='Vrátit tým na start a smazat jeho postup'
                        aria-label={`Vrátit tým ${team.name} na start`}
                        onClick={() => openReset(team)}
                      >
                        <IconArrowBackUp /> Na start
                      </Button>
                    )}
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
        <CardContent className='px-0'>
          <Table className={CARD_TABLE}>
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
