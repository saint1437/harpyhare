import { detectPlatform, PLATFORM_MIN_VERSIONS, PLATFORMS } from "@harpyhare/platform";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLATFORM } from "./platform";

// detectPlatform itself is tested in @harpyhare/platform, where it now lives.
describe("PLATFORM", () => {
  it("вычислен из агента окружения и входит в список платформ", () => {
    expect(PLATFORMS).toContain(PLATFORM);
    expect(PLATFORM).toBe(detectPlatform(navigator.userAgent));
  });
});

// The README states the supported OS versions in prose — the third copy of the
// same fact. Nothing but this test connects it to the shared constant.
describe("README", () => {
  it("names the same minimum OS versions as @harpyhare/platform", () => {
    const readme = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../README.md"),
      "utf8",
    );
    for (const platform of PLATFORMS) {
      expect(readme).toContain(PLATFORM_MIN_VERSIONS[platform]);
    }
  });
});
