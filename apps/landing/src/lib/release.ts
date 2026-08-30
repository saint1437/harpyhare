import { PLATFORMS, type Platform } from "./platform";

export const RELEASES_REPO = "screenfriskofficial/harpyhare-releases";
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`;

const PLATFORM_INSTALLER_SUFFIXES: Record<Platform, readonly string[]> = {
  macos: [".dmg"],
  windows: ["-setup.exe", ".msi", ".exe"],
};

const UPDATER_ARTIFACT_SUFFIXES = [".nsis.zip", ".app.tar.gz", ".sig"];
const UPDATER_MANIFEST_NAME = "latest.json";

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

function isInstallerAsset(asset: GitHubAsset): boolean {
  const name = asset.name.toLowerCase();
  if (name === UPDATER_MANIFEST_NAME) return false;
  return !UPDATER_ARTIFACT_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

export function pickPlatformAsset(
  assets: GitHubAsset[],
  platform: Platform,
): GitHubAsset | undefined {
  const installers = assets.filter(isInstallerAsset);
  for (const suffix of PLATFORM_INSTALLER_SUFFIXES[platform]) {
    const match = installers.find((asset) => asset.name.toLowerCase().endsWith(suffix));
    if (match) return match;
  }
  return undefined;
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
