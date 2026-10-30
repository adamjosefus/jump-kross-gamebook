import type { LocationKind } from '@gamebook/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Effect } from 'effect';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { api, errorMessage, type Client } from '@/lib/api';

import { adminKeys, startNodes, useOverview, usePublishedGraph } from './queries';

/** Setup of the running game: teams with their start node, and the physical locations. */
export const GamePage = () => {
  const queryClient = useQueryClient();
  const overview = useOverview();
  const graph = usePublishedGraph(overview.data?.version?.source);
  const starts = startNodes(graph);

  const mutate = useMutation({
    mutationFn: (call: (client: Client) => Effect.Effect<unknown, unknown>) => api(call),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.overview }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (overview.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (overview.isError)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { teams, locations, version } = overview.data;

  return (
    <div className='mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>Týmy</CardTitle>
          <CardDescription>
            {version === undefined
              ? 'Nejdřív publikujte gamebook, ať je z čeho vybrat start.'
              : 'Každý tým začíná na zvoleném startovním uzlu.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-12'>#</TableHead>
                <TableHead>Název</TableHead>
                <TableHead>Start</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className='text-muted-foreground'>{team.id}</TableCell>
                  <TableCell>{team.name}</TableCell>
                  <TableCell>
                    <NodeSelect
                      value={team.startNode}
                      options={starts}
                      onChange={(startNode) =>
                        mutate.mutate((c) =>
                          c.admin.updateTeam({
                            params: { id: team.id },
                            payload: { name: team.name, startNode },
                          }),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='icon'
                      title='Smazat tým'
                      onClick={() => {
                        if (
                          confirm(
                            `Smazat tým ${team.name}? Jeho přihlašovací QR kód přestane platit.`,
                          )
                        ) {
                          mutate.mutate((c) => c.admin.deleteTeam({ params: { id: team.id } }));
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <NewTeamForm
            starts={starts}
            onCreate={(name, startNode) =>
              mutate.mutate((c) => c.admin.createTeam({ payload: { name, startNode } }))
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Místa</CardTitle>
          <CardDescription>
            Číslo místa se píše do uzlu jako <code>{'{ scan: 32 }'}</code>. Na každé místo patří
            jeden QR kód.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16'>Číslo</TableHead>
                <TableHead>Název</TableHead>
                <TableHead>Druh</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell className='font-mono'>{location.id}</TableCell>
                  <TableCell>{location.name}</TableCell>
                  <TableCell>{location.kind === 'end' ? 'Cíl' : 'Postup'}</TableCell>
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='icon'
                      title='Smazat místo'
                      onClick={() =>
                        mutate.mutate((c) =>
                          c.admin.deleteLocation({ params: { id: location.id } }),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <NewLocationForm
            nextId={Math.max(0, ...locations.map((l) => l.id)) + 1}
            onSave={(id, name, kind) =>
              mutate.mutate((c) =>
                c.admin.saveLocation({ params: { id }, payload: { name, kind } }),
              )
            }
          />
        </CardContent>
      </Card>
    </div>
  );
};

const NodeSelect = ({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger size='sm' className='w-32'>
      <SelectValue placeholder='Start' />
    </SelectTrigger>
    <SelectContent>
      {[...new Set([value, ...options])]
        .filter((id) => id !== '')
        .map((id) => (
          <SelectItem key={id} value={id}>
            {id}
            {!options.includes(id) && ' (chybí)'}
          </SelectItem>
        ))}
    </SelectContent>
  </Select>
);

const NewTeamForm = ({
  starts,
  onCreate,
}: {
  starts: readonly string[];
  onCreate: (name: string, start: string) => void;
}) => {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const startNode = start === '' ? (starts[0] ?? '') : start;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '' || startNode === '') return;
    onCreate(name, startNode);
    setName('');
  };
  return (
    <form onSubmit={submit} className='flex gap-2'>
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder='Název týmu'
      />
      <NodeSelect value={startNode} options={starts} onChange={setStart} />
      <Button type='submit' disabled={name.trim() === '' || startNode === ''}>
        <Plus /> Přidat
      </Button>
    </form>
  );
};

const isLocationKind = (value: string): value is LocationKind =>
  value === 'progress' || value === 'end';

const NewLocationForm = ({
  nextId,
  onSave,
}: {
  nextId: number;
  onSave: (id: number, name: string, kind: LocationKind) => void;
}) => {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LocationKind>('progress');
  const number = id === '' ? nextId : Number(id);
  const valid = Number.isInteger(number) && number > 0 && name.trim() !== '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onSave(number, name, kind);
    setId('');
    setName('');
  };
  return (
    <form onSubmit={submit} className='flex gap-2'>
      <Input
        value={id}
        onChange={(event) => setId(event.target.value.replace(/\D/g, ''))}
        placeholder={String(nextId)}
        inputMode='numeric'
        className='w-16 font-mono'
      />
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder='Název místa'
      />
      <Select value={kind} onValueChange={(value) => isLocationKind(value) && setKind(value)}>
        <SelectTrigger className='w-28'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='progress'>Postup</SelectItem>
          <SelectItem value='end'>Cíl</SelectItem>
        </SelectContent>
      </Select>
      <Button type='submit' disabled={!valid}>
        <Plus /> Přidat
      </Button>
    </form>
  );
};
