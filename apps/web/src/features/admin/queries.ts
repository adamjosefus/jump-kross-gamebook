import type { GameGraph } from '@gamebook/core';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export const adminKeys = {
  me: ['admin', 'me'] as const,
  story: ['admin', 'story'] as const,
  overview: ['admin', 'overview'] as const,
  codes: ['admin', 'codes'] as const,
  devices: ['admin', 'devices'] as const,
  timeBreakdown: ['admin', 'time-breakdown'] as const,
} as const;

/**
 * Refetches what a change to the game makes stale: the overview and the times split from the
 * same steps, so the two never show a team's new total next to its old chapters for long.
 */
export const invalidateGame = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: adminKeys.overview }),
    queryClient.invalidateQueries({ queryKey: adminKeys.timeBreakdown }),
  ]);

/** Every team's time by chapter and between chapters. */
export const useTimeBreakdown = (refetchInterval: number | false = false) =>
  useQuery({
    queryKey: adminKeys.timeBreakdown,
    queryFn: ({ signal }) => api((client) => client.admin.timeBreakdown(), { signal }),
    refetchInterval,
  });

export const useOverview = (refetchInterval: number | false = false) =>
  useQuery({
    queryKey: adminKeys.overview,
    queryFn: ({ signal }) => api((client) => client.admin.overview(), { signal }),
    refetchInterval,
  });

/** Shape of the story, with previews seen from the start. */
export const useStoryGraph = () =>
  useQuery({
    queryKey: adminKeys.story,
    queryFn: ({ signal }): Promise<GameGraph> => api((client) => client.admin.story(), { signal }),
    // The story changes only with a deploy.
    staleTime: Infinity,
  });

/** Logged-in and banned devices; apart from the overview, which the live view polls often. */
export const useDevices = (refetchInterval: number | false = false) =>
  useQuery({
    queryKey: adminKeys.devices,
    queryFn: ({ signal }) => api((client) => client.admin.devices(), { signal }),
    refetchInterval,
  });
