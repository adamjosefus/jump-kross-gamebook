import { parseDocument } from '@gamebook/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Upload } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { StoryEditor } from '@/features/editor/story-editor'
import { api, errorMessage } from '@/lib/api'
import { adminKeys, useOverview } from './queries'

const AUTOSAVE_MS = 800

export const EditorPage = () => {
  const draft = useQuery({
    queryKey: adminKeys.draft,
    queryFn: ({ signal }) => api((client) => client.admin.draft(), { signal }),
    staleTime: Infinity,
  })
  if (draft.isPending) return <Loader2 className="m-8 size-6 animate-spin" />
  if (draft.isError) return <p className="text-destructive p-8">{errorMessage(draft.error)}</p>
  return <LoadedEditor initial={draft.data.source} />
}

const LoadedEditor = ({ initial }: { initial: string }) => {
  const queryClient = useQueryClient()
  const [source, setSource] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const overview = useOverview()
  const locations = useMemo(() => overview.data?.locations.map((l) => l.id), [overview.data])
  const options = useMemo(() => (locations === undefined ? {} : { locations }), [locations])

  const save = useMutation({
    mutationFn: (text: string) => api((client) => client.admin.saveDraft({ payload: { source: text } })),
    onSuccess: (row) => {
      setSaved(row.source)
      queryClient.setQueryData(adminKeys.draft, row)
    },
    onError: (error) => toast.error(`Uložení selhalo: ${errorMessage(error)}`),
  })

  // Autosave after a pause in typing.
  const autosave = useEffectEvent((text: string) => save.mutate(text))
  useEffect(() => {
    if (source === saved) return
    const timer = setTimeout(() => autosave(source), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [source, saved])

  // Warn before leaving with unsaved text.
  useEffect(() => {
    if (source === saved) return
    const listener = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [source, saved])

  const publish = useMutation({
    mutationFn: async () => {
      if (source !== saved) await save.mutateAsync(source)
      return api((client) => client.admin.publish())
    },
    onSuccess: ({ versionId }) => {
      toast.success(`Publikováno jako verze ${versionId}. Týmy hrají novou verzi.`)
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const errors = useMemo(
    () => parseDocument(source, options).diagnostics.filter((d) => d.severity === 'error').length,
    [source, options],
  )
  const published = overview.data?.version
  const upToDate = published !== undefined && published.source === source

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2 text-sm">
        <span className="text-muted-foreground flex items-center gap-1.5">
          {save.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Ukládám…
            </>
          ) : source === saved ? (
            <>
              <Check className="size-3.5" /> Uloženo
            </>
          ) : (
            'Neuloženo'
          )}
        </span>
        <span className="text-muted-foreground">
          {published === undefined
            ? 'Zatím nepublikováno'
            : upToDate
              ? `Publikovaná verze ${published.id} odpovídá textu`
              : `Publikovaná verze ${published.id} je starší než text`}
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          onClick={() => publish.mutate()}
          disabled={publish.isPending || errors > 0 || upToDate}
          title={errors > 0 ? 'Dokument obsahuje chyby' : undefined}
        >
          {publish.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Publikovat
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <StoryEditor source={source} onChange={setSource} options={options} />
      </div>
    </div>
  )
}
