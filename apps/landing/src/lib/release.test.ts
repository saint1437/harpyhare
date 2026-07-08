import { describe, expect, it } from "vitest";
import {
  parseRelease,
  pickDmgAsset,
  stripVersionPrefix,
  toReleaseInfo,
  type GitHubRelease,
} from "./release";

describe("stripVersionPrefix", () => {
  it("removes a leading v", () => {
    expect(stripVersionPrefix("v0.4.0")).toBe("0.4.0");
    expect(stripVersionPrefix("V1.2.3")).toBe("1.2.3");
  });
  it("leaves a bare version untouched", () => {
    expect(stripVersionPrefix("0.4.0")).toBe("0.4.0");
  });
});

describe("pickDmgAsset", () => {
  it("finds the .dmg asset regardless of case", () => {
    const dmg = pickDmgAsset([
      { name: "AudioSystem_0.4.0_aarch64.app.tar.gz", browser_download_url: "u1" },
      { name: "AudioSystem_0.4.0_aarch64.DMG", browser_download_url: "u2" },
    ]);
    expect(dmg?.browser_download_url).toBe("u2");
  });
  it("returns undefined when there is no dmg", () => {
    expect(pickDmgAsset([{ name: "latest.json", browser_download_url: "u" }])).toBeUndefined();
  });
});

describe("toReleaseInfo", () => {
  const base: GitHubRelease = {
    tag_name: "v0.4.0",
    html_url: "https://github.com/o/r/releases/tag/v0.4.0",
    assets: [{ name: "AudioSystem_0.4.0_aarch64.dmg", browser_download_url: "https://dl/app.dmg" }],
  };

  it("maps the dmg asset to the download url and strips the version prefix", () => {
    const info = toReleaseInfo(base);
    expect(info.version).toBe("0.4.0");
    expect(info.downloadUrl).toBe("https://dl/app.dmg");
  });

  it("falls back to the release page when there is no dmg", () => {
    const info = toReleaseInfo({ ...base, assets: [] });
    expect(info.downloadUrl).toBe(base.html_url);
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
