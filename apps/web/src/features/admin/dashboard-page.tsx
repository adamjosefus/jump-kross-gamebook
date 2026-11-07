import type { TeamStatus } from '@gamebook/api';
import type { GameGraph, Value } from '@gamebook/core';
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconCheck,
  IconChevronsRight,
  IconCopy,
  IconHistory,
  IconLoader2,
  IconPin,
  IconPinnedOff,
  IconRotate,
  IconUsers,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
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
import { Input } from '@/components/ui/input';
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

import { formatTime, timeAgo } from './format';
import { adminKeys, useOverview, useStoryGraph } from './queries';
import { ResetDialog } from './reset-dialog';
import { formatDuration, playTime, resultsCsv, resultsJson, teamResults } from './results';

const isState = (value: unknown): value is Readonly<Record<string, Value>> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => ['string', 'number', 'boolean'].includes(typeof entry));

const POLL_MS = 5_000;

/** The current time, refreshed every second, so a running clock ticks between two polls. */
const useNow = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

/** The team's play time, reading time and the rest (walking, puzzles), all to the second. */
const TeamTimes = ({ team, now }: { readonly team: TeamStatus; readonly now: number }) => {
  const playMs = playTime(team, now);
  if (playMs === undefined) return null;
  return (
    <div className='font-mono text-xs text-muted-foreground tabular-nums'>
      Hra {formatDuration(playMs)} · čtení {formatDuration(team.readingMs)} · mimo čtení{' '}
      {formatDuration(playMs - team.readingMs)}
    </div>
  );
};

/** Copies the teams' results to the clipboard as a CSV table or as JSON, with the state. */
const CopyResults = ({
  teams,
  now,
}: {
  readonly teams: readonly TeamStatus[];
  readonly now: number;
}) => {
  const [copied, setCopied] = useState<'csv' | 'json'>();
  const copy = async (format: 'csv' | 'json') => {
    const results = teamResults(teams, now);
    try {
      await navigator.clipboard.writeText(
        format === 'csv' ? resultsCsv(results) : resultsJson(results),
      );
      setCopied(format);
      setTimeout(() => setCopied(undefined), 1500);
    } catch {
      toast.error('Schránka není dostupná.');
    }
  };
  return (
    <div className='flex items-center gap-1'>
      <span className='text-xs text-muted-foreground'>Kopírovat výsledky:</span>
      {(['csv', 'json'] as const).map((format) => (
        <Button
          key={format}
          variant='ghost'
          size='sm'
          className='h-6 px-1.5 font-mono text-xs uppercase'
          title={`Zkopírovat časy a stav všech týmů jako ${format.toUpperCase()}`}
          onClick={() => void copy(format)}
        >
          {copied === format ? <IconCheck /> : <IconCopy />} {format}
        </Button>
      ))}
    </div>
  );
};

const formatState = (state: Readonly<Record<string, Value>>) =>
  Object.entries(state)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ');

const ACTION_LABELS: Readonly<Record<string, string>> = {
  start: 'start',
  reset: 'reset',
  admin: 'zásah organizátora',
} as const;
const actionLabel = (action: string) =>
  ACTION_LABELS[action] ??
  (action.startsWith('scan:')
    ? `sken kódu ${action.slice(5)}`
    : action.startsWith('choice:')
      ? 'volba'
      : action);

type Panel = 'teams' | 'log';

const PANELS_KEY = 'dashboard-panels';

interface PanelState {
  readonly open: boolean;
  readonly pinned: boolean;
}

type PanelStates = Readonly<Record<Panel, PanelState>>;

const CLOSED: PanelState = { open: false, pinned: false };

const readPanel = (stored: unknown): PanelState =>
  typeof stored === 'object' && stored !== null && 'open' in stored && 'pinned' in stored
    ? { open: stored.open === true, pinned: stored.pinned === true }
    : CLOSED;

/** Which floating panels are open and pinned; remembered per browser. */
const usePanels = () => {
  const [value, setValue] = useState<PanelStates>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(PANELS_KEY) ?? 'null');
      if (typeof stored === 'object' && stored !== null && 'teams' in stored && 'log' in stored)
        return { teams: readPanel(stored.teams), log: readPanel(stored.log) };
    } catch {
      // Storage may be unavailable or hold something else; start with the graph alone.
    }
    return { teams: CLOSED, log: CLOSED };
  });
  const update = (next: PanelStates) => {
    setValue(next);
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(next));
    } catch {
      // The choice then lasts for this visit only.
    }
  };
  return [value, update] as const;
};

