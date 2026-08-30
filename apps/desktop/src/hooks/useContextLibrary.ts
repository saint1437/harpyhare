import { useCallback, useEffect, useRef, useState } from "react";
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

const SAVE_DEBOUNCE_MS = 500;

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
  const [library, setLibrary] = useState<ContextLibrary>(EMPTY_LIBRARY);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadContextLibrary().then((json) => {
      if (!live) return;
      const initial = deserializeLibrary(json);
      if (initial) setLibrary(initial);
      loaded.current = true;
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveContextLibrary(serializeLibrary(library));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(saveTimer.current);
    };
  }, [library]);

  return {
    library,
    addFolder: useCallback((name) => {
      setLibrary((lib) => addFolder(lib, name));
    }, []),
    renameFolder: useCallback((id, name) => {
      setLibrary((lib) => renameFolder(lib, id, name));
    }, []),
    removeFolder: useCallback((id) => {
      setLibrary((lib) => removeFolder(lib, id));
    }, []),
    addDoc: useCallback((doc) => {
      setLibrary((lib) => addDoc(lib, doc));
    }, []),
    updateDoc: useCallback((id, patch) => {
      setLibrary((lib) => updateDoc(lib, id, patch));
    }, []),
    removeDoc: useCallback((id) => {
      setLibrary((lib) => removeDoc(lib, id));
    }, []),
    moveDoc: useCallback((id, folderId) => {
      setLibrary((lib) => moveDoc(lib, id, folderId));
    }, []),
  };
}
