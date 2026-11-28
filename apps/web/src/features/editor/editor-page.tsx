import {
  IconAlertTriangle,
  IconArrowsDiagonalMinimize2,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronDown,
  IconBraces,
  IconDownload,
  IconFileText,
  IconSchema,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { saveBlob } from '@/features/admin/download';
import {
  GraphToolbar,
  ToolbarMenu,
  ToolbarMenus,
  ToolbarPicker,
  ToolbarSeparator,
} from '@/features/story/graph-toolbar';
import {
  EDGE_STYLE_TEXT,
  EDGE_STYLES,
  parseEdgeStyle,
  parseSpacing,
  SPACING_FACTOR,
  SPACING_TEXT,
  SPACINGS,
  type EdgeStyle,
  type Spacing,
} from '@/features/story/graph-view';

import { draftProblems, PROBLEM_TEXT, toMermaid, type Draft, type NodeProblems } from './draft';
import { DraftCanvas, type DraftCanvasHandle } from './draft-canvas';
import { draftFileText, fitAllSizes, stampChanges } from './draft-edit';
import type { OpenedDraft } from './draft-file';
import { historyReducer, startHistory } from './draft-history';
import {
  FileIssueBar,
  FileMenu,
  SAVE_TEXT,
  useDraftFile,
  useFileChoice,
  FileStart,
} from './editor-file';
import { readEdgeStyle, readSpacing, writeEdgeStyle, writeSpacing } from './editor-view';
import { FocusDialog } from './focus-dialog';
import { startTrail, type FocusTrail } from './focus-trail';

/** The number of nodes with the Czech word in the right form, e.g. „3 uzly“. */
const nodesText = (count: number) => {
  if (count === 1) {
    return '1 uzel';
  }

  if (count >= 2 && count <= 4) {
    return `${count} uzly`;
  }

  return `${count} uzlů`;
};

/** Whether a key press belongs to a text being written, which has its own undo. */
const inText = (target: EventTarget | null) =>
  target instanceof Element && target.closest('input, textarea, [contenteditable]') !== null;

/** Downloads a text file. */
const download = (text: string, name: string, type: string) => {
  saveBlob(new Blob([text], { type }), name);
};

/**
 * The draft for use outside the editor: as Mermaid diagrams, of the summaries only or of the whole
 * text, or as its own file, the one the editor saves.
 */
const ExportMenu = ({ draft, name }: { readonly draft: Draft; readonly name: string }) => (
  <ToolbarMenu>
    <DropdownMenuTrigger asChild>
      <Button variant='ghost' size='sm'>
        <IconDownload /> Export <IconChevronDown className='opacity-60' />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end' className='w-72'>
      <DropdownMenuItem
        onSelect={() => {
          download(toMermaid(draft, 'summaries'), 'story-draft.mmd', 'text/vnd.mermaid');
        }}
      >
        <IconSchema />
        <span className='flex flex-col'>
          Mermaid: shrnutí
          <span className='text-xs text-muted-foreground'>Uzly jen se shrnutím, volby s texty</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          download(toMermaid(draft, 'full'), 'story-draft-full.mmd', 'text/vnd.mermaid');
        }}
      >
        <IconFileText />
        <span className='flex flex-col'>
          Mermaid: celý obsah
          <span className='text-xs text-muted-foreground'>
            Uzly se shrnutím, poznámkou a textem segmentů
          </span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          download(draftFileText(draft), name, 'application/json');
        }}
      >
        <IconBraces />
        <span className='flex flex-col'>
          Koncept (JSON)
          <span className='text-xs text-muted-foreground'>
            Jako {name}, s časem změny každého uzlu
          </span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </ToolbarMenu>
);

/** „1 problém“, „3 problémy“, „5 problémů“. */
const problemsText = (count: number) => {
  if (count === 1) {
    return '1 problém';
  }

  return count >= 2 && count <= 4 ? `${count} problémy` : `${count} problémů`;
};

