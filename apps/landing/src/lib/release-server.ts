import { LATEST_RELEASE_API, parseRelease, toReleaseInfo, type ReleaseInfo } from "./release";

export const RELEASE_REVALIDATE_SECONDS = 1800;

const GITHUB_ACCEPT_HEADER = "application/vnd.github+json";

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: GITHUB_ACCEPT_HEADER },
      next: { revalidate: RELEASE_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const release = parseRelease(await response.json());
    return release ? toReleaseInfo(release) : null;
  } catch {
    return null;
  }
}
