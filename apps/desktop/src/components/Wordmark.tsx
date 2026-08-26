import { BRAND_NAME } from "@/lib/brand";

/**
 * The product's name, set as type rather than whispered.
 *
 * It used to be 10.5px mono at 55% alpha next to an animated equaliser — the
 * smallest, lowest-contrast piece of text in the app's own front door, beside a
 * glyph that also meant "your microphone is open". The equaliser moved to
 * `CaptureMeter`, where it means only that; the name stays here and is legible.
 */
export function Wordmark() {
  return (
    <h1 className="font-mono text-caption font-semibold tracking-wider text-fg-muted uppercase select-none">
      {BRAND_NAME}
    </h1>
  );
}