/**
 * How many problems the draft has, as a button that brings the first node with one to the middle
 * of the canvas; nothing when the draft is in order.
 */
const ProblemsIndicator = ({
  problems,
  onReveal,
}: {
  readonly problems: readonly NodeProblems[];
  readonly onReveal: (id: string) => void;
}) => {
  // A draft in order needs no word about it.
  if (problems.length === 0) {
    return null;
  }

  const list = problems
    .map(({ id, problems: kinds }) => {
      const text = kinds.map((kind) => PROBLEM_TEXT[kind]).join(', ');
      return id === undefined ? text : `${id}: ${text}`;
    })
    .join('\n');
  return (
    // Solid red, so a problem is not missed among the quiet tools around.
    <Button
      size='sm'
      className='bg-destructive font-semibold text-white hover:bg-destructive/85'
      title={`Ukázat první uzel s problémem.\n\n${list}`}
      onClick={() => {
        // A problem of the whole draft has no node to show.
        const first = problems.find((problem) => problem.id !== undefined)?.id;
        if (first !== undefined) {
          onReveal(first);
        }
      }}
    >
      <IconAlertTriangle /> {problemsText(problems.length)}
    </Button>
  );
};

/**
 * The editor over a draft file: the canvas, undo and redo, saving into the file and the detail of
 * a node.
 */
