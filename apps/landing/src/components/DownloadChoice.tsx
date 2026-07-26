import { Download } from "lucide-react";
import { downloadHref, type LatestReleaseState } from "@/hooks/useLatestRelease";
import { cn } from "@/lib/cn";
import {
  otherPlatform,
  PLATFORM_LABELS,
  PLATFORM_REQUIREMENTS,
  type Platform,
} from "@/lib/platform";

const PRIMARY_LABEL_PREFIX = "Скачать для";

interface DownloadChoiceProps {
  state: LatestReleaseState;
  platform: Platform;
  className?: string;
}

export function DownloadChoice({ state, platform, className }: DownloadChoiceProps) {
  const secondary = otherPlatform(platform);
  return (
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-full border border-border-strong",
        className,
      )}
    >
      <a
        href={downloadHref(state, platform)}
        title={PLATFORM_REQUIREMENTS[platform]}
        className="inline-flex items-center gap-2.5 bg-primary px-7 py-3.5 text-base font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <Download className="size-5" strokeWidth={2.25} />
        {`${PRIMARY_LABEL_PREFIX} ${PLATFORM_LABELS[platform]}`}
      </a>
      <a
        href={downloadHref(state, secondary)}
        title={PLATFORM_REQUIREMENTS[secondary]}
        aria-label={`${PRIMARY_LABEL_PREFIX} ${PLATFORM_LABELS[secondary]}`}
        className="inline-flex items-center gap-2 border-l border-border-strong bg-bg-elevated px-5 py-3.5 text-base font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <Download className="size-4" strokeWidth={2.25} />
        {PLATFORM_LABELS[secondary]}
      </a>
    </div>
  );
}
