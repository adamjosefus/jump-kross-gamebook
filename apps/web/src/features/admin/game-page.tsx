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

import { adminKeys, startNodes, useOverview, useStoryGraph } from './queries';

/** Setup of the running game: teams with their start node; the places come from the story. */
export const GamePage = () => {
  const queryClient = useQueryClient();
  const overview = useOverview();
  const starts = startNodes(useStoryGraph().data);

  const mutate = useMutation({
    mutationFn: (call: (client: Client) => Effect.Effect<unknown, unknown>) => api(call),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.overview }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (overview.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (overview.isError)
    return <p className='p-8 text-destructive'>{errorMessage(overview.error)}</p>;
  const { teams, locations } = overview.data;

  return (
    <div className='mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>Týmy</CardTitle>
          <CardDescription>Každý tým začíná na zvoleném startovním uzlu.</CardDescription>
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
