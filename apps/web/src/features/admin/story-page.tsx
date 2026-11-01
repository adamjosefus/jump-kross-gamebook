import { graphProblems } from '@gamebook/core';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StoryGraph } from '@/features/story/story-graph';
import { errorMessage } from '@/lib/api';

import { startNodes, useStoryGraph } from './queries';

/**
 * The story as a graph seen from one start: nodes show their first screen in the state the team
 * would have on arrival. The text lives in `packages/story` and changes with a deploy.
 */
export const StoryPage = () => {
  const [start, setStart] = useState<string>();
  const graph = useStoryGraph(start);
  const problems = useMemo(
    () => (graph.data === undefined ? [] : graphProblems(graph.data)),
    [graph.data],
  );

  if (graph.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (graph.isError) return <p className='p-8 text-destructive'>{errorMessage(graph.error)}</p>;
  const starts = startNodes(graph.data);

  return (
    <div className='flex h-full flex-col'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm text-muted-foreground'>
        <span className='flex items-center gap-2'>
          Start
          <Select value={graph.data.start ?? ''} onValueChange={setStart}>
            <SelectTrigger size='sm' className='font-mono'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {starts.map((id) => (
                <SelectItem key={id} value={id} className='font-mono'>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {graph.isFetching && <Loader2 className='size-4 animate-spin' />}
        </span>
        <span>
          {graph.data.order.length} uzlů. Příběh se upravuje v{' '}
          <code className='text-foreground'>packages/story/src/story.ts</code>.
        </span>
        {problems.map((problem) => (
          <span key={problem} className='flex items-center gap-1.5 text-destructive'>
            <AlertTriangle className='size-4' /> {problem}
          </span>
        ))}
      </div>
      <div className='min-h-0 flex-1'>
        <StoryGraph graph={graph.data} />
      </div>
    </div>
  );
};