/** A panel on the right of the graph, or the button that opens it when it is closed. */
const FloatingPanel = ({
  title,
  label,
  icon,
  state,
  onChange,
  children,
}: {
  readonly title: string;
  /** The button's text next to the icon. */
  readonly label: ReactNode;
  readonly icon: ReactNode;
  readonly state: PanelState;
  readonly onChange: (next: PanelState) => void;
  readonly children: ReactNode;
}) =>
  state.open ? (
    <aside className='pointer-events-auto flex min-h-0 w-full flex-1 animate-in flex-col rounded-lg border bg-background/80 shadow-lg backdrop-blur-md fade-in slide-in-from-right-2'>
      <header className='flex items-center gap-1 border-b py-2 pr-2 pl-4'>
        <h2 className='flex-1 font-semibold'>{title}</h2>
        <Button
          variant={state.pinned ? 'secondary' : 'ghost'}
          size='icon'
          title={state.pinned ? 'Odepnout' : 'Připnout, aby panel zůstal otevřený'}
          aria-label={state.pinned ? 'Odepnout panel' : 'Připnout panel'}
          aria-pressed={state.pinned}
          onClick={() => onChange({ ...state, pinned: !state.pinned })}
        >
          {state.pinned ? <IconPinnedOff /> : <IconPin />}
        </Button>
        <Button
          variant='ghost'
          size='icon'
          title='Skrýt'
          aria-label='Skrýt panel'
          onClick={() => onChange({ ...state, open: false })}
        >
          <IconChevronsRight />
        </Button>
      </header>
      <div className='min-h-0 flex-1 overflow-y-auto p-2'>{children}</div>
    </aside>
  ) : (
    <div className='pointer-events-auto shrink-0 rounded-lg border bg-background/80 p-1 shadow-md backdrop-blur-md'>
      <Button variant='ghost' size='sm' onClick={() => onChange({ ...state, open: true })}>
        {icon} {label}
      </Button>
    </div>
  );

