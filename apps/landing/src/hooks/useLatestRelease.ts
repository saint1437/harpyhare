import { useEffect, useState } from "react";
import { LATEST_RELEASE_API, parseRelease, toReleaseInfo, type ReleaseInfo } from "@/lib/release";

export type LatestReleaseState =
  { status: "loading" } | { status: "ready"; release: ReleaseInfo } | { status: "error" };

export function useLatestRelease(): LatestReleaseState {
  const [state, setState] = useState<LatestReleaseState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      const response = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error(`GitHub API ${response.status}`);
      const data: unknown = await response.json();
      if (!active) return;
      const release = parseRelease(data);
      setState(
        release ? { status: "ready", release: toReleaseInfo(release) } : { status: "error" },
      );
    };

    load().catch(() => {
      if (active) setState({ status: "error" });
    });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
