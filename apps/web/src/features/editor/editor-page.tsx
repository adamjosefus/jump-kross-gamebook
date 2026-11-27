import { IconArrowBackUp, IconArrowForwardUp, IconLoader2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useReducer, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

import type { Draft } from './draft';
import { DraftCanvas } from './draft-canvas';
import { EMPTY_DRAFT, parseDraft, updateNode } from './draft-edit';
import { historyReducer, startHistory } from './draft-history';
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

/** The editor over a loaded draft: the canvas, undo and redo, saving and the focus mode. */
const Editor = ({ initial }: { readonly initial: Draft }) => {
  const [history, dispatch] = useReducer(historyReducer, initial, startHistory);
  /** The nodes walked in the focus dialog; closed without one. */
  const [trail, setTrail] = useState<FocusTrail>();
  const draft = history.present;
  const saving = useAutosave(draft);
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
        <span className='ml-auto flex gap-1'>
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
          draft={draft}
          onChange={change}
          onOpen={(id) => {
            setTrail(startTrail(id));
          }}
        />
        <FocusDialog
          draft={draft}
          trail={trail}
          onTrail={setTrail}
          onChange={(node) => {
            change(
              updateNode(draft, node.id, () => node),
              `focus:${node.id}`,
            );
          }}
        />
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
