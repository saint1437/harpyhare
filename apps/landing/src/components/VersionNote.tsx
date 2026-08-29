"use client";

import { cn } from "@/lib/cn";
import { PLATFORM_REQUIREMENTS } from "@/lib/platform";
import { PlatformText } from "./PlatformText";

/**
 * `version` rather than the whole `ReleaseInfo`: props of a Client Component
 * are serialised into the inline RSC payload, once per instance, and the
 * download URLs in `ReleaseInfo` are of no use to a line of text.
 */
export function VersionNote({
  version,
  className,
}: {
  version: string | null;
  className?: string;
}) {
  return (
    <span className={cn("text-[12.5px] text-fg-subtle", className)}>
      <PlatformText
        render={(platform) =>
          version === null
            ? PLATFORM_REQUIREMENTS[platform]
            : `v${version} · ${PLATFORM_REQUIREMENTS[platform]}`
        }
      />
    </span>
  );
}
