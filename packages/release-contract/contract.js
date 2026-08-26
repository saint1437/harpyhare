import contract from "./release-assets.json" with { type: "json" };

/**
 * How a release asset is named, in one place.
 *
 * The scheme used to live in three: `scripts/release.mjs` produced the names,
 * `apps/landing/src/lib/release.ts` matched them to pick the download link, and
 * the Rust updater consumed the manifest that points at them. Renaming an asset
 * in the release script therefore broke the updater and the site's "Download"
 * button silently — nothing typechecked the three against each other.
 *
 * Rust cannot import a TypeScript package, so the source of truth is
 * `release-assets.json` (the same trick `config/presets.json` already uses:
 * a JSON import here, `include_str!` there) and this module is the JavaScript
 * side of it — plain JS with a `.d.ts` beside it, because the release script is
 * `node scripts/release.mjs` and a `.ts` entry would be unreachable from there.
 */
export const RELEASES_REPO = contract.releasesRepo;
export const RELEASES_REPO_URL = `https://github.com/${RELEASES_REPO}`;
export const ASSET_SLUG = contract.assetSlug;
export const UPDATER_MANIFEST_NAME = contract.updaterManifestName;
export const SIGNATURE_SUFFIX = contract.signatureSuffix;

/** Keyed by the ids of `@harpyhare/platform`. */
export const RELEASE_PLATFORMS = contract.platforms;

/** The `latest.json` keys the updater looks for — a release needs every one of them. */
export const REQUIRED_UPDATER_TARGETS = Object.values(contract.platforms).map(
  (platform) => platform.updaterTarget,
);

const INSTALLER_SUFFIXES = Object.values(contract.platforms).map(
  (platform) => platform.installerSuffix,
);

/**
 * Assets a human never downloads. Derived rather than listed, and that is the
 * point: on Windows the updater artifact IS the installer (`-setup.exe`), so it
 * must not be filtered out, while on macOS `.app.tar.gz` must. A hand-written
 * list got this wrong — it filtered `.nsis.zip`, which this pipeline has never
 * produced, and looked for `.msi`/`.exe` installers that do not exist either.
 */
export const UPDATER_ONLY_SUFFIXES = [
  ...new Set(
    Object.values(contract.platforms)
      .map((platform) => platform.updaterArtifactSuffix)
      .filter((suffix) => !INSTALLER_SUFFIXES.includes(suffix)),
  ),
  contract.signatureSuffix,
];

/** The one renderer both the release script and the checks go through. */
export function assetName({ slug = ASSET_SLUG, version, arch, suffix }) {
  return contract.assetNameTemplate
    .replace("{slug}", slug)
    .replace("{version}", version)
    .replace("{arch}", arch)
    .replace("{suffix}", suffix);
}

export function installerAssetName(platform, version, arch) {
  return assetName({ version, arch, suffix: contract.platforms[platform].installerSuffix });
}

export function updaterAssetName(platform, version, arch) {
  return assetName({ version, arch, suffix: contract.platforms[platform].updaterArtifactSuffix });
}

/** Something a visitor can download and run, as opposed to updater plumbing. */
export function isInstallerAssetName(name) {
  const lower = name.toLowerCase();
  if (lower === UPDATER_MANIFEST_NAME.toLowerCase()) return false;
  return !UPDATER_ONLY_SUFFIXES.some((suffix) => lower.endsWith(suffix.toLowerCase()));
}

export function isPlatformInstallerName(name, platform) {
  const suffix = contract.platforms[platform].installerSuffix.toLowerCase();
  return isInstallerAssetName(name) && name.toLowerCase().endsWith(suffix);
}
