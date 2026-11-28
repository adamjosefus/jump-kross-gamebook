// The parts of the File System Access API the story editor uses that TypeScript's DOM library
// leaves out, as Chromium ships them: the file pickers, the permission of a handle and the
// observer of changes. Every one is optional at runtime; the editor checks before use.

interface FilePickerAcceptType {
  readonly description?: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

interface FilePickerOptions {
  readonly id?: string;
  readonly types?: readonly FilePickerAcceptType[];
  readonly excludeAcceptAllOption?: boolean;
  readonly startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads';
}

interface OpenFilePickerOptions extends FilePickerOptions {
  readonly multiple?: boolean;
}

interface SaveFilePickerOptions extends FilePickerOptions {
  readonly suggestedName?: string;
}

interface FileSystemHandlePermissionDescriptor {
  readonly mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemChangeRecord {
  readonly changedHandle: FileSystemHandle | null;
  readonly type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
}

interface FileSystemObserver {
  observe(handle: FileSystemHandle): Promise<void>;
  disconnect(): void;
}

declare var FileSystemObserver:
  | (new (
      callback: (records: readonly FileSystemChangeRecord[], observer: FileSystemObserver) => void,
    ) => FileSystemObserver)
  | undefined;

declare function showOpenFilePicker(
  options?: OpenFilePickerOptions,
): Promise<FileSystemFileHandle[]>;

declare function showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
