export const RELEASES_REPO = "screenfriskofficial/harpyhare-releases";
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`;

const DMG_EXTENSION = ".dmg";

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
  assets: GitHubAsset[];
}

export interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  releaseUrl: string;
  publishedAt: string;
}

export function stripVersionPrefix(tag: string): string {
  return tag.replace(/^v/i, "");
}

export function pickDmgAsset(assets: GitHubAsset[]): GitHubAsset | undefined {
  return assets.find((asset) => asset.name.toLowerCase().endsWith(DMG_EXTENSION));
}

export function toReleaseInfo(release: GitHubRelease): ReleaseInfo {
  const dmg = pickDmgAsset(release.assets);
  return {
    version: stripVersionPrefix(release.tag_name),
    downloadUrl: dmg?.browser_download_url ?? release.html_url,
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAsset(value: unknown): value is GitHubAsset {
  return (
    isRecord(value) &&
    typeof value["name"] === "string" &&
    typeof value["browser_download_url"] === "string"
  );
}

export function parseRelease(data: unknown): GitHubRelease | null {
  if (!isRecord(data)) return null;
  const tag = data["tag_name"];
  const htmlUrl = data["html_url"];
  if (typeof tag !== "string" || typeof htmlUrl !== "string") return null;

  const assets = data["assets"];
  const name = data["name"];
  const publishedAt = data["published_at"];
  return {
    tag_name: tag,
    name: typeof name === "string" ? name : null,
    published_at: typeof publishedAt === "string" ? publishedAt : "",
    html_url: htmlUrl,
    assets: Array.isArray(assets) ? assets.filter(isAsset) : [],
  };
}
