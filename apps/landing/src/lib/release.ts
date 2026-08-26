import {
  isPlatformInstallerName,
  RELEASES_REPO,
  RELEASES_REPO_URL,
} from "@harpyhare/release-contract";
import { PLATFORMS, type Platform } from "./platform";

export { RELEASES_REPO };
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
export const RELEASES_PAGE = `${RELEASES_REPO_URL}/releases/latest`;

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: GitHubAsset[];
}

export type PlatformDownloads = Record<Platform, string>;

export interface ReleaseInfo {
  version: string;
  downloads: PlatformDownloads;
}

export function stripVersionPrefix(tag: string): string {
  return tag.replace(/^v/i, "");
}

/**
 * Which asset a visitor on this platform should get. The suffixes are not
 * listed here any more: they come from `@harpyhare/release-contract`, the same
 * module `scripts/release.mjs` builds the names with — this file used to look
 * for `.msi`/`.exe` installers that are never produced and to filter a
 * `.nsis.zip` that does not exist either.
 */
export function pickPlatformAsset(
  assets: GitHubAsset[],
  platform: Platform,
): GitHubAsset | undefined {
  return assets.find((asset) => isPlatformInstallerName(asset.name, platform));
}

function collectDownloads(assets: GitHubAsset[]): PlatformDownloads {
  const entries = PLATFORMS.map((platform) => [
    platform,
    pickPlatformAsset(assets, platform)?.browser_download_url ?? RELEASES_PAGE,
  ]);
  return Object.fromEntries(entries) as PlatformDownloads;
}

export function toReleaseInfo(release: GitHubRelease): ReleaseInfo {
  return {
    version: stripVersionPrefix(release.tag_name),
    downloads: collectDownloads(release.assets),
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

export function downloadHref(release: ReleaseInfo | null, platform: Platform): string {
  return release?.downloads[platform] ?? RELEASES_PAGE;
}

export function parseRelease(data: unknown): GitHubRelease | null {
  if (!isRecord(data)) return null;
  const tag = data["tag_name"];
  const htmlUrl = data["html_url"];
  if (typeof tag !== "string" || typeof htmlUrl !== "string") return null;

  const assets = data["assets"];
  return {
    tag_name: tag,
    html_url: htmlUrl,
    assets: Array.isArray(assets) ? assets.filter(isAsset) : [],
  };
}
