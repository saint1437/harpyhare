import { Download } from "lucide-react";
import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { cn } from "@/lib/cn";
import { RELEASES_PAGE } from "@/lib/release";

const SIZES: Record<"lg" | "sm", string> = {
  lg: "gap-2.5 px-7 py-3.5 text-base",
  sm: "gap-2 px-4 py-2 text-sm",
};

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
        "inline-flex items-center justify-center rounded-full bg-primary font-semibold text-primary-fg shadow-[0_10px_34px_-10px_var(--glow)] transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        SIZES[size],
        className,
      )}
    >
      <Download className={size === "lg" ? "size-5" : "size-4"} strokeWidth={2.25} />
      {size === "lg" ? "Скачать приложение" : "Скачать"}
    </a>
  );
}
