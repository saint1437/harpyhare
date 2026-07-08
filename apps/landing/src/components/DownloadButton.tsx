import { Download } from "lucide-react";
import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { cn } from "@/lib/cn";
import { RELEASES_PAGE } from "@/lib/release";

const SIZES = {
  lg: { root: "gap-2.5 px-7 py-3.5 text-base", icon: "size-5", label: "Скачать для macOS" },
  sm: { root: "gap-2 px-4 py-2 text-sm", icon: "size-4", label: "Скачать" },
} as const;

interface DownloadButtonProps {
  state: LatestReleaseState;
  size?: "lg" | "sm";
  className?: string;
}

function resolveHref(state: LatestReleaseState): string {
  return state.status === "ready" ? state.release.downloadUrl : RELEASES_PAGE;
}

export function DownloadButton({ state, size = "lg", className }: DownloadButtonProps) {
  return (
    <a
      href={resolveHref(state)}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        SIZES[size].root,
        className,
      )}
    >
      <Download className={SIZES[size].icon} strokeWidth={2.25} />
      {SIZES[size].label}
    </a>
  );
}