/** Live view: the story graph with every clan on its node, teams and steps in floating panels. */
export const DashboardPage = () => {
  const overview = useOverview(POLL_MS);
  const graph = useStoryGraph().data;
  const [moving, setMoving] = useState<TeamStatus>();
  const [panels, setPanels] = usePanels();
  const now = useNow();

  if (overview.isPending) return <IconLoader2 className='m-8 size-6 animate-spin' />;
  // Without anything to show the error is the page; with the last data it is a bar above them.
  if (overview.data === undefined)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { game, teams, log } = overview.data;
  const names: ReadonlyMap<number, string> = new Map(teams.map((team) => [team.id, team.name]));

  return (
    <div className='relative h-full'>
      {overview.isError && <StaleBar at={overview.dataUpdatedAt} error={overview.error} />}
      {graph === undefined ? (
        <IconLoader2 className='m-8 size-6 animate-spin' />
      ) : (
        <StoryGraph
          graph={graph}
          teams={teams}
          visits={overview.data.visits}
          onPaneClick={() =>
            setPanels({
              teams: { ...panels.teams, open: panels.teams.open && panels.teams.pinned },
              log: { ...panels.log, open: panels.log.open && panels.log.pinned },
            })
          }
        />
      )}

      {/* Only the panels catch the mouse, the graph goes on under the empty rest of the column. */}
      <div className='pointer-events-none absolute top-4 right-4 bottom-4 flex w-96 max-w-[calc(100%-2rem)] flex-col items-end gap-2'>
        <FloatingPanel
          title='Klany'
          icon={<IconUsers />}
          label={
            <>
              Klany <span className='text-muted-foreground'>{teams.length}</span>
            </>
          }
          state={panels.teams}
          onChange={(teamsPanel) => setPanels({ ...panels, teams: teamsPanel })}
        >
          <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 pb-2'>
            <p className='text-xs text-muted-foreground'>
              {game.startedAt === undefined
                ? 'Hra není spuštěná, týmy se nemohou přihlásit.'
                : `Hra běží od ${formatTime(game.startedAt)}.`}
            </p>
            <CopyResults teams={teams} now={now} />
          </div>
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
                      <IconAlertTriangle
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
                    {team.devices} zař. ·{' '}
                    {team.updatedAt === undefined ? 'ještě nehrál' : timeAgo(team.updatedAt)}
                  </div>
                  <TeamTimes team={team} now={now} />
                </div>
                <Button
                  variant='ghost'
                  size='icon'
                  title='Přesunout tým'
                  aria-label={`Přesunout tým ${team.name}`}
                  onClick={() => setMoving(team)}
                >
                  <IconArrowNarrowRight />
                </Button>
              </li>
            ))}
            {teams.length === 0 && (
              <li className='p-2 text-sm text-muted-foreground'>Zatím žádné klany.</li>
            )}
          </ul>
        </FloatingPanel>
        <FloatingPanel
          title='Poslední kroky'
          icon={<IconHistory />}
          label='Kroky'
          state={panels.log}
          onChange={(logPanel) => setPanels({ ...panels, log: logPanel })}
        >
          <ol className='flex flex-col gap-1 text-sm'>
            {log.map((entry, index) => (
              <li key={index} className='flex items-center gap-2 rounded-md px-2 py-1.5'>
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
        </FloatingPanel>
      </div>

      {moving !== undefined && graph !== undefined && (
        <MoveDialog
          team={moving}
          current={teams.find((team) => team.id === moving.id)}
          graph={graph}
          onClose={() => setMoving(undefined)}
        />
      )}
    </div>
  );
};

/** The last poll failed: what is shown is from `at`. */
const StaleBar = ({ at, error }: { readonly at: number; readonly error: unknown }) => (
  <div
    role='alert'
    className='absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-destructive px-4 py-1.5 text-sm text-white'
  >
    <IconAlertTriangle className='size-4 shrink-0' />
    Nepodařilo se obnovit ({errorMessage(error)}). Zobrazená data jsou z{' '}
    {new Date(at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}.
  </div>
);

/**
 * Changes the node and state of a team in the running game. It reaches the team's phones at once
 * and can break their game, so the dialog warns loudly and the admin has to type the team's name.
 * `current` is the team as the last poll saw it: the move writes over whatever the team does
 * meanwhile, so a team that moved since the dialog opened is pointed out.
 */
const MoveDialog = ({
  team,
  current,
  graph,
  onClose,
}: {
  readonly team: TeamStatus;
  readonly current: TeamStatus | undefined;
  readonly graph: GameGraph;
  readonly onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const [node, setNode] = useState(team.node ?? graph.start ?? graph.order[0] ?? '');
  const [resetting, setResetting] = useState(false);
  const [typed, setTyped] = useState('');
  const [stateText, setStateText] = useState(JSON.stringify(team.state, null, 2));
  // The step the form was filled from; the team may have moved on since.
  const [filledFrom, setFilledFrom] = useState(team.step);
  const movedSince = current !== undefined && current.step !== filledFrom;
  const refill = () => {
    if (current === undefined) return;
    setNode(current.node ?? graph.start ?? graph.order[0] ?? '');
    setStateText(JSON.stringify(current.state, null, 2));
    setFilledFrom(current.step);
  };

  const parsedState = (() => {
    try {
      const value: unknown = JSON.parse(stateText);
      return isState(value) ? value : undefined;
    } catch {
      return undefined;
    }
  })();

  const confirmed = parsedState !== undefined && typed === team.name;

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
      <DialogContent className='flex max-h-[85dvh] flex-col ring-2 ring-destructive'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 pr-6 text-destructive'>
            <IconAlertTriangle className='size-5 shrink-0' /> Zásah do živé hry: {team.name}
          </DialogTitle>
          <DialogDescription>Přesun týmu na jiný uzel a úprava jeho stavu.</DialogDescription>
        </DialogHeader>
        <form
          className='flex min-h-0 flex-col gap-4'
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed) move.mutate();
          }}
        >
          <div className='-mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-1'>
            <div role='alert' className='rounded-lg bg-red-700 p-3 text-white'>
              <p className='font-semibold'>Pozor, měníte živou hru!</p>
              <ul className='mt-1 list-disc pl-4'>
                <li>Změna se okamžitě projeví na všech telefonech týmu, i uprostřed hraní.</li>
                <li>Špatný uzel nebo stav může tým zaseknout nebo mu pokazit postup.</li>
                <li>Automaticky ji vrátit nejde.</li>
              </ul>
            </div>
            {movedSince && (
              <div
                role='alert'
                className='flex items-center gap-2 rounded-lg border border-destructive p-3 text-sm'
              >
                <IconAlertTriangle className='size-4 shrink-0 text-destructive' />
                <span className='flex-1'>
                  Tým se mezitím posunul (krok {filledFrom} → {current.step}); zásah by přepsal jeho
                  nový stav.
                </span>
                <Button type='button' variant='outline' size='sm' onClick={refill}>
                  Načíst aktuální
                </Button>
              </div>
            )}
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
            <div className='flex flex-col gap-2'>
              <label htmlFor='move-confirm' className='text-sm'>
                Pro potvrzení napište <strong className='font-mono'>{team.name}</strong>
              </label>
              <Input
                id='move-confirm'
                autoComplete='off'
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className='sm:justify-between'>
            <Button type='button' variant='outline' onClick={() => setResetting(true)}>
              <IconRotate /> Na start
            </Button>
            <div className='flex flex-col-reverse gap-2 sm:flex-row'>
              <Button type='button' variant='outline' onClick={onClose}>
                Zrušit
              </Button>
              <Button
                type='submit'
                className='bg-red-700 text-white hover:bg-red-800'
                disabled={!confirmed || move.isPending}
              >
                {move.isPending && <IconLoader2 className='animate-spin' />}
                Provést zásah
              </Button>
            </div>
          </DialogFooter>
        </form>
        <ResetDialog team={team} open={resetting} onOpenChange={setResetting} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
};
