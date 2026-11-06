import { useCallback, useEffect, useRef, useState } from "react";
import { randomUuid } from "../../shared/random-uuid";

// A composer's unsent message survives a reload: the text in localStorage, attached files in IndexedDB (they can be
// large). Every composer and every open tab with the same key shows the same draft.
export interface DraftFile {
  id: string;
  name: string;
  type: string;
  size: number;
  // Line count for text files, shown on their tile.
  lines?: number;
  blob: Blob;
}

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const TEXT_KEY = (key: string) => `satgas.draft:${key}`;
const DB = "satgas";
const STORE = "draft-files";
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("satgas-drafts");

let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = run(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const loadFiles = (key: string) =>
  idb<DraftFile[] | undefined>("readonly", (s) => s.get(key)).then(
    (f) => f ?? [],
    () => [],
  );
const saveFiles = (key: string, files: DraftFile[]) =>
  (files.length ? idb("readwrite", (s) => s.put(files, key)) : idb("readwrite", (s) => s.delete(key))).catch(() => {});

const TEXT_TYPE = /^text\/|json|xml|yaml|javascript|typescript|csv|markdown/;
const TEXT_EXT = /\.(md|mdx|txt|csv|tsv|json|ya?ml|xml|html?|css|js|jsx|ts|tsx|py|go|rs|sh|sql|toml|ini|env)$/i;

async function toDraft(file: File): Promise<DraftFile> {
  const isText = TEXT_TYPE.test(file.type) || TEXT_EXT.test(file.name);
  const lines = isText && file.size < 2 * 1024 * 1024 ? (await file.text()).split("\n").length : undefined;
  return { id: randomUuid(), name: file.name || "pasted", type: file.type, size: file.size, lines, blob: file };
}

// A deleted board's unsent draft goes with it, text and files alike.
export async function dropDraft(key: string) {
  localStorage.removeItem(TEXT_KEY(key));
  await saveFiles(key, []);
  channel?.postMessage(key);
}

export interface Draft {
  text: string;
  files: DraftFile[];
  setText: (text: string) => void;
  // Answers with the names it could not take (too big, or over the limit).
  addFiles: (files: File[]) => Promise<{ tooBig: string[]; dropped: number }>;
  removeFile: (id: string) => void;
  clear: () => void;
}

export function useDraft(key: string): Draft {
  const [text, setTextState] = useState(() => localStorage.getItem(TEXT_KEY(key)) ?? "");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    let alive = true;
    setTextState(localStorage.getItem(TEXT_KEY(key)) ?? "");
    void loadFiles(key).then((f) => alive && setFiles(f));
    // Other tabs (and other composers) writing the same draft.
    const onStorage = (e: StorageEvent) => {
      if (e.key === TEXT_KEY(key)) setTextState(e.newValue ?? "");
    };
    const onMessage = (e: MessageEvent) => {
      if (e.data === key) void loadFiles(key).then((f) => alive && setFiles(f));
    };
    window.addEventListener("storage", onStorage);
    channel?.addEventListener("message", onMessage);
    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onMessage);
    };
  }, [key]);

  const setText = useCallback(
    (value: string) => {
      setTextState(value);
      if (value) localStorage.setItem(TEXT_KEY(key), value);
      else localStorage.removeItem(TEXT_KEY(key));
    },
    [key],
  );

  const store = useCallback(
    async (next: DraftFile[]) => {
      setFiles(next);
      await saveFiles(key, next);
      channel?.postMessage(key);
    },
    [key],
  );

  const addFiles = useCallback(
    async (list: File[]) => {
      const tooBig = list.filter((f) => f.size > MAX_FILE_BYTES).map((f) => f.name);
      const fitting = list.filter((f) => f.size <= MAX_FILE_BYTES);
      const room = Math.max(0, MAX_FILES - filesRef.current.length);
      const added = await Promise.all(fitting.slice(0, room).map(toDraft));
      if (added.length) await store([...filesRef.current, ...added]);
      return { tooBig, dropped: Math.max(0, fitting.length - room) };
    },
    [store],
  );

  const removeFile = useCallback((id: string) => void store(filesRef.current.filter((f) => f.id !== id)), [store]);

  const clear = useCallback(() => {
    setText("");
    void store([]);
  }, [setText, store]);

  return { text, files, setText, addFiles, removeFile, clear };
}
