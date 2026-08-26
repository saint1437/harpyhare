import type { Platform } from "@harpyhare/platform";

export interface ReleasePlatform {
  /** The `latest.json` key the updater matches on: `{os}-{arch}`. */
  updaterTarget: string;
  /** What a visitor downloads from the site. */
  installerSuffix: string;
  /** What the updater downloads. On Windows it is the installer itself. */
  updaterArtifactSuffix: string;
}

export declare const RELEASES_REPO: string;
export declare const RELEASES_REPO_URL: string;
export declare const ASSET_SLUG: string;
export declare const UPDATER_MANIFEST_NAME: string;
export declare const SIGNATURE_SUFFIX: string;
export declare const RELEASE_PLATFORMS: Record<Platform, ReleasePlatform>;
export declare const REQUIRED_UPDATER_TARGETS: readonly string[];
export declare const UPDATER_ONLY_SUFFIXES: readonly string[];

export declare function assetName(parts: {
  slug?: string;
  version: string;
  arch: string;
  suffix: string;
}): string;
export declare function installerAssetName(
  platform: Platform,
  version: string,
  arch: string,
): string;
export declare function updaterAssetName(platform: Platform, version: string, arch: string): string;
export declare function isInstallerAssetName(name: string): boolean;
export declare function isPlatformInstallerName(name: string, platform: Platform): boolean;
