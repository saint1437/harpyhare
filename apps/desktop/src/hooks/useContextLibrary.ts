import { useCallback, useMemo } from "react";
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

  const addFolderCb = useCallback(
    (name: string) => {
      setLibrary((lib) => addFolder(lib, name));
    },
    [setLibrary],
  );
  const renameFolderCb = useCallback(
    (id: string, name: string) => {
      setLibrary((lib) => renameFolder(lib, id, name));
    },
    [setLibrary],
  );
  const removeFolderCb = useCallback(
    (id: string) => {
      setLibrary((lib) => removeFolder(lib, id));
    },
    [setLibrary],
  );
  const addDocCb = useCallback(
    (doc: { name: string; text: string; folderId: string }) => {
      setLibrary((lib) => addDoc(lib, doc));
    },
    [setLibrary],
  );
  const updateDocCb = useCallback(
    (id: string, patch: Partial<Pick<ContextDoc, "name" | "text">>) => {
      setLibrary((lib) => updateDoc(lib, id, patch));
    },
    [setLibrary],
  );
  const removeDocCb = useCallback(
    (id: string) => {
      setLibrary((lib) => removeDoc(lib, id));
    },
    [setLibrary],
  );
  const moveDocCb = useCallback(
    (id: string, folderId: string) => {
      setLibrary((lib) => moveDoc(lib, id, folderId));
    },
    [setLibrary],
  );

  // The object itself has to be stable, not only the callbacks in it: it is a
  // dependency of `ContextLibraryPanel`'s native-drop effect, so a new identity
  // on every `LauncherApp` render (a permission poll tick, a window focus, an
  // update-progress event) tore down `onDragDropEvent` and re-registered it
  // through an async IPC round trip — including once per file MID-DROP.
  return useMemo(
    () => ({
      library,
      addFolder: addFolderCb,
      renameFolder: renameFolderCb,
      removeFolder: removeFolderCb,
      addDoc: addDocCb,
      updateDoc: updateDocCb,
      removeDoc: removeDocCb,
      moveDoc: moveDocCb,
    }),
    [
      library,
      addFolderCb,
      renameFolderCb,
      removeFolderCb,
      addDocCb,
      updateDocCb,
      removeDocCb,
      moveDocCb,
    ],
  );
}
