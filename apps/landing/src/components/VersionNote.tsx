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
  const platform = usePlatform();
  const requirements = PLATFORM_REQUIREMENTS[platform];
  return (
    <span className={cn("text-sm text-fg-subtle", className)}>
      {release ? `v${release.version} · ${requirements}` : requirements}
    </span>
  );
}
