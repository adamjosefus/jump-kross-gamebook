import type { Draft } from './draft';
import { draftFileText, EMPTY_DRAFT, parseDraft } from './draft-edit';

/**
 * The draft lives in a file on the author's disk, opened through the browser's File System Access
 * API: the editor reads it, writes it on every change and notices when another program writes it.
 */

/** What the file pickers offer: JSON files. */
const DRAFT_TYPES = [
  { description: 'Koncept příběhu (JSON)', accept: { 'application/json': ['.json'] } },
] as const;

/** The name a new draft's file is offered under. */
export const NEW_DRAFT_NAME = 'story-draft.json';

/** Whether this browser can open a file on the disk and write it back. */
export const supportsFiles = (): boolean =>
  typeof globalThis.showOpenFilePicker === 'function' &&
  typeof globalThis.showSaveFilePicker === 'function';

/** Whether a picker was closed without a choice, which is no error. */
export const isCancel = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/** What the file is like on the disk, to tell a write by another program from the editor's own. */
export interface FileStamp {
  readonly lastModified: number;
  readonly size: number;
}

export const stampOf = (file: File): FileStamp => ({
  lastModified: file.lastModified,
  size: file.size,
});

export const sameStamp = (left: FileStamp, right: FileStamp): boolean =>
  left.lastModified === right.lastModified && left.size === right.size;

/** A draft read from its file, with what the file was like when read. */
export interface ReadDraft {
  readonly draft: Draft;
  readonly stamp: FileStamp;
}

/** The file's text as a draft; undefined when it is no draft, e.g. half written by another program. */
export const draftOfText = (text: string): Draft | undefined => {
  try {
    return parseDraft(JSON.parse(text));
  } catch {
    return undefined;
  }
};

/** The draft in the file; an empty file is a new draft. Throws when the file holds no draft. */
export const readDraft = async (handle: FileSystemFileHandle): Promise<ReadDraft> => {
  const file = await handle.getFile();
  const text = await file.text();
  const draft = text.trim() === '' ? EMPTY_DRAFT : draftOfText(text);
  if (draft === undefined) {
    throw new Error(`Soubor ${handle.name} nemá tvar konceptu.`);
  }

  return { draft, stamp: stampOf(file) };
};

/**
 * Writes the draft into the file. The browser writes a copy and swaps it in on `close`, so a write
 * cut short never leaves half a file. Returns what the file is like after the write.
 */
export const writeDraft = async (
  handle: FileSystemFileHandle,
  draft: Draft,
): Promise<FileStamp> => {
  const writable = await handle.createWritable();
  try {
    await writable.write(draftFileText(draft));
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }

  return stampOf(await handle.getFile());
};

/** An open draft file and what was in it. */
export interface OpenedDraft extends ReadDraft {
  readonly handle: FileSystemFileHandle;
}

/** A draft file the author picks on the disk; undefined when the picker is closed. */
export const openDraftFile = async (): Promise<OpenedDraft | undefined> => {
  try {
    const [handle] = await globalThis.showOpenFilePicker({
      id: 'story-draft',
      types: DRAFT_TYPES,
      excludeAcceptAllOption: false,
      multiple: false,
    });
    if (handle === undefined) {
      return undefined;
    }

    return { handle, ...(await readDraft(handle)) };
  } catch (error) {
    if (isCancel(error)) {
      return undefined;
    }

    throw error;
  }
};

/**
 * Writes `draft` into a new file the author names, next to `near` when given; undefined when the
 * picker is closed.
 */
const saveNewFile = async (
  draft: Draft,
  suggestedName: string,
  near?: FileSystemFileHandle,
): Promise<OpenedDraft | undefined> => {
  try {
    const handle = await globalThis.showSaveFilePicker({
      id: 'story-draft',
      suggestedName,
      types: DRAFT_TYPES,
      ...(near === undefined ? {} : { startIn: near }),
    });
    return { handle, draft, stamp: await writeDraft(handle, draft) };
  } catch (error) {
    if (isCancel(error)) {
      return undefined;
    }

    throw error;
  }
};

/** A new file with an empty draft. */
export const createDraftFile = async (): Promise<OpenedDraft | undefined> =>
  saveNewFile(EMPTY_DRAFT, NEW_DRAFT_NAME);

/** The draft as a new version, in a new file offered next to the current one under the next number. */
export const saveDraftAs = async (
  draft: Draft,
  current: FileSystemFileHandle,
): Promise<OpenedDraft | undefined> => saveNewFile(draft, nextVersionName(current.name), current);

/**
 * The name of the next version of a file: a number added before the extension, or the number it
 * has raised by one. `pribeh.json` gives `pribeh-2.json`, `pribeh-2.json` gives `pribeh-3.json`.
 */
export const nextVersionName = (name: string): string => {
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name;
  const numbered = /^(.*)-(\d+)$/.exec(base);
  if (numbered !== null && numbered[1] !== '') {
    return `${numbered[1]}-${Number(numbered[2]) + 1}.json`;
  }

  return `${base === '' ? 'story-draft' : base}-2.json`;
};

/** How the editor stands with the file when it notices a change on the disk. */
export type LocalState = 'saved' | 'unsaved';

/** What another program left in the file: a draft, or something that is none (yet). */
export type DiskContent =
  | { readonly kind: 'draft'; readonly draft: Draft }
  | { readonly kind: 'broken' };

/**
 * What to do about a change of the file by another program:
 * - `load`: take the draft from the file, nothing of the editor's is lost;
 * - `conflict`: the editor has a change not written yet; the author chooses which one stays;
 * - `broken`: the file holds no draft; keep off it till it does or the author writes over it.
 */
export type ExternalChange = 'load' | 'conflict' | 'broken';

export const externalChange = (local: LocalState, disk: DiskContent): ExternalChange => {
  if (disk.kind === 'broken') {
    return 'broken';
  }

  return local === 'saved' ? 'load' : 'conflict';
};

/** IndexedDB where the last file is remembered, so the editor opens it again next time. */
const DATABASE = 'story-editor';
const STORE = 'files';
const LAST_FILE = 'last';

const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(STORE);
    });
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB'));
    });
  });

/** One request on the store, its result when done. */
const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const opened = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(opened.transaction(STORE, mode).objectStore(STORE));
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('IndexedDB'));
      });
    });
  } finally {
    opened.close();
  }
};

/** Remembers the file open now; a browser that keeps nothing simply forgets it. */
export const rememberFile = async (handle: FileSystemFileHandle): Promise<void> => {
  await withStore('readwrite', (store) => store.put(handle, LAST_FILE)).catch(() => {});
};

/** The file open last time, if the browser kept it. */
export const recallFile = async (): Promise<FileSystemFileHandle | undefined> => {
  try {
    const handle: unknown = await withStore('readonly', (store) => store.get(LAST_FILE));
    return handle instanceof FileSystemFileHandle ? handle : undefined;
  } catch {
    return undefined;
  }
};

/** Whether the editor may read and write the file without asking the author again. */
export const mayWrite = async (handle: FileSystemFileHandle): Promise<boolean> =>
  (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';

/** Asks the author to let the editor read and write the file; needs a click to ask. */
export const askToWrite = async (handle: FileSystemFileHandle): Promise<boolean> =>
  (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
