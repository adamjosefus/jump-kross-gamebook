import type { TeamStatus } from '@gamebook/api';
import type { GameGraph, Value } from '@gamebook/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, MoveRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { StoryGraph } from '@/features/story/story-graph';
import { api, errorMessage } from '@/lib/api';

import { adminKeys, useOverview, useStoryGraph } from './queries';

const isState = (value: unknown): value is Record<string, Value> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => ['string', 'number', 'boolean'].includes(typeof v));

const POLL_MS = 5_000;

const timeAgo = (iso: string) => {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `před ${seconds} s`;
  if (seconds < 3600) return `před ${Math.round(seconds / 60)} min`;
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
};

const formatState = (state: Readonly<Record<string, Value>>) =>
  Object.entries(state)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ');

const ACTION_LABELS: Record<string, string> = {
  start: 'start',
  reset: 'reset',
  admin: 'zásah organizátora',
};
const actionLabel = (action: string) =>
  ACTION_LABELS[action] ??
  (action.startsWith('scan:')
    ? `sken místa ${action.slice(5)}`
    : action.startsWith('choice:')
      ? 'volba'
      : action);

/** Live view of every team, refreshed by polling. */
export const DashboardPage = () => {
  const overview = useOverview(POLL_MS);
  const graph = useStoryGraph().data;
  const [moving, setMoving] = useState<TeamStatus>();

  if (overview.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (overview.isError)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { teams, log } = overview.data;
  const names = new Map(teams.map((team) => [team.id, team.name]));

  return (
    <div className='grid gap-6 p-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
      <div className='flex min-w-0 flex-col gap-6'>
        <Card>
          <CardHeader>
            <CardTitle>Týmy</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tým</TableHead>
                  <TableHead>Uzel</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>Zařízení</TableHead>
                  <TableHead>Aktivita</TableHead>
                  <TableHead className='w-20' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className='font-medium'>{team.name}</TableCell>
                    <TableCell>
                      <span className='flex items-center gap-1.5 font-mono'>
                        {team.node ?? '—'}
                        {!team.nodeExists && (
                          <AlertTriangle
                            className='size-4 text-destructive'
                            aria-label='Uzel v příběhu chybí'
                          />
                        )}
                        {team.finished && <Badge variant='secondary'>cíl</Badge>}
                      </span>
                    </TableCell>
                    <TableCell
                      className='max-w-56 truncate font-mono text-xs text-muted-foreground'
                      title={formatState(team.state)}
                    >
                      {formatState(team.state)}
                    </TableCell>
                    <TableCell>{team.devices}</TableCell>
                    <TableCell className='text-xs text-muted-foreground'>
                      {timeAgo(team.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='icon'
                        title='Přesunout tým'
                        onClick={() => setMoving(team)}
                      >
                        <MoveRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {graph !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle>Kde jsou týmy</CardTitle>
            </CardHeader>
            <CardContent className='h-[60vh]'>
              <StoryGraph graph={graph} highlight={teams.flatMap((team) => team.node ?? [])} />
            </CardContent>
          </Card>
        )}
      </div>

      <Card className='h-fit'>
        <CardHeader>
          <CardTitle>Poslední kroky</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className='flex flex-col gap-2 text-sm'>
            {log.map((entry, i) => (
              <li key={i} className='flex items-baseline gap-2'>
                <span className='w-16 shrink-0 text-xs text-muted-foreground'>
                  {timeAgo(entry.at)}
                </span>
                <span className='font-medium'>{names.get(entry.teamId) ?? `#${entry.teamId}`}</span>
                <span className='font-mono'>
                  {entry.fromNode ?? '·'} → {entry.toNode ?? '·'}
                </span>
                <span className='text-muted-foreground'>{actionLabel(entry.action)}</span>
              </li>
            ))}
            {log.length === 0 && <li className='text-muted-foreground'>Zatím nic.</li>}
          </ol>
        </CardContent>
      </Card>

      {moving !== undefined && graph !== undefined && (
        <MoveDialog team={moving} graph={graph} onClose={() => setMoving(undefined)} />
      )}
    </div>
  );
};

const MoveDialog = ({
  team,
  graph,
  onClose,
}: {
  team: TeamStatus;
  graph: GameGraph;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const [node, setNode] = useState(team.node ?? team.startNode);
  const [stateText, setStateText] = useState(JSON.stringify(team.state, null, 2));

  const parsedState = (() => {
    try {
      const value: unknown = JSON.parse(stateText);
      return isState(value) ? value : undefined;
    } catch {
      return undefined;
    }
  })();

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
    onClose();
  };
  const move = useMutation({
    mutationFn: () =>
      api((client) =>
        client.admin.moveTeam({
          params: { id: team.id },
          payload: { node, state: parsedState ?? {} },
        }),
      ),
    onSuccess: done,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const reset = useMutation({
    mutationFn: () => api((client) => client.admin.resetTeam({ params: { id: team.id } })),
    onSuccess: done,
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tým {team.name}</DialogTitle>
          <DialogDescription>
            Přesun i úprava stavu se okamžitě projeví na všech zařízeních týmu.
          </DialogDescription>
        </DialogHeader>
        <Select value={node} onValueChange={setNode}>
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {graph.order.map((id) => (
              <SelectItem key={id} value={id}>
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={stateText}
          onChange={(event) => setStateText(event.target.value)}
          className='min-h-32 font-mono text-xs'
          aria-invalid={parsedState === undefined}
        />
        <DialogFooter className='sm:justify-between'>
          <Button
            variant='outline'
            onClick={() => {
              if (confirm(`Vrátit tým ${team.name} na start ${team.startNode}?`)) reset.mutate();
            }}
            disabled={reset.isPending}
          >
            <RotateCcw /> Na start
          </Button>
          <Button
            onClick={() => move.mutate()}
            disabled={parsedState === undefined || move.isPending}
          >
            Uložit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
