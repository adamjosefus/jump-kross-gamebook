import type { TeamStatus } from '@gamebook/api';
import type { GameGraph, Value } from '@gamebook/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  History,
  Loader2,
  MoveRight,
  Pin,
  PinOff,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { StoryGraph } from '@/features/story/story-graph';
import { TeamAvatar } from '@/features/teams/team-avatar';
import { api, errorMessage } from '@/lib/api';

import { adminKeys, useOverview, useStoryGraph } from './queries';
import { ResetDialog } from './reset-dialog';

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

const formatDuration = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.floor(ms / 1000)} s`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
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

type Panel = 'teams' | 'log';

const PANEL_KEY = 'dashboard-panel';

/** Which floating panel is open and whether it is pinned; remembered per browser. */
const usePanel = () => {
  const [value, setValue] = useState<{ panel: Panel | undefined; pinned: boolean }>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(PANEL_KEY) ?? 'null');
      if (typeof stored === 'object' && stored !== null && 'panel' in stored && 'pinned' in stored)
        return {
          panel: stored.panel === 'teams' || stored.panel === 'log' ? stored.panel : undefined,
          pinned: stored.pinned === true,
        };
    } catch {
      // Storage may be unavailable or hold something else; start with the graph alone.
    }
    return { panel: undefined, pinned: false };
  });
  const update = (next: { panel: Panel | undefined; pinned: boolean }) => {
    setValue(next);
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify(next));
    } catch {
      // The choice then lasts for this visit only.
    }
  };
  return [value, update] as const;
};

/** Live view: the story graph with every clan on its node, teams and steps in floating panels. */
export const DashboardPage = () => {
  const overview = useOverview(POLL_MS);
  const graph = useStoryGraph().data;
  const [moving, setMoving] = useState<TeamStatus>();
  const [{ panel, pinned }, setPanel] = usePanel();

  if (overview.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (overview.isError)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { teams, log } = overview.data;
  const names = new Map(teams.map((team) => [team.id, team.name]));
  const toggle = (next: Panel) => setPanel({ panel: panel === next ? undefined : next, pinned });

  return (
    <div className='relative h-full'>
      {graph === undefined ? (
        <Loader2 className='m-8 size-6 animate-spin' />
      ) : (
        <StoryGraph
          graph={graph}
          teams={teams}
          visits={overview.data.visits}
          onPaneClick={() => {
            if (!pinned && panel !== undefined) setPanel({ panel: undefined, pinned });
          }}
        />
      )}

      <div className='absolute top-4 left-4 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-md backdrop-blur'>
        <Button
          variant={panel === 'teams' ? 'secondary' : 'ghost'}
          size='sm'
          onClick={() => toggle('teams')}
        >
          <Users /> Klany <span className='text-muted-foreground'>{teams.length}</span>
        </Button>
        <Button
          variant={panel === 'log' ? 'secondary' : 'ghost'}
          size='sm'
          onClick={() => toggle('log')}
        >
          <History /> Kroky
        </Button>
      </div>

      {panel !== undefined && (
        <aside className='absolute top-4 right-4 bottom-4 flex w-96 max-w-[calc(100%-2rem)] animate-in flex-col rounded-lg border bg-background/95 shadow-lg backdrop-blur fade-in slide-in-from-right-2'>
          <header className='flex items-center gap-1 border-b py-2 pr-2 pl-4'>
            <h2 className='flex-1 font-semibold'>
              {panel === 'teams' ? 'Klany' : 'Poslední kroky'}
            </h2>
            <Button
              variant={pinned ? 'secondary' : 'ghost'}
              size='icon'
              title={pinned ? 'Odepnout' : 'Připnout, aby panel zůstal otevřený'}
              aria-pressed={pinned}
              onClick={() => setPanel({ panel, pinned: !pinned })}
            >
              {pinned ? <PinOff /> : <Pin />}
            </Button>
            <Button
              variant='ghost'
              size='icon'
              title='Zavřít'
              onClick={() => setPanel({ panel: undefined, pinned })}
            >
              <X />
            </Button>
          </header>
          <div className='min-h-0 flex-1 overflow-y-auto p-2'>
            {panel === 'teams' ? (
              <ul className='flex flex-col'>
                {teams.map((team) => (
                  <li
                    key={team.id}
                    className='flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60'
                  >
                    <TeamAvatar id={team.id} name={team.name} />
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-1.5'>
                        <span className='truncate font-medium'>{team.name}</span>
                        <span className='font-mono text-xs text-muted-foreground'>
                          {team.node ?? '—'}
                        </span>
                        {!team.nodeExists && (
                          <AlertTriangle
                            className='size-3.5 text-destructive'
                            aria-label='Uzel v příběhu chybí'
                          />
                        )}
                        {team.finished && <Badge variant='secondary'>cíl</Badge>}
                      </div>
                      <div
                        className='truncate font-mono text-xs text-muted-foreground'
                        title={formatState(team.state)}
                      >
                        {formatState(team.state)}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {team.devices} zař. · {timeAgo(team.updatedAt)}
                      </div>
                      {team.playMs !== undefined && (
                        <div className='text-xs text-muted-foreground'>
                          Hra {formatDuration(team.playMs)} · čtení {formatDuration(team.readingMs)}
                        </div>
                      )}
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      title='Přesunout tým'
                      onClick={() => setMoving(team)}
                    >
                      <MoveRight />
                    </Button>
                  </li>
                ))}
                {teams.length === 0 && (
                  <li className='p-2 text-sm text-muted-foreground'>Zatím žádné klany.</li>
                )}
              </ul>
            ) : (
              <ol className='flex flex-col gap-1 text-sm'>
                {log.map((entry, i) => (
                  <li key={i} className='flex items-center gap-2 rounded-md px-2 py-1.5'>
                    <TeamAvatar
                      id={entry.teamId}
                      name={names.get(entry.teamId) ?? `#${entry.teamId}`}
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='font-mono text-xs'>
                        {entry.fromNode ?? '·'} → {entry.toNode ?? '·'}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {actionLabel(entry.action)} · {timeAgo(entry.at)}
                      </div>
                    </div>
                  </li>
                ))}
                {log.length === 0 && <li className='p-2 text-muted-foreground'>Zatím nic.</li>}
              </ol>
            )}
          </div>
        </aside>
      )}

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
  const [node, setNode] = useState(team.node ?? graph.start ?? graph.order[0] ?? '');
  const [resetting, setResetting] = useState(false);
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
          <Button variant='outline' onClick={() => setResetting(true)}>
            <RotateCcw /> Na start
          </Button>
          <Button
            onClick={() => move.mutate()}
            disabled={parsedState === undefined || move.isPending}
          >
            Uložit
          </Button>
        </DialogFooter>
        <ResetDialog team={team} open={resetting} onOpenChange={setResetting} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
};
