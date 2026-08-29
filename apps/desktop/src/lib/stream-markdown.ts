const PARAGRAPH_BOUNDARY = "\n\n";
const FENCE_MARKER_RE = /^\s{0,3}(?:```|~~~)/gm;

/**
 * The stream calls this once per revealed frame with the SAME answer plus a few
 * more characters, and the walk below is what makes that expensive: while the
 * tail is an open code fence it steps back one paragraph at a time, and every
 * step re-counts the fence markers of the whole prefix — O(n·k) sixty times a
 * second, which is precisely the cost `splitStableTail` exists to avoid.
 *
 * The cure is one remembered answer. If the new text merely EXTENDS the one the
 * last call judged, then every boundary lying inside that older text is judged
 * against a byte-for-byte identical prefix, so its verdict cannot have changed:
 * the walk can stop at the first such boundary and hand back the split that was
 * found then. Only the appended part is ever scanned anew.
 *
 * It stays a function of its argument alone — text that is not an extension of
 * the remembered one is scanned in full, exactly as before — so the unit tests
 * (and two chats streaming at once, which thrash the memory) see no difference
 * beyond the speed.
 */
let lastText = "";
let lastStable = 0;

function remember(text: string, stable: number): [stable: string, tail: string] {
  lastText = text;
  lastStable = stable;
  return [text.slice(0, stable), text.slice(stable)];
}

export function splitStableTail(text: string): [stable: string, tail: string] {
  const extendsLast =
    lastText.length > 0 && text.length >= lastText.length && text.startsWith(lastText);
  let idx = text.lastIndexOf(PARAGRAPH_BOUNDARY);
  while (idx > 0) {
    // The boundary and everything before it are inside the remembered text, so
    // the verdict on it is the one already reached — and the answer that walk
    // arrived at is `lastStable`.
    if (extendsLast && idx + PARAGRAPH_BOUNDARY.length <= lastText.length) {
      return remember(text, lastStable);
    }
    if (!insideFence(text.slice(0, idx))) {
      return remember(text, idx + PARAGRAPH_BOUNDARY.length);
    }
    idx = text.lastIndexOf(PARAGRAPH_BOUNDARY, idx - 1);
  }
  return remember(text, 0);
}

function insideFence(prefix: string): boolean {
  const fenceMarkerCount = prefix.match(FENCE_MARKER_RE)?.length ?? 0;
  return (fenceMarkerCount & 1) === 1;
}
