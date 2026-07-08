import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLatestRelease } from "./useLatestRelease";

afterEach(() => {
  vi.restoreAllMocks();
});

it("resolves to ready with the parsed dmg download url", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tag_name: "v0.4.0",
          html_url: "https://github.com/o/r/releases/tag/v0.4.0",
          published_at: "2026-07-05T10:00:00Z",
          assets: [{ name: "app.dmg", browser_download_url: "https://dl/app.dmg" }],
        }),
    }),
  );

  const { result } = renderHook(() => useLatestRelease());

  await waitFor(() => {
    expect(result.current.status).toBe("ready");
  });
  if (result.current.status === "ready") {
    expect(result.current.release.version).toBe("0.4.0");
    expect(result.current.release.downloadUrl).toBe("https://dl/app.dmg");
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
