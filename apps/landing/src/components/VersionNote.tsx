import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { cn } from "@/lib/cn";
import { PLATFORM_REQUIREMENTS, type Platform } from "@/lib/platform";

function versionLine(state: LatestReleaseState, platform: Platform): string {
  const requirements = PLATFORM_REQUIREMENTS[platform];
  if (state.status === "loading") return "Проверяем последнюю версию…";
  if (state.status === "error") return requirements;
  return `v${state.release.version} · ${requirements}`;
}

export function VersionNote({
  state,
  platform,
  className,
}: {
  state: LatestReleaseState;
  platform: Platform;
  className?: string;
}) {
  return (
    <span className={cn("text-sm text-fg-subtle", className)}>{versionLine(state, platform)}</span>
  );
}
