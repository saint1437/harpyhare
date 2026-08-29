"use client";

import { usePlatform } from "@/hooks/usePlatform";
import { cn } from "@/lib/cn";
import { otherPlatform, PLATFORM_LABELS, PLATFORM_REQUIREMENTS } from "@/lib/platform";
import { downloadHref, type ReleaseInfo } from "@/lib/release";
import { PlatformText } from "./PlatformText";

interface DownloadChoiceProps {
  release: ReleaseInfo | null;
  primaryPrefix: string;
  className?: string;
}

export function DownloadChoice({ release, primaryPrefix, className }: DownloadChoiceProps) {
  const platform = usePlatform();
  const secondary = otherPlatform(platform);
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4", className)}>
      {/* Both labels are laid out on top of each other — see `PlatformText`:
          only `href` and `title` still change when the platform resolves, and
          neither of those has a width. */}
      <a
        href={downloadHref(release, platform)}
        title={PLATFORM_REQUIREMENTS[platform]}
        className="shadow-poster inline-flex items-center justify-center bg-fg px-7 py-4 text-center font-display text-[12px] font-bold tracking-[0.03em] text-bg-deep uppercase transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:px-8 sm:text-[13.5px]"
      >
        <PlatformText render={(current) => `${primaryPrefix} ${PLATFORM_LABELS[current]}`} />
      </a>
      <a
        href={downloadHref(release, secondary)}
        title={PLATFORM_REQUIREMENTS[secondary]}
        aria-label={`${primaryPrefix} ${PLATFORM_LABELS[secondary]}`}
        className="inline-flex items-center justify-center border-2 border-border-strong px-6 py-3.5 text-center font-display text-[12px] font-medium tracking-[0.03em] text-fg uppercase transition-colors hover:border-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:px-7 sm:text-[13.5px]"
      >
        <PlatformText render={(current) => PLATFORM_LABELS[otherPlatform(current)]} />
      </a>
    </div>
  );
}
