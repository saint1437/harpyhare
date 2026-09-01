import { useEffect, useMemo, useState } from "react";
import type { ContextDoc } from "@/lib/context-library";
import { buildNotesIndex, type NotesIndex } from "@/lib/notes-search";

export function useNotesIndex(docs: ContextDoc[], active: boolean): NotesIndex | null {
  const [everActive, setEverActive] = useState(active);

  useEffect(() => {
    if (active) setEverActive(true);
  }, [active]);

  return useMemo(() => (everActive ? buildNotesIndex(docs) : null), [everActive, docs]);
}
