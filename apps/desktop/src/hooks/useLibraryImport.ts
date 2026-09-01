import { useCallback, useState } from "react";
import type { ContextLibraryApi } from "@/hooks/useContextLibrary";
import { readContextImportFile, readContextPdfBytes } from "@/ipc/commands";
import { arrayBufferToBase64 } from "@/lib/base64";
import { docNameFromFileName, isPdfFileName } from "@/lib/context-library";

export interface LibraryImportApi {
  error: string | null;
  clearError: () => void;
  importPaths: (paths: string[], folderId: string) => void;
  importFiles: (files: FileList, folderId: string) => void;
}

function importErrorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function pickedFileText(file: File): Promise<string> {
  if (!isPdfFileName(file.name)) return file.text();
  return readContextPdfBytes(arrayBufferToBase64(await file.arrayBuffer()));
}

export function useLibraryImport(addDoc: ContextLibraryApi["addDoc"]): LibraryImportApi {
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const importPaths = useCallback(
    (paths: string[], folderId: string) => {
      setError(null);
      for (const path of paths) {
        void readContextImportFile(path)
          .then((text) => {
            addDoc({ name: docNameFromFileName(path), text, folderId });
          })
          .catch((e: unknown) => {
            setError(importErrorText(e));
          });
      }
    },
    [addDoc],
  );

  const importFiles = useCallback(
    (files: FileList, folderId: string) => {
      setError(null);
      for (const file of Array.from(files)) {
        void pickedFileText(file)
          .then((text) => {
            addDoc({ name: docNameFromFileName(file.name), text, folderId });
          })
          .catch((e: unknown) => {
            setError(importErrorText(e));
          });
      }
    },
    [addDoc],
  );

  return { error, clearError, importPaths, importFiles };
}
