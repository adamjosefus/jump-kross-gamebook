import type { GameGraph } from '@gamebook/core';
import { useQuery } from '@tanstack/react-query';

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

/** Shape of the story teams play; it changes only with a deploy. */
export const useStoryGraph = () =>
  useQuery({
    queryKey: adminKeys.story,
    queryFn: ({ signal }): Promise<GameGraph> => api((client) => client.admin.story(), { signal }),
    staleTime: Infinity,
  });

export const startNodes = (graph: GameGraph | undefined): string[] =>
  graph === undefined ? [] : graph.order.filter((id) => graph.nodes[id]!.type === 'start');
