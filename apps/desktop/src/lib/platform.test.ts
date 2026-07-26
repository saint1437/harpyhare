import { describe, expect, it } from "vitest";
import { detectPlatform, PLATFORM, PLATFORMS } from "./platform";

const WEBVIEW2_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const WKWEBVIEW_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("detectPlatform", () => {
  it("WebView2 опознаётся как Windows", () => {
    expect(detectPlatform(WEBVIEW2_USER_AGENT)).toBe("windows");
  });

  it("WKWebView опознаётся как macOS", () => {
    expect(detectPlatform(WKWEBVIEW_USER_AGENT)).toBe("macos");
  });

  it("незнакомый агент считается macOS", () => {
    expect(detectPlatform("")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("macos");
  });

  it("регистр агента не важен", () => {
    expect(detectPlatform(WEBVIEW2_USER_AGENT.toLowerCase())).toBe("windows");
    expect(detectPlatform(WEBVIEW2_USER_AGENT.toUpperCase())).toBe("windows");
  });
});

describe("PLATFORM", () => {
  it("вычислен из агента окружения и входит в список платформ", () => {
    expect(PLATFORMS).toContain(PLATFORM);
    expect(PLATFORM).toBe(detectPlatform(navigator.userAgent));
  });
});
