import { Download } from "lucide-react";
import { downloadHref, type LatestReleaseState } from "@/hooks/useLatestRelease";
import { cn } from "@/lib/cn";
import type { Platform } from "@/lib/platform";

const DOWNLOAD_LABEL = "Скачать";

interface DownloadButtonProps {
  state: LatestReleaseState;
  platform: Platform;
  className?: string;
}

export function DownloadButton({ state, platform, className }: DownloadButtonProps) {
  return (
    <a
      href={downloadHref(state, platform)}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      <Download className="size-4" strokeWidth={2.25} />
      {DOWNLOAD_LABEL}
    </a>
  );
}
