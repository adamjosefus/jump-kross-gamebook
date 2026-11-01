import { graphProblems } from '@gamebook/core';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useMemo } from 'react';

import { StoryGraph } from '@/features/story/story-graph';
import { errorMessage } from '@/lib/api';

import { useStoryGraph } from './queries';

/**
 * The story as a graph: nodes show their first screen in the state a team would have on arrival
 * from the start. The text lives in `packages/story` and changes with a deploy.
 */
export const StoryPage = () => {
  const graph = useStoryGraph();
  const problems = useMemo(
    () => (graph.data === undefined ? [] : graphProblems(graph.data)),
    [graph.data],
  );

  if (graph.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (graph.isError) return <p className='p-8 text-destructive'>{errorMessage(graph.error)}</p>;

  return (
    <div className='flex h-full flex-col'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm text-muted-foreground'>
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