const Editor = ({
  file,
  onNew,
  onOpen,
  onSaveAs,
}: {
  readonly file: OpenedDraft;
  /** Each gets what is not written yet written first. */
  readonly onNew: () => void;
  readonly onOpen: () => void;
  readonly onSaveAs: (draft: Draft) => void;
}) => {
  const [history, dispatch] = useReducer(historyReducer, file.draft, startHistory);
  /** The nodes walked in the focus dialog; closed without one. */
  const [trail, setTrail] = useState<FocusTrail>();
  const draft = history.present;
  // What another program wrote into the file is one step of the history, with its own times.
  const load = useCallback((loaded: Draft) => {
    dispatch({ type: 'change', draft: loaded, at: Date.now() });
  }, []);
  const saving = useDraftFile(file, draft, load);
  /** The file written up to the last change, then `then`. */
  const afterFlush = (then: () => void) => () => {
    void saving.flush().finally(then);
  };

  const canvas = useRef<DraftCanvasHandle>(null);
  /** How far apart the cards are; kept in this browser, it is no part of the draft. */
  const [spacing, setSpacing] = useState<Spacing>(readSpacing);
  /** How the arrows are drawn; kept in this browser too. */
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(readEdgeStyle);
  const problems = useMemo(() => draftProblems(draft), [draft]);
  const change = (next: Draft, field?: string) => {
    dispatch({
      type: 'change',
      // Each node changed keeps when; a redo or an undo brings back the times it had.
      draft: stampChanges(draft, next, new Date().toISOString()),
      ...(field === undefined ? {} : { field }),
      at: Date.now(),
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      // Inside a text its own undo goes first; the draft's steps are for the rest.
      if (!(event.metaKey || event.ctrlKey) || inText(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        dispatch({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className='flex h-full flex-col'>
      <FileIssueBar
        issue={saving.issue}
        onLoad={saving.loadFromDisk}
        onOverwrite={saving.overwrite}
      />
      <div className='relative min-h-0 flex-1'>
        <DraftCanvas
          ref={canvas}
          draft={draft}
          spacing={SPACING_FACTOR[spacing]}
          smoothEdges={edgeStyle === 'smooth'}
          rememberView
          onChange={change}
          onOpen={(id) => {
            setTrail(startTrail(id));
          }}
        />
        {/* The draft's file and its menu on the left, the tools on the right; on a narrow canvas
          the tools wrap under them, so neither covers the other. Only the bars catch the mouse,
          and one menu of the two is open at a time. */}
        <ToolbarMenus>
          <div className='pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-wrap items-start justify-between gap-2'>
            <GraphToolbar label='Soubor konceptu' className='max-w-full whitespace-nowrap'>
              <FileMenu
                name={file.handle.name}
                onNew={afterFlush(onNew)}
                onOpen={afterFlush(onOpen)}
                onSaveAs={afterFlush(() => {
                  onSaveAs(draft);
                })}
              />
              <span className='flex min-w-0 items-center gap-4 overflow-hidden px-2'>
                <span className='truncate'>
                  {nodesText(draft.nodes.length)} v{' '}
                  <code className='text-foreground'>{file.handle.name}</code>
                </span>
                <span
                  aria-live='polite'
                  className={saving.state === 'failed' ? 'text-destructive' : ''}
                >
                  {SAVE_TEXT[saving.state]}
                </span>
              </span>
            </GraphToolbar>
            <GraphToolbar label='Nástroje editoru' className='ml-auto max-w-full overflow-x-auto'>
              <ProblemsIndicator
                problems={problems}
                onReveal={(id) => {
                  canvas.current?.reveal(id);
                }}
              />
              <ToolbarPicker
                name='Rozestupy'
                options={SPACINGS}
                texts={SPACING_TEXT}
                value={spacing}
                parse={parseSpacing}
                onChange={(next) => {
                  setSpacing(next);
                  writeSpacing(next);
                }}
              />
              <ToolbarPicker
                name='Šipky'
                options={EDGE_STYLES}
                texts={EDGE_STYLE_TEXT}
                value={edgeStyle}
                parse={parseEdgeStyle}
                onChange={(next) => {
                  setEdgeStyle(next);
                  writeEdgeStyle(next);
                }}
              />
              <ToolbarSeparator />
              <ExportMenu draft={draft} name={file.handle.name} />
              <ToolbarSeparator />
              <Button
                variant='ghost'
                size='sm'
                disabled={draft.nodes.every((node) => node.size === undefined)}
                onClick={() => {
                  change(fitAllSizes(draft));
                }}
                title='Vrátit všem kartám velikost podle obsahu, jako dvojklik na roh každé karty'
              >
                <IconArrowsDiagonalMinimize2 /> Reset velikosti karet
              </Button>
              <ToolbarSeparator />
              <Button
                variant='ghost'
                size='sm'
                disabled={history.past.length === 0}
                onClick={() => dispatch({ type: 'undo' })}
                title='Zpět (⌘Z)'
              >
                <IconArrowBackUp /> Zpět
              </Button>
              <Button
                variant='ghost'
                size='sm'
                disabled={history.future.length === 0}
                onClick={() => dispatch({ type: 'redo' })}
                title='Znovu (⇧⌘Z)'
              >
                <IconArrowForwardUp /> Znovu
              </Button>
            </GraphToolbar>
          </div>
        </ToolbarMenus>
        <FocusDialog draft={draft} trail={trail} onTrail={setTrail} onChange={change} />
      </div>
    </div>
  );
};

/**
 * The story editor: the draft is written into a file on the author's disk, and turned into the
 * script later, as `docs/story-draft.md` says.
 */
export const EditorPage = () => {
  const choice = useFileChoice();
  if (choice.file === undefined) {
    return (
      <FileStart
        error={choice.error}
        last={choice.last}
        checking={choice.checking}
        onNew={() => void choice.create()}
        onOpen={() => void choice.open()}
        onGoOn={(handle) => void choice.goOn(handle)}
      />
    );
  }

  const { handle } = choice.file;
  return (
    <>
      {choice.error !== undefined && (
        <p className='border-b px-4 py-1.5 text-sm text-destructive'>{choice.error}</p>
      )}
      <Editor
        // Another file, another history: undo does not reach into the file open before.
        key={choice.opened}
        file={choice.file}
        onNew={() => void choice.create()}
        onOpen={() => void choice.open()}
        onSaveAs={(draft) => void choice.saveAs(draft, handle)}
      />
    </>
  );
};
