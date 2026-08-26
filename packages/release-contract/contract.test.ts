import { PLATFORMS } from "@harpyhare/platform";
import { describe, expect, it } from "vitest";
import {
  ASSET_SLUG,
  installerAssetName,
  isInstallerAssetName,
  isPlatformInstallerName,
  RELEASE_PLATFORMS,
  REQUIRED_UPDATER_TARGETS,
  SIGNATURE_SUFFIX,
  UPDATER_MANIFEST_NAME,
  UPDATER_ONLY_SUFFIXES,
  updaterAssetName,
} from "./contract.js";

const VERSION = "1.2.3";
const ARCH_BY_PLATFORM = { macos: "aarch64", windows: "x86_64" } as const;

describe("the manifest covers exactly the supported platforms", () => {
  it("has an entry per platform of @harpyhare/platform", () => {
    expect(Object.keys(RELEASE_PLATFORMS).sort()).toEqual([...PLATFORMS].sort());
  });

  it("names an updater target per platform, and the os half matches the platform", () => {
    expect(REQUIRED_UPDATER_TARGETS).toHaveLength(PLATFORMS.length);
    expect(RELEASE_PLATFORMS.macos.updaterTarget.startsWith("darwin-")).toBe(true);
    expect(RELEASE_PLATFORMS.windows.updaterTarget.startsWith("windows-")).toBe(true);
  });
});

// This is the check the three copies of the scheme never had: the names the
// release script produces are exactly the names the landing page looks for,
// because both go through this module.
describe("what the release script produces is what the landing page picks", () => {
  it("finds the installer for its own platform and for no other", () => {
    for (const platform of PLATFORMS) {
      const name = installerAssetName(platform, VERSION, ARCH_BY_PLATFORM[platform]);
      expect(isInstallerAssetName(name)).toBe(true);
      expect(isPlatformInstallerName(name, platform)).toBe(true);
      for (const other of PLATFORMS.filter((p) => p !== platform)) {
        expect(isPlatformInstallerName(name, other)).toBe(false);
      }
    }
  });

  it("keeps the macOS updater bundle out of the download links", () => {
    const name = updaterAssetName("macos", VERSION, ARCH_BY_PLATFORM.macos);
    expect(name.endsWith(".app.tar.gz")).toBe(true);
    expect(isInstallerAssetName(name)).toBe(false);
  });

  // On Windows the updater artifact IS the installer: the `-setup.exe` is what
  // tauri-plugin-updater downloads (WindowsUpdaterType::nsis, chosen from the
  // extension) and what a visitor runs. Filtering it out as "updater plumbing"
  // would leave the Windows download button pointing at the releases page.
  it("keeps the Windows setup, which is both installer and updater artifact", () => {
    const name = updaterAssetName("windows", VERSION, ARCH_BY_PLATFORM.windows);
    expect(name).toBe(installerAssetName("windows", VERSION, ARCH_BY_PLATFORM.windows));
    expect(isInstallerAssetName(name)).toBe(true);
  });

  it("filters the signatures and the updater manifest", () => {
    const updaterBundle = updaterAssetName("macos", VERSION, ARCH_BY_PLATFORM.macos);
    expect(isInstallerAssetName(`${updaterBundle}${SIGNATURE_SUFFIX}`)).toBe(false);
    expect(isInstallerAssetName(UPDATER_MANIFEST_NAME)).toBe(false);
    expect(UPDATER_ONLY_SUFFIXES).toContain(SIGNATURE_SUFFIX);
  });

  // GitHub replaces spaces in asset names, so the slug is ASCII and has none —
  // the product name ("Audio System") must never reach an asset name.
  it("uses the ASCII slug, never the product name", () => {
    for (const platform of PLATFORMS) {
      const name = installerAssetName(platform, VERSION, ARCH_BY_PLATFORM[platform]);
      expect(name.startsWith(`${ASSET_SLUG}_${VERSION}_`)).toBe(true);
      expect(name).not.toContain(" ");
    }
  });
});
