import { Download } from "lucide-react";
import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { cn } from "@/lib/cn";
import { PLATFORM_LABELS, type Platform } from "@/lib/platform";
import { RELEASES_PAGE } from "@/lib/release";

const DOWNLOAD_LABEL = "Скачать";

const SIZES = {
  lg: { root: "gap-2.5 px-7 py-3.5 text-base", icon: "size-5", namesPlatform: true },
  sm: { root: "gap-2 px-4 py-2 text-sm", icon: "size-4", namesPlatform: false },
} as const;

interface DownloadButtonProps {
  state: LatestReleaseState;
  platform: Platform;
  size?: keyof typeof SIZES;
  className?: string;
}

function resolveHref(state: LatestReleaseState, platform: Platform): string {
  return state.status === "ready" ? state.release.downloads[platform] : RELEASES_PAGE;
}

function resolveLabel(platform: Platform, namesPlatform: boolean): string {
  return namesPlatform ? `${DOWNLOAD_LABEL} для ${PLATFORM_LABELS[platform]}` : DOWNLOAD_LABEL;
}

export function DownloadButton({ state, platform, size = "lg", className }: DownloadButtonProps) {
  return (
    <a
      href={resolveHref(state, platform)}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        SIZES[size].root,
        className,
      )}
    >
      <Download className={SIZES[size].icon} strokeWidth={2.25} />
      {resolveLabel(platform, SIZES[size].namesPlatform)}
    </a>
  );
}
