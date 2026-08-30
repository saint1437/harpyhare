"use client";

import { usePlatform } from "@/hooks/usePlatform";
import { cn } from "@/lib/cn";
import { PLATFORM_REQUIREMENTS } from "@/lib/platform";
import type { ReleaseInfo } from "@/lib/release";

export function VersionNote({
  release,
  className,
}: {
  release: ReleaseInfo | null;
  className?: string;
}) {
  const requirements = PLATFORM_REQUIREMENTS[usePlatform()];
  return (
    <span className={cn("text-[12.5px] text-fg-subtle", className)}>
      {release ? `v${release.version} · ${requirements}` : requirements}
    </span>
  );
}
