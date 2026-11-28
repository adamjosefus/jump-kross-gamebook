import {
  IconChevronDown,
  IconFile,
  IconFilePlus,
  IconFolderOpen,
  IconCopyPlus,
  IconLoader2,
} from '@tabler/icons-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToolbarMenu } from '@/features/story/graph-toolbar';

import type { Draft } from './draft';
import {
  askToWrite,
  createDraftFile,
  draftOfText,
  externalChange,
  mayWrite,
  openDraftFile,
  readDraft,
  recallFile,
  rememberFile,
  sameStamp,
  saveDraftAs,
  stampOf,
  supportsFiles,
  writeDraft,
  type FileStamp,
  type OpenedDraft,
} from './draft-file';

/** How long the editor waits after a change before saving, in ms. */
const SAVE_DELAY = 500;

/** How often the file is looked at for a change by another program while the page is shown, in ms. */
const WATCH_INTERVAL = 1000;

/** How many looks in a row the file may hold no draft before the editor says so. */
const BROKEN_LOOKS = 2;

/** How long „Načteno ze souboru“ stays after the file was loaded, in ms. */
const LOADED_SHOWN = 2500;

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed' | 'loaded';

export const SAVE_TEXT: Readonly<Record<SaveState, string>> = {
  saved: 'Uloženo',
  unsaved: 'Neuloženo',
  saving: 'Ukládám…',
  failed: 'Uložení selhalo',
  loaded: 'Načteno ze souboru',
};

/**
 * Why saving waits for the author: the file changed while the editor had a change not written
 * yet, or the file holds no draft.
 */
export type FileIssue = 'conflict' | 'broken';

export interface DraftFile {
  readonly state: SaveState;
  readonly issue: FileIssue | undefined;
  /** Takes the draft from the file, dropping the editor's change not written yet. */
  readonly loadFromDisk: () => void;
  /** Writes the editor's draft over what another program left in the file. */
  readonly overwrite: () => void;
  /** Writes what is not written yet, before another file is opened. */
  readonly flush: () => Promise<void>;
}

/**
 * Keeps the draft and its file in step: writes a change a moment after it is made, and takes in
 * what another program writes into the file, unless the editor has a change of its own not
 * written yet; then the author chooses.
 */
