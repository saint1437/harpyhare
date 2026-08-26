import { useCallback } from "react";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { getDict } from "@/i18n";
import { loadContextLibrary, saveContextLibrary } from "@/ipc/commands";
import {
  addDoc,
  addFolder,
  deserializeLibrary,
  EMPTY_LIBRARY,
  moveDoc,
  removeDoc,
  removeFolder,
  renameFolder,
  serializeLibrary,
  updateDoc,
  type ContextDoc,
  type ContextLibrary,
} from "@/lib/context-library";
import { notifyError } from "@/lib/notifications";

export interface ContextLibraryApi {
  library: ContextLibrary;
  addFolder: (name: string) => void;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  addDoc: (doc: { name: string; text: string; folderId: string }) => void;
  updateDoc: (id: string, patch: Partial<Pick<ContextDoc, "name" | "text">>) => void;
  removeDoc: (id: string) => void;
  moveDoc: (id: string, folderId: string) => void;
}

export function useContextLibrary(): ContextLibraryApi {
  const { value: library, setValue: setLibrary } = usePersistedStore<ContextLibrary>({
    initial: EMPTY_LIBRARY,
    load: loadContextLibrary,
    save: saveContextLibrary,
    restore: (json) => deserializeLibrary(json) ?? EMPTY_LIBRARY,
    serialize: serializeLibrary,
    onLoadError: (message) => {
      notifyError(getDict().common.storage.libraryLoadFailed, message);
    },
    onSaveError: (message) => {
      notifyError(getDict().common.storage.librarySaveFailed, message);
    },
  });

  return {
    library,
    addFolder: useCallback(
      (name) => {
        setLibrary((lib) => addFolder(lib, name));
      },
      [setLibrary],
    ),
    renameFolder: useCallback(
      (id, name) => {
        setLibrary((lib) => renameFolder(lib, id, name));
      },
      [setLibrary],
    ),
    removeFolder: useCallback(
      (id) => {
        setLibrary((lib) => removeFolder(lib, id));
      },
      [setLibrary],
    ),
    addDoc: useCallback(
      (doc) => {
        setLibrary((lib) => addDoc(lib, doc));
      },
      [setLibrary],
    ),
    updateDoc: useCallback(
      (id, patch) => {
        setLibrary((lib) => updateDoc(lib, id, patch));
      },
      [setLibrary],
    ),
    removeDoc: useCallback(
      (id) => {
        setLibrary((lib) => removeDoc(lib, id));
      },
      [setLibrary],
    ),
    moveDoc: useCallback(
      (id, folderId) => {
        setLibrary((lib) => moveDoc(lib, id, folderId));
      },
      [setLibrary],
    ),
  };
}
