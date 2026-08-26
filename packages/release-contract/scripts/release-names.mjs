#!/usr/bin/env node
/**
 * The release workflow's copy of the naming scheme, replaced by a lookup.
 *
 * `.github/workflows/release.yml` was the fourth place the scheme lived: it
 * staged the artifacts under names typed into shell, and the only thing tying
 * those literals to `release-assets.json` was a test that compared strings.
 * Drift was caught, but the names were still written twice — and a workflow
 * cannot `import "@harpyhare/release-contract"` by package name, because the
 * publish job never runs `npm ci` and has no `node_modules`.
 *
 * So the workflow calls this file by path instead. It prints `KEY=value` lines
 * — the format `$GITHUB_ENV` and `$GITHUB_OUTPUT` both take — and every name it
 * prints comes out of the same `contract.js` that `apps/desktop/scripts/release.mjs`
 * builds its names with, so the two cannot disagree.
 *
 * Deliberately NOT printed: the paths tauri writes its bundles to
 * (`bundle/dmg/…`, `bundle/nsis/…`). Those are tauri's output naming, not the
 * release contract's, and inventing manifest fields for them would move a fact
 * that belongs to `tauri.conf.json` into a file Rust embeds.
 *
 *   node packages/release-contract/scripts/release-names.mjs --version 1.2.3
 *   node packages/release-contract/scripts/release-names.mjs --version 1.2.3 --target darwin-aarch64
 */
import { parseArgs } from "node:util";
import {
  ASSET_SLUG,
  installerAssetName,
  RELEASE_PLATFORMS,
  RELEASES_REPO,
  REQUIRED_UPDATER_TARGETS,
  SIGNATURE_SUFFIX,
  UPDATER_MANIFEST_NAME,
  updaterAssetName,
} from "../contract.js";

const VERSION_RE = /^\d+\.\d+\.\d+/;

const { values } = parseArgs({
  options: {
    version: { type: "string" },
    target: { type: "string" },
  },
});

const die = (message) => {
  console.error(`release-names: ${message}`);
  process.exit(1);
};

/** `{os}-{arch}` — the same key `latest.json` is indexed by and the matrix names. */
const platformOfTarget = (target) =>
  Object.keys(RELEASE_PLATFORMS).find(
    (platform) => RELEASE_PLATFORMS[platform].updaterTarget === target,
  );

const lines = [
  `RELEASES_REPO=${RELEASES_REPO}`,
  `ASSET_SLUG=${ASSET_SLUG}`,
  `MANIFEST_NAME=${UPDATER_MANIFEST_NAME}`,
  `SIGNATURE_SUFFIX=${SIGNATURE_SUFFIX}`,
  `REQUIRED_TARGETS=${REQUIRED_UPDATER_TARGETS.join(",")}`,
];

if (values.target !== undefined) {
  const platform = platformOfTarget(values.target);
  if (platform === undefined) {
    die(
      `unknown platform "${values.target}"; the contract has ${REQUIRED_UPDATER_TARGETS.join(", ")}`,
    );
  }
  if (values.version === undefined || !VERSION_RE.test(values.version)) {
    die(`--version is required with --target and must be X.Y.Z, got "${values.version}"`);
  }
  const entry = RELEASE_PLATFORMS[platform];
  // The arch half of the updater target IS the arch in the asset name: that is
  // the invariant release.mjs relies on when it picks `updaterArch` for the
  // Windows setup and `bundleArch` for the macOS dmg — on the two hosts the
  // product ships to, they are the same string.
  const arch = entry.updaterTarget.slice(entry.updaterTarget.indexOf("-") + 1);
  lines.push(
    `PLATFORM_KEY=${platform}`,
    `ASSET_ARCH=${arch}`,
    `INSTALLER_SUFFIX=${entry.installerSuffix}`,
    `UPDATER_SUFFIX=${entry.updaterArtifactSuffix}`,
    `INSTALLER_NAME=${installerAssetName(platform, values.version, arch)}`,
    `UPDATER_NAME=${updaterAssetName(platform, values.version, arch)}`,
  );
}

console.log(lines.join("\n"));
