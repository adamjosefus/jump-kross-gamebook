import type { GameGraph } from '@gamebook/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export const adminKeys = {
  me: ['admin', 'me'] as const,
  story: ['admin', 'story'] as const,
  overview: ['admin', 'overview'] as const,
  codes: ['admin', 'codes'] as const,
};

export const useOverview = (refetchInterval: number | false = false) =>
  useQuery({
    queryKey: adminKeys.overview,
    queryFn: ({ signal }) => api((client) => client.admin.overview(), { signal }),
    refetchInterval,
  });

/** Shape of the story, with previews seen from `start` (the first start when omitted). */
export const useStoryGraph = (start?: string) =>
  useQuery({
    queryKey: [...adminKeys.story, start ?? ''],
    queryFn: ({ signal }): Promise<GameGraph> =>
      api((client) => client.admin.story({ query: start === undefined ? {} : { start } }), {
        signal,
      }),
    // The story changes only with a deploy.
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

export const startNodes = (graph: GameGraph | undefined): string[] =>
  graph === undefined ? [] : graph.order.filter((id) => graph.nodes[id]!.type === 'start');
