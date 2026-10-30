import { parseDocument, type ParseOptions } from '@gamebook/core'
import { EditorView } from '@codemirror/view'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { useDeferredValue, useMemo, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { useTheme } from '@/lib/theme'
import { gamebookLanguage } from './gamebook-language'
import { StoryGraph } from './story-graph'

export interface StoryEditorProps {
  readonly source: string
  readonly onChange: (source: string) => void
  readonly options?: ParseOptions
}

const editorTheme = (dark: boolean) =>
  EditorView.theme(
    {
      '&': { height: '100%', fontSize: '14px', backgroundColor: 'var(--background)' },
      '.cm-content': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '12px 0',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--background)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-line': { padding: '0 12px' },
      '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'var(--accent)',
      },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' },
    },
    { dark },
  )

const NO_OPTIONS: ParseOptions = {}

/** Text editor of the gamebook with live diagnostics and the story graph beside it. */
export const StoryEditor = ({ source, onChange, options = NO_OPTIONS }: StoryEditorProps) => {
  const editor = useRef<ReactCodeMirrorRef>(null)
  const { resolved } = useTheme()

  // The parse for the graph lags behind typing instead of blocking it.
  const deferred = useDeferredValue(source)
  const { graph, diagnostics } = useMemo(
    () => parseDocument(deferred, options),
    [deferred, options],
  )
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.length - errors

  const extensions = useMemo(
    () => [gamebookLanguage(options), EditorView.lineWrapping, editorTheme(resolved === 'dark')],
    [options, resolved],
  )

  const revealNode = (id: string) => {
    const view = editor.current?.view
    const node = graph.nodes[id]
    if (view === undefined || node === undefined) return
    view.dispatch({
      selection: { anchor: node.headerSpan.from },
      effects: EditorView.scrollIntoView(node.headerSpan.from, { y: 'start', yMargin: 24 }),
    })
    view.focus()
  }

  return (
    <div className='grid h-full min-h-0 grid-cols-1 lg:grid-cols-2'>
      <div className='flex min-h-0 flex-col border-r'>
        <CodeMirror
          ref={editor}
          value={source}
          onChange={onChange}
          extensions={extensions}
          theme='none'
          height='100%'
          className='min-h-0 flex-1'
          basicSetup={{ foldGutter: false, highlightActiveLine: false }}
        />
      </div>
      <div className='relative flex min-h-[50vh] flex-col'>
        <div className='flex items-center gap-2 border-b px-4 py-2 text-sm'>
          <span className='font-medium'>Graf</span>
          <span className='text-muted-foreground'>{graph.order.length} uzlů</span>
          <span className='flex-1' />
          {errors > 0 && <Badge variant='destructive'>{errors} chyb</Badge>}
          {warnings > 0 && <Badge variant='secondary'>{warnings} varování</Badge>}
          {diagnostics.length === 0 && <Badge variant='outline'>Bez chyb</Badge>}
        </div>
        <div className='relative min-h-0 flex-1 p-4'>
          <StoryGraph graph={graph} onNodeClick={revealNode} />
        </div>
      </div>
    </div>
  )
}
