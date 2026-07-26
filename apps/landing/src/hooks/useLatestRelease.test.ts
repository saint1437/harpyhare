import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RELEASES_PAGE } from "@/lib/release";
import { useLatestRelease } from "./useLatestRelease";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubLatestRelease(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
  );
}

it("resolves to ready with an installer url per platform", async () => {
  stubLatestRelease({
    tag_name: "v0.9.0",
    html_url: "https://github.com/o/r/releases/tag/v0.9.0",
    published_at: "2026-07-05T10:00:00Z",
    assets: [
      { name: "app.dmg", browser_download_url: "https://dl/app.dmg" },
      { name: "app_x64-setup.exe", browser_download_url: "https://dl/app-setup.exe" },
      { name: "app_x64-setup.nsis.zip", browser_download_url: "https://dl/app.nsis.zip" },
    ],
  });

  const { result } = renderHook(() => useLatestRelease());

  await waitFor(() => {
    expect(result.current.status).toBe("ready");
  });
  if (result.current.status === "ready") {
    expect(result.current.release.version).toBe("0.9.0");
    expect(result.current.release.downloads.macos).toBe("https://dl/app.dmg");
    expect(result.current.release.downloads.windows).toBe("https://dl/app-setup.exe");
  }
});

it("points a platform without an installer at the releases page", async () => {
  stubLatestRelease({
    tag_name: "v0.9.0",
    html_url: "https://github.com/o/r/releases/tag/v0.9.0",
    assets: [{ name: "app.dmg", browser_download_url: "https://dl/app.dmg" }],
  });

  const { result } = renderHook(() => useLatestRelease());

  await waitFor(() => {
    expect(result.current.status).toBe("ready");
  });
  if (result.current.status === "ready") {
    expect(result.current.release.downloads.windows).toBe(RELEASES_PAGE);
  }
});

it("resolves to error on a rejected request", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const { result } = renderHook(() => useLatestRelease());
  await waitFor(() => {
    expect(result.current.status).toBe("error");
  });
});

it("resolves to error on a non-ok response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  const { result } = renderHook(() => useLatestRelease());
  await waitFor(() => {
    expect(result.current.status).toBe("error");
  });
});
