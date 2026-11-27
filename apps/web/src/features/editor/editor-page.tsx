import {
  IconAlertTriangle,
  IconArrowAutofitContent,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronDown,
  IconCopy,
  IconLoader2,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { draftProblems, PROBLEM_TEXT, toMermaid, type Draft, type NodeProblems } from './draft';
import { DraftCanvas, type DraftCanvasHandle } from './draft-canvas';
import { EMPTY_DRAFT, fitAllSizes, parseDraft } from './draft-edit';
import { historyReducer, startHistory } from './draft-history';
import {
  EDGE_STYLE_TEXT,
  EDGE_STYLES,
  parseEdgeStyle,
  parseSpacing,
  readEdgeStyle,
  readSpacing,
  SPACING_FACTOR,
  SPACING_TEXT,
  SPACINGS,
  writeEdgeStyle,
  writeSpacing,
  type EdgeStyle,
  type Spacing,
} from './editor-view';
import { FocusDialog } from './focus-dialog';
import { startTrail, type FocusTrail } from './focus-trail';

/** Where the dev server keeps the draft; the deployed app has no such address. */
const DRAFT_URL = '/__editor/draft';

/** The file the draft is kept in, as the author knows it. */
const DRAFT_PATH = 'packages/story/draft/story-draft.json';

/** How long the editor waits after a change before saving, in ms. */
const SAVE_DELAY = 500;

/** The draft from its file, or a new one when there is no file yet. */
const loadDraft = async (): Promise<Draft> => {
  const response = await fetch(DRAFT_URL);
  if (response.status === 404) {
    return EMPTY_DRAFT;
  }

  if (!response.ok) {
    throw new Error(`Koncept se nepodařilo načíst (${response.status}).`);
  }

  const draft = parseDraft(await response.json());
  if (draft === undefined) {
    throw new Error(`Soubor ${DRAFT_PATH} nemá tvar konceptu. Opravte ho nebo smažte.`);
  }

  return draft;
};

const saveDraft = async (draft: Draft, keepalive = false) => {
  const response = await fetch(DRAFT_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
    keepalive,
  });
  if (!response.ok) {
    throw new Error(`Koncept se nepodařilo uložit (${response.status}).`);
  }
};

type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed';

const SAVE_TEXT: Readonly<Record<SaveState, string>> = {
  saved: 'Uloženo',
  unsaved: 'Neuloženo',
  saving: 'Ukládám…',
  failed: 'Uložení selhalo',
};

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

/** Saves the draft a moment after it changes, and right away when the page is left. */
const useAutosave = (draft: Draft) => {
  const [state, setState] = useState<SaveState>('saved');
  const saved = useRef(draft);

  useEffect(() => {
    if (draft === saved.current) {
      return undefined;
    }

    setState('unsaved');
    const timer = setTimeout(() => {
      setState('saving');
      saveDraft(draft)
        .then(() => {
          saved.current = draft;
          setState('saved');
        })
        .catch(() => {
          setState('failed');
        });
    }, SAVE_DELAY);
    // A page left before the delay saves what it has; the request outlives the page.
    const leave = () => {
      if (saved.current !== draft) {
        void saveDraft(draft, true);
      }
    };

    window.addEventListener('pagehide', leave);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', leave);
    };
  }, [draft]);

  return state;
};

/**
 * One of a few ways, as one small button with the name and the way chosen, which opens the list
 * of the ways.
 */
const Picker = <T extends string>({
  name,
  options,
  texts,
  value,
  parse,
  onChange,
}: {
  readonly name: string;
  readonly options: readonly T[];
  readonly texts: Readonly<Record<T, string>>;
  readonly value: T;
  /** The way a list item's value stands for. */
  readonly parse: (value: string) => T;
  readonly onChange: (value: T) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant='ghost' size='sm' aria-label={`${name}: ${texts[value]}`}>
        {name}: <span className='text-foreground'>{texts[value]}</span>
        <IconChevronDown className='opacity-60' />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end'>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(next) => {
          onChange(parse(next));
        }}
      >
        {options.map((option) => (
          <DropdownMenuRadioItem key={option} value={option}>
            {texts[option]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
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
    <Button
      variant='ghost'
      size='sm'
      className='text-destructive hover:text-destructive'
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

/** The editor over a loaded draft: the canvas, undo and redo, saving and the focus mode. */
const Editor = ({ initial }: { readonly initial: Draft }) => {
  const [history, dispatch] = useReducer(historyReducer, initial, startHistory);
  /** The nodes walked in the focus dialog; closed without one. */
  const [trail, setTrail] = useState<FocusTrail>();
  const draft = history.present;
  const saving = useAutosave(draft);
  const canvas = useRef<DraftCanvasHandle>(null);
  /** How far apart the cards are; kept in this browser, it is no part of the draft. */
  const [spacing, setSpacing] = useState<Spacing>(readSpacing);
  /** How the arrows are drawn; kept in this browser too. */
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(readEdgeStyle);
  const problems = useMemo(() => draftProblems(draft), [draft]);
  const change = (next: Draft, field?: string) => {
    dispatch({
      type: 'change',
      draft: next,
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
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm text-muted-foreground'>
        <span>
          {nodesText(draft.nodes.length)} v <code className='text-foreground'>{DRAFT_PATH}</code>
        </span>
        <span className={saving === 'failed' ? 'text-destructive' : ''}>{SAVE_TEXT[saving]}</span>
        <span
          role='toolbar'
          aria-label='Nástroje editoru'
          className='ml-auto flex items-center gap-1'
        >
          <ProblemsIndicator
            problems={problems}
            onReveal={(id) => {
              canvas.current?.reveal(id);
            }}
          />
          <Picker
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
          <Picker
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
          <span className='mx-1 h-4 w-px bg-border' aria-hidden />
          <Button
            variant='ghost'
            size='sm'
            title='Zkopírovat tvar příběhu jako diagram Mermaid: uzly se shrnutím a volby s texty'
            onClick={() => {
              navigator.clipboard.writeText(toMermaid(draft)).then(
                () => toast.success('Graf je ve schránce jako Mermaid.'),
                () => toast.error('Graf se nepodařilo zkopírovat.'),
              );
            }}
          >
            <IconCopy /> Mermaid
          </Button>
          <span className='mx-1 h-4 w-px bg-border' aria-hidden />
          <Button
            variant='ghost'
            size='sm'
            disabled={draft.nodes.every((node) => node.size === undefined)}
            onClick={() => {
              change(fitAllSizes(draft));
            }}
            title='Vrátit všem kartám velikost podle obsahu, jako dvojklik na roh každé karty'
          >
            <IconArrowAutofitContent /> Velikost podle obsahu
          </Button>
          <span className='mx-1 h-4 w-px bg-border' aria-hidden />
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
        </span>
      </div>
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
        <FocusDialog draft={draft} trail={trail} onTrail={setTrail} onChange={change} />
      </div>
    </div>
  );
};

/**
 * The story editor, in development only: the draft is written to a file in the repository, and
 * turned into the script later, as `docs/story-draft.md` says.
 */
export const EditorPage = () => {
  const loaded = useQuery({
    queryKey: ['story-draft'],
    queryFn: loadDraft,
    // Read anew each time the page opens: the editor saved since, and the file is the truth.
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (loaded.isPending) {
    return <IconLoader2 className='m-8 size-6 animate-spin' />;
  }

  if (loaded.isError) {
    return <p className='p-8 text-destructive'>{loaded.error.message}</p>;
  }

  return <Editor initial={loaded.data} />;
};
