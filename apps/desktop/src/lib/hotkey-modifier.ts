export interface ModifierState {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function parseModifier(spec: string): ModifierState {
  const parts = spec.split("+").map((p) => p.trim());
  return {
    metaKey: parts.includes("Cmd"),
    ctrlKey: parts.includes("Ctrl"),
    altKey: parts.includes("Alt"),
    shiftKey: parts.includes("Shift"),
  };
}

export function parseFamilyModifier(spec: string): ModifierState | null {
  return spec.trim() === "" ? null : parseModifier(spec);
}

export function matchesModifier(event: ModifierState, expected: ModifierState): boolean {
  return (
    event.metaKey === expected.metaKey &&
    event.ctrlKey === expected.ctrlKey &&
    event.altKey === expected.altKey &&
    event.shiftKey === expected.shiftKey
  );
}
