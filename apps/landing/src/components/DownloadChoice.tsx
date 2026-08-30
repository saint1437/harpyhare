"use client";

import { usePlatform } from "@/hooks/usePlatform";
import { cn } from "@/lib/cn";
import { otherPlatform, PLATFORM_LABELS, PLATFORM_REQUIREMENTS } from "@/lib/platform";
import { downloadHref, type ReleaseInfo } from "@/lib/release";

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
      <a
        href={downloadHref(release, platform)}
        title={PLATFORM_REQUIREMENTS[platform]}
        className="shadow-poster inline-flex items-center justify-center bg-fg px-7 py-4 text-center font-display text-[12px] font-bold tracking-[0.03em] text-bg-deep uppercase transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:px-8 sm:text-[13.5px]"
      >
        {`${primaryPrefix} ${PLATFORM_LABELS[platform]}`}
      </a>
      <a
        href={downloadHref(release, secondary)}
        title={PLATFORM_REQUIREMENTS[secondary]}
        aria-label={`${primaryPrefix} ${PLATFORM_LABELS[secondary]}`}
        className="inline-flex items-center justify-center border-2 border-border-strong px-6 py-3.5 text-center font-display text-[12px] font-medium tracking-[0.03em] text-fg uppercase transition-colors hover:border-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:px-7 sm:text-[13.5px]"
      >
        {PLATFORM_LABELS[secondary]}
      </a>
    </div>
  );
}
