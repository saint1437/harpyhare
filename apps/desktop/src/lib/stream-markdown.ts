const PARAGRAPH_BOUNDARY = "\n\n";
const FENCE_MARKER_RE = /^\s{0,3}(?:```|~~~)/gm;

export function splitStableTail(text: string): [stable: string, tail: string] {
  let idx = text.lastIndexOf(PARAGRAPH_BOUNDARY);
  while (idx > 0) {
    if (!insideFence(text.slice(0, idx))) {
      const splitAt = idx + PARAGRAPH_BOUNDARY.length;
      return [text.slice(0, splitAt), text.slice(splitAt)];
    }
    idx = text.lastIndexOf(PARAGRAPH_BOUNDARY, idx - 1);
  }
  return ["", text];
}

function insideFence(prefix: string): boolean {
  const fenceMarkerCount = prefix.match(FENCE_MARKER_RE)?.length ?? 0;
  return (fenceMarkerCount & 1) === 1;
}
