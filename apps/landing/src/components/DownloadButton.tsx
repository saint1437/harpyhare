"use client";

import { usePlatform } from "@/hooks/usePlatform";
import { cn } from "@/lib/cn";
import { downloadHref, type ReleaseInfo } from "@/lib/release";

interface DownloadButtonProps {
  release: ReleaseInfo | null;
  label: string;
  className?: string;
}

export function DownloadButton({ release, label, className }: DownloadButtonProps) {
  return (
    <a
      href={downloadHref(release, usePlatform())}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 bg-ink px-4 py-3 font-display text-[10px] font-medium tracking-[0.04em] text-fg uppercase transition-colors hover:bg-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:px-5 sm:text-[12px]",
        className,
      )}
    >
      {label}
      <span aria-hidden>↓</span>
    </a>
  );
}
