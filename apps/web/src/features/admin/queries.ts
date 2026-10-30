import { parseDocument, type GameGraph } from '@gamebook/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'

export const adminKeys = {
  me: ['admin', 'me'] as const,
  draft: ['admin', 'draft'] as const,
  overview: ['admin', 'overview'] as const,
  codes: ['admin', 'codes'] as const,
}

export const useOverview = (refetchInterval: number | false = false) =>
  useQuery({
    queryKey: adminKeys.overview,
    queryFn: ({ signal }) => api((client) => client.admin.overview(), { signal }),
    refetchInterval,
  })

/** Graph of the published version, the one teams are playing. */
export const usePublishedGraph = (source: string | undefined): GameGraph | undefined =>
  useMemo(() => (source === undefined ? undefined : parseDocument(source).graph), [source])

export const startNodes = (graph: GameGraph | undefined): string[] =>
  graph === undefined ? [] : graph.order.filter((id) => graph.nodes[id]!.type === 'start')
