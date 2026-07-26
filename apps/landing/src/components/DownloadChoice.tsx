"use client";

import { Download } from "lucide-react";
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
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-full border border-border-strong",
        className,
      )}
    >
      <a
        href={downloadHref(release, platform)}
        title={PLATFORM_REQUIREMENTS[platform]}
        className="inline-flex items-center gap-2.5 bg-primary px-7 py-3.5 text-base font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <Download className="size-5" strokeWidth={2.25} />
        {`${primaryPrefix} ${PLATFORM_LABELS[platform]}`}
      </a>
      <a
        href={downloadHref(release, secondary)}
        title={PLATFORM_REQUIREMENTS[secondary]}
        aria-label={`${primaryPrefix} ${PLATFORM_LABELS[secondary]}`}
        className="inline-flex items-center gap-2 border-l border-border-strong bg-bg-elevated px-5 py-3.5 text-base font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <Download className="size-4" strokeWidth={2.25} />
        {PLATFORM_LABELS[secondary]}
      </a>
    </div>
  );
}
