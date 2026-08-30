import { describe, expect, it } from "vitest";
import {
  parseRelease,
  pickPlatformAsset,
  RELEASES_PAGE,
  stripVersionPrefix,
  toReleaseInfo,
  type GitHubAsset,
  type GitHubRelease,
} from "./release";

const DMG: GitHubAsset = {
  name: "harpyhare_0.9.0_aarch64.dmg",
  browser_download_url: "https://dl/app.dmg",
};
const NSIS_SETUP: GitHubAsset = {
  name: "harpyhare_0.9.0_x64-setup.exe",
  browser_download_url: "https://dl/app-setup.exe",
};
const UPDATER_ASSETS: GitHubAsset[] = [
  { name: "harpyhare_0.9.0_aarch64.app.tar.gz", browser_download_url: "https://dl/app.tar.gz" },
  { name: "harpyhare_0.9.0_aarch64.app.tar.gz.sig", browser_download_url: "https://dl/tar.sig" },
  { name: "harpyhare_0.9.0_x64-setup.nsis.zip", browser_download_url: "https://dl/nsis.zip" },
  { name: "harpyhare_0.9.0_x64-setup.nsis.zip.sig", browser_download_url: "https://dl/nsis.sig" },
  { name: "latest.json", browser_download_url: "https://dl/latest.json" },
];

describe("stripVersionPrefix", () => {
  it("removes a leading v", () => {
    expect(stripVersionPrefix("v0.4.0")).toBe("0.4.0");
    expect(stripVersionPrefix("V1.2.3")).toBe("1.2.3");
  });
  it("leaves a bare version untouched", () => {
    expect(stripVersionPrefix("0.4.0")).toBe("0.4.0");
  });
});

describe("pickPlatformAsset", () => {
  it("finds the .dmg asset regardless of case", () => {
    const dmg = pickPlatformAsset(
      [
        { name: "harpyhare_0.9.0_aarch64.app.tar.gz", browser_download_url: "u1" },
        { name: "harpyhare_0.9.0_aarch64.DMG", browser_download_url: "u2" },
      ],
      "macos",
    );
    expect(dmg?.browser_download_url).toBe("u2");
  });

  it("prefers the nsis installer over msi and plain exe", () => {
    const windows = pickPlatformAsset(
      [
        { name: "harpyhare_0.9.0_x64.exe", browser_download_url: "u1" },
        { name: "harpyhare_0.9.0_x64_en-US.msi", browser_download_url: "u2" },
        NSIS_SETUP,
      ],
      "windows",
    );
    expect(windows?.browser_download_url).toBe(NSIS_SETUP.browser_download_url);
  });

  it("falls back to the msi when there is no nsis installer", () => {
    const windows = pickPlatformAsset(
      [
        { name: "harpyhare_0.9.0_x64.exe", browser_download_url: "u1" },
        { name: "harpyhare_0.9.0_x64_en-US.msi", browser_download_url: "u2" },
      ],
      "windows",
    );
    expect(windows?.browser_download_url).toBe("u2");
  });

  it("falls back to a plain exe as the last resort", () => {
    const windows = pickPlatformAsset(
      [{ name: "harpyhare_0.9.0_x64.exe", browser_download_url: "u1" }],
      "windows",
    );
    expect(windows?.browser_download_url).toBe("u1");
  });

  it("never offers updater artifacts", () => {
    expect(pickPlatformAsset(UPDATER_ASSETS, "macos")).toBeUndefined();
    expect(pickPlatformAsset(UPDATER_ASSETS, "windows")).toBeUndefined();
  });

  it("returns undefined when the platform has no installer", () => {
    expect(pickPlatformAsset([DMG], "windows")).toBeUndefined();
    expect(pickPlatformAsset([NSIS_SETUP], "macos")).toBeUndefined();
  });
});

describe("toReleaseInfo", () => {
  const base: GitHubRelease = {
    tag_name: "v0.9.0",
    html_url: "https://github.com/o/r/releases/tag/v0.9.0",
    assets: [DMG, NSIS_SETUP, ...UPDATER_ASSETS],
  };

  it("maps every platform installer and strips the version prefix", () => {
    const info = toReleaseInfo(base);
    expect(info.version).toBe("0.9.0");
    expect(info.downloads.macos).toBe(DMG.browser_download_url);
    expect(info.downloads.windows).toBe(NSIS_SETUP.browser_download_url);
  });

  it("falls back to the releases page for a platform without an installer", () => {
    expect(toReleaseInfo({ ...base, assets: [DMG] }).downloads.windows).toBe(RELEASES_PAGE);
    expect(toReleaseInfo({ ...base, assets: [NSIS_SETUP] }).downloads.macos).toBe(RELEASES_PAGE);
  });

  it("falls back to the releases page when there are no assets at all", () => {
    const info = toReleaseInfo({ ...base, assets: [] });
    expect(info.downloads.macos).toBe(RELEASES_PAGE);
    expect(info.downloads.windows).toBe(RELEASES_PAGE);
  });
});

describe("parseRelease", () => {
  it("parses a well-formed payload and drops malformed assets", () => {
    const parsed = parseRelease({
      tag_name: "v0.4.0",
      html_url: "https://github.com/o/r/releases/tag/v0.4.0",
      published_at: "2026-07-05T10:00:00Z",
      assets: [
        { name: "app.dmg", browser_download_url: "https://dl/app.dmg" },
        { name: "broken" },
        "not-an-object",
      ],
    });
    expect(parsed?.tag_name).toBe("v0.4.0");
    expect(parsed?.assets).toHaveLength(1);
  });

  it("returns null for non-objects and missing required fields", () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease("nope")).toBeNull();
    expect(parseRelease({ html_url: "x" })).toBeNull();
    expect(parseRelease({ tag_name: "v1" })).toBeNull();
  });
});
