import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { cn } from "@/lib/cn";

function versionLine(state: LatestReleaseState): string {
  if (state.status === "ready") return `v${state.release.version} · macOS 14.2+ · Apple Silicon`;
  if (state.status === "loading") return "Проверяем последнюю версию…";
  return "macOS 14.2+ · Apple Silicon";
}

export function VersionNote({
  state,
  className,
}: {
  state: LatestReleaseState;
  className?: string;
}) {
  return <span className={cn("text-sm text-fg-subtle", className)}>{versionLine(state)}</span>;
}