export const useDraftFile = (
  file: OpenedDraft,
  draft: Draft,
  /** Puts a draft read from the file in place, as one step of the history. */
  onLoad: (draft: Draft) => void,
): DraftFile => {
  const { handle } = file;
  const [state, setState] = useState<SaveState>('saved');
  const [issue, setIssue] = useState<FileIssue>();
  /** The draft the file holds, as far as the editor knows. */
  const saved = useRef(file.draft);
  /** What the file was like when the editor last read or wrote it. */
  const stamp = useRef<FileStamp>(file.stamp);
  /** The draft shown now, for the checks that run outside of rendering. */
  const current = useRef(draft);
  /** A draft another program wrote while the editor had a change of its own. */
  const pending = useRef<Draft>(undefined);
  /** How many looks in a row found no draft in the file. */
  const brokenLooks = useRef(0);
  /** One read or write of the file at a time. */
  const busy = useRef<Promise<void>>(Promise.resolve());
  const issueRef = useRef(issue);
  // Kept in step with what is rendered, for the checks and writes that run in between.
  useLayoutEffect(() => {
    current.current = draft;
    issueRef.current = issue;
  });
  const loadedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const serially = useCallback((run: () => Promise<void>) => {
    const next = busy.current.then(run, run);
    busy.current = next.catch(() => {});
    return next;
  }, []);

  const showLoaded = useCallback(() => {
    setState('loaded');
    clearTimeout(loadedTimer.current);
    loadedTimer.current = setTimeout(() => {
      setState((now) => (now === 'loaded' ? 'saved' : now));
    }, LOADED_SHOWN);
  }, []);

  const take = useCallback(
    (taken: Draft) => {
      saved.current = taken;
      pending.current = undefined;
      setIssue(undefined);
      onLoad(taken);
      showLoaded();
    },
    [onLoad, showLoaded],
  );

  /** Looks whether another program changed the file and acts on it; true when it did. */
  const look = useCallback(async (): Promise<boolean> => {
    const found = await handle.getFile();
    const now = stampOf(found);
    if (sameStamp(now, stamp.current)) {
      return false;
    }

    const read = draftOfText(await found.text());
    const local = current.current === saved.current ? 'saved' : 'unsaved';
    const action = externalChange(
      local,
      read === undefined ? { kind: 'broken' } : { kind: 'draft', draft: read },
    );
    if (action === 'broken' || read === undefined) {
      // Another program may be just writing it: looked at again before the editor says so.
      brokenLooks.current += 1;
      if (brokenLooks.current >= BROKEN_LOOKS) {
        setIssue('broken');
      }

      return true;
    }

    brokenLooks.current = 0;
    stamp.current = now;
    if (action === 'load') {
      take(read);
      return true;
    }

    pending.current = read;
    setIssue('conflict');
    return true;
  }, [handle, take]);

  /** Writes the draft, unless another program changed the file since the editor knew it. */
  const save = useCallback(
    (toSave: Draft, force = false) =>
      serially(async () => {
        if (toSave === saved.current) {
          return;
        }

        setState('saving');
        try {
          if (!force && (await look())) {
            // A change by another program came first; `look` decided what follows.
            setState((now) => (now === 'saving' ? 'unsaved' : now));
            return;
          }

          stamp.current = await writeDraft(handle, toSave);
          saved.current = toSave;
          brokenLooks.current = 0;
          setState(current.current === toSave ? 'saved' : 'unsaved');
        } catch {
          setState('failed');
        }
      }),
    [handle, look, serially],
  );

  // A change is written a moment after it is made; not while the author is to choose.
  useEffect(() => {
    if (draft === saved.current) {
      return undefined;
    }

    setState('unsaved');
    if (issue !== undefined) {
      return undefined;
    }

    const timer = setTimeout(() => {
      void save(draft);
    }, SAVE_DELAY);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, issue, save]);

  // A write to a file does not outlive the page, so a page left with a change asks first.
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (current.current !== saved.current) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', leave);
    return () => {
      window.removeEventListener('beforeunload', leave);
    };
  }, []);

  // Changes by another program: looked for each second while the page is shown, on coming back to
  // it, and at once where the browser reports them.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      void serially(async () => {
        try {
          await look();
        } catch {
          setState('failed');
        }
      });
    };

    const timer = setInterval(check, WATCH_INTERVAL);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    let observer: FileSystemObserver | undefined;
    if (typeof FileSystemObserver === 'function') {
      try {
        observer = new FileSystemObserver(check);
        observer.observe(handle).catch(() => {});
      } catch {
        observer = undefined;
      }
    }

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      observer?.disconnect();
    };
  }, [handle, look, serially]);

  useEffect(
    () => () => {
      clearTimeout(loadedTimer.current);
    },
    [],
  );

  return {
    state,
    issue,
    loadFromDisk: () => {
      const read = pending.current;
      if (read !== undefined) {
        take(read);
      }
    },
    overwrite: () => {
      pending.current = undefined;
      brokenLooks.current = 0;
      setIssue(undefined);
      void serially(async () => {
        stamp.current = stampOf(await handle.getFile());
      }).then(() => save(current.current, true));
    },
    flush: async () => {
      if (issueRef.current === undefined) {
        await save(current.current, true);
      }
    },
  };
};

/** What the author chose to do with the files. */
export interface FileActions {
  readonly onNew: () => void;
  readonly onOpen: () => void;
  readonly onSaveAs: () => void;
}

/** The menu of the draft's files: a new one, another one, or the draft as a new version. */
export const FileMenu = ({
  name,
  onNew,
  onOpen,
  onSaveAs,
}: FileActions & { readonly name: string }) => (
  <ToolbarMenu>
    <DropdownMenuTrigger asChild>
      <Button variant='ghost' size='sm'>
        <IconFile /> Soubor <IconChevronDown className='opacity-60' />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='start' className='w-72'>
      <DropdownMenuItem onSelect={onNew}>
        <IconFilePlus /> Nový koncept…
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onOpen}>
        <IconFolderOpen /> Otevřít koncept…
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onSaveAs}>
        <IconCopyPlus />
        <span className='flex flex-col'>
          Uložit jako novou verzi…
          <span className='text-xs text-muted-foreground'>
            Kopie vedle {name}; dál se píše do ní
          </span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </ToolbarMenu>
);

/** What to say and offer when saving waits for the author. */
export const FileIssueBar = ({
  issue,
  onLoad,
  onOverwrite,
}: {
  readonly issue: FileIssue | undefined;
  readonly onLoad: () => void;
  readonly onOverwrite: () => void;
}) => {
  if (issue === undefined) {
    return null;
  }

  return (
    <div
      role='alert'
      className='flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-amber-100 px-4 py-1.5 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100'
    >
      <span>
        {issue === 'conflict'
          ? 'Soubor se změnil mimo editor, zatímco tu byla neuložená změna. Ukládání čeká.'
          : 'Soubor nemá tvar konceptu, nejspíš ho upravuje jiný program. Ukládání čeká.'}
      </span>
      <span className='ml-auto flex gap-1'>
        {issue === 'conflict' && (
          <Button size='sm' variant='outline' onClick={onLoad}>
            Načíst ze souboru
          </Button>
        )}
        <Button size='sm' variant='outline' onClick={onOverwrite}>
          Přepsat mým konceptem
        </Button>
      </span>
    </div>
  );
};

