import { RELEASES_REPO_URL } from "@harpyhare/release-contract/client";
import type { Platform } from "./platform";

/**
 * The half of the release story the browser needs: where the latest release
 * lives and which file to hand this visitor.
 *
 * Everything that has to *recognise* an asset — `pickPlatformAsset` and with it
 * `isPlatformInstallerName`, `assetName`, `installerAssetName` and the
 * `release-assets.json` manifest behind them — moved to `release-server.ts`.
 * Three Client Components import this module, so the naming contract used to be
 * shipped to every visitor although nothing in the browser ever matches a name:
 * the server has already resolved the URLs by the time the page is rendered.
 *
 * Moving it was not enough on its own. `RELEASES_PAGE` is built from the
 * repository slug, and the slug used to come from the package's only entry
 * point — so the client chunk still carried the `platforms` block and three
 * dead `Object.values(...)` statements, because a bundler cannot drop what a
 * live import evaluates. `@harpyhare/release-contract/client` is that entry
 * point's browser-safe half, derived from the same JSON; its header explains
 * the split.
 */
export const RELEASES_PAGE = `${RELEASES_REPO_URL}/releases/latest`;

export type PlatformDownloads = Record<Platform, string>;

export interface ReleaseInfo {
  version: string;
  downloads: PlatformDownloads;
}

export function downloadHref(release: ReleaseInfo | null, platform: Platform): string {
  return release?.downloads[platform] ?? RELEASES_PAGE;
}
