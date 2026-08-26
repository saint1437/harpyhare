import { useMemo } from "react";
import { useDocumentKeydown } from "@/hooks/useDocumentKeydown";
import { matchesModifier, parseModifier } from "@/lib/hotkey-modifier";
import { quickActionDigit } from "@/lib/quick-actions";

const DIGIT_CODE_PREFIX = "Digit";

function indexForDigit(digit: string, count: number): number | null {
  for (let index = 0; index < count; index += 1) {
    if (quickActionDigit(index) === digit) return index;
  }
  return null;
}

export function useQuickActionKeys(
  combo: string,
  count: number,
  onRun: (index: number) => void,
): void {
  const expected = useMemo(() => parseModifier(combo), [combo]);

  useDocumentKeydown((e) => {
    if (e.repeat) return;
    if (!e.code.startsWith(DIGIT_CODE_PREFIX)) return;
    if (!matchesModifier(e, expected)) return;
    const index = indexForDigit(e.code.slice(DIGIT_CODE_PREFIX.length), count);
    if (index === null) return;
    e.preventDefault();
    onRun(index);
  }, combo.trim() !== "");
}
