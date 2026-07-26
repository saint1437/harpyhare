import { describe, expect, it } from "vitest";
import { detectPlatform, PLATFORM_REQUIREMENTS, SUPPORTED_PLATFORMS_LABEL } from "./platform";

const WINDOWS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const MAC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const LINUX_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

describe("detectPlatform", () => {
  it("detects windows from a user agent string", () => {
    expect(detectPlatform(WINDOWS_USER_AGENT)).toBe("windows");
  });

  it("detects windows from a userAgentData platform hint", () => {
    expect(detectPlatform("Windows")).toBe("windows");
  });

  it("falls back to macos for everything else", () => {
    expect(detectPlatform(MAC_USER_AGENT)).toBe("macos");
    expect(detectPlatform("macOS")).toBe("macos");
    expect(detectPlatform(LINUX_USER_AGENT)).toBe("macos");
    expect(detectPlatform("")).toBe("macos");
  });
});

describe("platform copy", () => {
  it("names both platforms in the shared label", () => {
    expect(SUPPORTED_PLATFORMS_LABEL).toBe("macOS и Windows");
  });

  it("keeps one requirements line per platform", () => {
    expect(PLATFORM_REQUIREMENTS.macos).toContain("macOS");
    expect(PLATFORM_REQUIREMENTS.windows).toContain("Windows");
  });
});
