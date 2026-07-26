"use client";

import { Download } from "lucide-react";
import { usePlatform } from "@/hooks/usePlatform";
import { cn } from "@/lib/cn";
import { downloadHref, type ReleaseInfo } from "@/lib/release";

interface DownloadButtonProps {
  release: ReleaseInfo | null;
  label: string;
  className?: string;
}

export function DownloadButton({ release, label, className }: DownloadButtonProps) {
  const platform = usePlatform();
  return (
    <a
      href={downloadHref(release, platform)}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      <Download className="size-4" strokeWidth={2.25} />
      {label}
    </a>
  );
}
