import { useMemo } from "react";
import { useDocumentKeydown } from "@/hooks/useDocumentKeydown";
import { matchesPrepared, prepareCombo } from "@/lib/hotkey-match";

export function useDuplicateChatKey(
  combo: string,
  enabled: boolean,
  onDuplicate: () => void,
): void {
  const prepared = useMemo(() => prepareCombo(combo), [combo]);

  useDocumentKeydown((e) => {
    if (e.repeat) return;
    if (!matchesPrepared(e, prepared)) return;
    e.preventDefault();
    onDuplicate();
  }, enabled);
}