/** Says why something went wrong, in the author's language. */
const failureText = (error: unknown) =>
  error instanceof Error ? error.message : 'Soubor se nepodařilo otevřít.';

/** The file chosen, with the ways to pick or make one. */
export const useFileChoice = () => {
  const [file, setFile] = useState<OpenedDraft>();
  /** Counts the files opened, so each one gets an editor of its own. */
  const [opened, setOpened] = useState(0);
  const [error, setError] = useState<string>();
  /** The file open last time, offered to go on in. */
  const [last, setLast] = useState<FileSystemFileHandle>();
  const [checking, setChecking] = useState(true);

  const use = useCallback((chosen: OpenedDraft | undefined) => {
    if (chosen === undefined) {
      return;
    }

    setError(undefined);
    setFile(chosen);
    setOpened((count) => count + 1);
    void rememberFile(chosen.handle);
  }, []);

  const attempt = useCallback(
    async (run: () => Promise<OpenedDraft | undefined>) => {
      try {
        use(await run());
      } catch (failure) {
        setError(failureText(failure));
      }
    },
    [use],
  );

  // The file open last time comes back at once when the browser still lets the editor write it.
  useEffect(() => {
    let left = false;
    void (async () => {
      const recalled = supportsFiles() ? await recallFile() : undefined;
      if (recalled === undefined || left) {
        setChecking(false);
        return;
      }

      try {
        if (await mayWrite(recalled)) {
          const read = await readDraft(recalled);
          if (!left) {
            setFile({ handle: recalled, ...read });
          }
        } else if (!left) {
          setLast(recalled);
        }
      } catch {
        // A file moved or gone since: offered no more.
      } finally {
        if (!left) {
          setChecking(false);
        }
      }
    })();

    return () => {
      left = true;
    };
  }, []);

  return {
    file,
    opened,
    error,
    last,
    checking,
    create: () => attempt(createDraftFile),
    open: () => attempt(openDraftFile),
    saveAs: (draft: Draft, current: FileSystemFileHandle) =>
      attempt(() => saveDraftAs(draft, current)),
    goOn: (handle: FileSystemFileHandle) =>
      attempt(async () => {
        if (!(await askToWrite(handle))) {
          return undefined;
        }

        return { handle, ...(await readDraft(handle)) };
      }),
  };
};

/** Before a file is open: start a new draft, open one, or go on in the last one. */
export const FileStart = ({
  error,
  last,
  checking,
  onNew,
  onOpen,
  onGoOn,
}: {
  readonly error: string | undefined;
  readonly last: FileSystemFileHandle | undefined;
  readonly checking: boolean;
  readonly onNew: () => void;
  readonly onOpen: () => void;
  readonly onGoOn: (handle: FileSystemFileHandle) => void;
}) => {
  if (!supportsFiles()) {
    return (
      <div className='mx-auto max-w-prose p-8 text-sm'>
        <h1 className='mb-2 text-lg font-semibold'>Editor potřebuje Chrome</h1>
        <p className='text-muted-foreground'>
          Editor ukládá koncept přímo do souboru na disku. To umí jen prohlížeče na Chromiu: Chrome,
          Edge, Arc a podobné. Safari ani Firefox to neumí.
        </p>
      </div>
    );
  }

  if (checking) {
    return <IconLoader2 className='m-8 size-6 animate-spin' />;
  }

  return (
    <div className='mx-auto flex max-w-prose flex-col gap-4 p-8 text-sm'>
      <div>
        <h1 className='mb-2 text-lg font-semibold'>Koncept příběhu</h1>
        <p className='text-muted-foreground'>
          Editor ukládá koncept průběžně do souboru na vašem disku. Založte nový, nebo otevřete
          existující soubor JSON.
        </p>
      </div>
      <div className='flex flex-wrap gap-2'>
        {last !== undefined && (
          <Button
            onClick={() => {
              onGoOn(last);
            }}
          >
            <IconFile /> Pokračovat v {last.name}
          </Button>
        )}
        <Button variant={last === undefined ? 'default' : 'outline'} onClick={onNew}>
          <IconFilePlus /> Nový koncept…
        </Button>
        <Button variant='outline' onClick={onOpen}>
          <IconFolderOpen /> Otevřít koncept…
        </Button>
      </div>
      {error !== undefined && <p className='text-destructive'>{error}</p>}
    </div>
  );
};
