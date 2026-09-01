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

export function splitOpenFence(tail: string): [before: string, fenced: string] | null {
  const markers = [...tail.matchAll(FENCE_MARKER_RE)];
  const opener = (markers.length & 1) === 1 ? markers[markers.length - 1] : undefined;
  if (opener?.index === undefined) return null;
  return [tail.slice(0, opener.index), tail.slice(opener.index)];
}

const OPEN_FENCE_INFO = /^\s{0,3}(?:```|~~~)\s*([^\s`]*)/;

export function openFenceLanguage(fenced: string): string | null {
  const info = OPEN_FENCE_INFO.exec(fenced)?.[1] ?? "";
  return info === "" ? null : info.toLowerCase();
}

export function openFenceBody(fenced: string): string {
  const lineEnd = fenced.indexOf("\n");
  return lineEnd < 0 ? "" : fenced.slice(lineEnd + 1);
}

function insideFence(prefix: string): boolean {
  const fenceMarkerCount = prefix.match(FENCE_MARKER_RE)?.length ?? 0;
  return (fenceMarkerCount & 1) === 1;
}
