"use client";

import { usePlatform } from "@/hooks/usePlatform";
import { cn } from "@/lib/cn";
import { PLATFORMS, type Platform } from "@/lib/platform";

/**
 * A run of text that differs per platform, laid out so that resolving the
 * platform cannot reflow the line.
 *
 * The page is statically generated, so the server has no user agent and
 * `usePlatform` only answers inside an effect: every visitor is served the
 * macOS markup and roughly half of them get it swapped a frame later. The
 * strings are not the same width — «Скачать для macOS» against «Скачать для
 * Windows», `macOS 14.2+ · Apple Silicon` against `Windows 10 (2004+) / 11 ·
 * x64` — and both live in a flex row directly under the `<h1>`, above the fold,
 * so the swap moved everything beside them. That is CLS for Windows visitors,
 * and CLS is scored on what actually happened, not on how briefly.
 *
 * Every variant is rendered into the same grid cell instead: the box is as wide
 * and as tall as the widest variant from the first paint on, and the swap only
 * moves `visibility` — which also keeps the inactive text out of the
 * accessibility tree. The reservation is measured by the browser from the real
 * strings in the real font, so no magic `min-width` has to be maintained.
 */
export function PlatformText({ render }: { render: (platform: Platform) => string }) {
  const active = usePlatform();
  return (
    <span className="inline-grid">
      {PLATFORMS.map((platform) => (
        <span
          key={platform}
          className={cn("col-start-1 row-start-1", platform !== active && "invisible")}
        >
          {render(platform)}
        </span>
      ))}
    </span>
  );
}
