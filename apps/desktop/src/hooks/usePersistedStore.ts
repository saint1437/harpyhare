import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useLatestRef } from "./useLatestRef";

const DEFAULT_SAVE_DEBOUNCE_MS = 500;

/**
 * The protocol itself, with no opinion on where the value lives: load once,
 * hydrate, adopt, then debounce every change back to disk.
 */
export interface PersistedDocument<T> {
  load: () => Promise<string>;
  save: (json: string) => Promise<unknown>;
  restore: (json: string) => T;
  serialize: (value: T) => string;
  /**
   * A second async step that must finish BEFORE the value is adopted — chats
   * fetch their image bytes here. Returning `null` abandons the load: the store
   * stays unloaded, so the debounced save can never fire and overwrite the file.
   */
  hydrate?: (value: T) => Promise<T | null>;
  onLoadError?: (message: string) => void;
  onSaveError?: (message: string) => void;
  debounceMs?: number;
}

export interface PersistedStoreOptions<T> extends PersistedDocument<T> {
  /** The seed used until the file has been read — and if the file holds nothing. */
  initial: T;
  onLoaded?: (value: T) => void;
}

export interface PersistedStore<T> {
  value: T;
  setValue: Dispatch<SetStateAction<T>>;
  /** Whether the file has been read. Nothing is written before it has. */
  loaded: RefObject<boolean>;
}

/**
 * `null` means "do not adopt, and stay unloaded" — for both of the ways a read
 * can end without a document: a rejected `load` and a `hydrate` that abandoned
 * it. That is the second invariant below, and it lives here so neither hook can
 * express it differently.
 */
async function readDocument<T>(document: PersistedDocument<T>): Promise<T | null> {
  let restored: T;
  try {
    restored = document.restore(await document.load());
  } catch (e) {
    document.onLoadError?.(String(e));
    return null;
  }
  if (document.hydrate === undefined) return restored;
  return await document.hydrate(restored);
}

/**
 * The debounce fires on every publish, and plenty of them serialise to exactly
 * the document already on disk — an edit typed and undone, a store that
 * republishes an equal value. `context-library.json` is up to a hundred
 * materials of two hundred thousand characters, so the IPC round trip and the
 * disk write behind it are worth a string comparison we get for the price of
 * the serialisation we owed anyway.
 */
function writeDocument<T>(
  document: PersistedDocument<T>,
  value: T,
  lastWritten: RefObject<string | null>,
): void {
  const json = document.serialize(value);
  if (json === lastWritten.current) return;
  lastWritten.current = json;
  void document.save(json).catch((e: unknown) => {
    // A write that failed is not a write: forget it, or the retry the next
    // identical edit would have carried gets skipped as a no-op.
    if (lastWritten.current === json) lastWritten.current = null;
    document.onSaveError?.(String(e));
  });
}

/**
 * `chats.json` and `context-library.json` are the same forty-line protocol —
 * load once, hydrate, adopt, then debounce every change back to disk — and it
 * was written twice, with the two copies differing in exactly the places that
 * matter: one had a guard against an empty initial state overwriting real data
 * and the other did not.
 *
 * Two invariants live here rather than in the callers, and they hold for the
 * external-store variant below just as much:
 *
 * - **Nothing is written until the file has been read.** The debounce starts at
 *   `loaded`, so the empty startup state cannot land on disk in the 500 ms
 *   before the read comes back.
 * - **A failed read is not an empty document.** Rust answers `Ok(None)` only
 *   for "the file does not exist" and rejects on anything else; a rejected load
 *   leaves the store unloaded forever, which is what keeps a permission error
 *   or a corrupt file from being "fixed" by overwriting it with nothing.
 */
export function usePersistedStore<T>(options: PersistedStoreOptions<T>): PersistedStore<T> {
  const [value, setValue] = useState<T>(options.initial);
  const loaded = useRef(false);
  const opts = useLatestRef(options);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    // Read through a function, not the variable: TypeScript narrows a `let`
    // that is only reassigned inside the cleanup closure to its initial value,
    // and the unmount guard would be compiled away as dead code.
    const isLive = () => live;
    void (async () => {
      const o = opts.current;
      const adopted = await readDocument(o);
      if (adopted === null || !isLive()) return;
      setValue(adopted);
      loaded.current = true;
      o.onLoaded?.(adopted);
    })();
    return () => {
      live = false;
    };
  }, [opts]);

  useEffect(() => {
    if (!loaded.current) return;
    const o = opts.current;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      writeDocument(opts.current, value, lastWritten);
    }, o.debounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(saveTimer.current);
    };
  }, [value, opts]);

  return { value, setValue, loaded };
}

export interface PersistedExternalStoreOptions<T> extends PersistedDocument<T> {
  subscribe: (listener: () => void) => () => void;
  read: () => T;
  adopt: (value: T) => void;
}

/**
 * The same protocol for a value that lives in a module singleton rather than in
 * React state (`state/chats`). The difference is what drives the write: there
 * is no `value` in a dependency array to watch, so the debounce hangs off the
 * store's own subscription — and that is the point. A hook that re-rendered on
 * every change of the chats would put the draft back into the render path of
 * whichever component mounted it, which is precisely what moving the chats out
 * of the root was for.
 */
export function usePersistedExternalStore<T>(
  options: PersistedExternalStoreOptions<T>,
): RefObject<boolean> {
  const loaded = useRef(false);
  const opts = useLatestRef(options);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    const isLive = () => live;
    void (async () => {
      const o = opts.current;
      const adopted = await readDocument(o);
      if (adopted === null || !isLive()) return;
      o.adopt(adopted);
      loaded.current = true;
    })();
    return () => {
      live = false;
    };
  }, [opts]);

  useEffect(() => {
    const unsubscribe = opts.current.subscribe(() => {
      if (!loaded.current) return;
      const o = opts.current;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        writeDocument(opts.current, opts.current.read(), lastWritten);
      }, o.debounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(saveTimer.current);
    };
  }, [opts]);

  return loaded;
}
