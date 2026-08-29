"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { DemoCopy } from "@/i18n/demo-types";

/**
 * The demo, mounted when the reader is on their way to it.
 *
 * It is section four of eight and by far the heaviest thing on the page: ~3,300
 * lines of Client Component across a dozen files, `useDemoRun`, and some fifty
 * lucide icons. Imported statically it was a `<script async>` in the head that
 * had to be parsed, executed and hydrated before the main thread was free — on
 * a page whose hero uses none of it. That is TBT and INP paid at the top of the
 * page for a widget nobody has scrolled to yet.
 *
 * `next/dynamic` alone does not fix it, and that is worth writing down: with
 * `ssr` left on, React still needs the chunk to hydrate the markup it just
 * rendered, so Next keeps it in the route's eager chunk group. Measured on this
 * page — same `<script async>` in the head, same bytes. Deferring it really
 * means not server-rendering it.
 *
 * So `ssr: false`, and the trade is deliberate: what leaves the HTML is the
 * simulated app's own chrome — window buttons, settings labels, the sample
 * transcript. The section's actual copy (heading, lead, the three cards) is
 * server-rendered by `WindowSection` and untouched, so nothing a search engine
 * reads this page for is lost; the demo is an interactive toy that needs
 * JavaScript to mean anything.
 *
 * The mount is deliberately early rather than just-in-time. The placeholder
 * reserves the frame exactly, but not the three rows of chips and the caption
 * under it: those wrap, and measured across 320–1536px they run anywhere from
 * 156 to 339px, so no breakpointed `min-height` reserves them without
 * over-reserving somewhere and shifting the other way. `MOUNT_MARGIN` solves it
 * instead — it is wider than the distance from the fold to the demo on a normal
 * desktop viewport, so the swap happens right after hydration with the section
 * still ~1,500px below the fold, and off-screen growth is not a layout shift.
 * On a narrow viewport, where the page is far taller, it degrades to an
 * ordinary lazy mount with 1,800px of lead. None of this affects the saving
 * being made: `ssr: false` is what keeps the chunk out of the eager group, so
 * it is fetched and parsed after hydration whenever the mount happens.
 */
const AppDemo = dynamic(async () => (await import("./AppDemo")).AppDemo, { ssr: false });

/** How far ahead of the viewport the demo starts loading. */
const MOUNT_MARGIN = "1800px";

export function AppDemoSection({ copy }: { copy: DemoCopy }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (anchor === null) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      // No observer, no cleverness: the demo is worth more than the deferral.
      setMounted(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: MOUNT_MARGIN },
    );
    observer.observe(anchor);
    return () => {
      observer.disconnect();
    };
  }, []);

  if (mounted) return <AppDemo copy={copy} />;

  /* The same box the demo's frame occupies — the border and the fixed height
     are copied from `AppDemo`, not approximated. */
  return (
    <div className="relative mx-auto mt-10 w-full sm:mt-12">
      <div
        ref={anchorRef}
        data-app-theme="black"
        className="app-window app-desktop shadow-poster sm:shadow-poster-lg relative overflow-hidden border-2 border-fg"
      >
        <div className="h-[440px] sm:h-[560px] lg:h-[640px]" />
      </div>
    </div>
  );
}
