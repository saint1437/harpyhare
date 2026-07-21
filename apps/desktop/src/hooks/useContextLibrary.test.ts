import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadContextLibrary = vi.fn<() => Promise<string>>(() => Promise.resolve(""));
const saveContextLibrary = vi.fn<(json: string) => Promise<void>>(() => Promise.resolve());

vi.mock("@/ipc/commands", () => ({
  loadContextLibrary: () => loadContextLibrary(),
  saveContextLibrary: (json: string) => saveContextLibrary(json),
}));

import { useContextLibrary } from "./useContextLibrary";

beforeEach(() => {
  loadContextLibrary.mockReset();
  loadContextLibrary.mockResolvedValue("");
  saveContextLibrary.mockClear();
});

afterEach(cleanup);

describe("useContextLibrary", () => {
  it("грузит библиотеку с диска", async () => {
    loadContextLibrary.mockResolvedValue(
      JSON.stringify({
        folders: [{ id: "f1", name: "Собесы" }],
        docs: [{ id: "d1", name: "Резюме", text: "т", folderId: "f1" }],
      }),
    );
    const { result } = renderHook(() => useContextLibrary());
    await waitFor(() => {
      expect(result.current.library.docs).toHaveLength(1);
    });
    expect(result.current.library.folders[0]?.name).toBe("Собесы");
  });

  it("правки сохраняются на диск с дебаунсом", async () => {
    const { result } = renderHook(() => useContextLibrary());
    await act(async () => Promise.resolve());
    act(() => {
      result.current.addFolder("Новая");
    });
    await waitFor(() => {
      expect(saveContextLibrary).toHaveBeenCalled();
    });
    const saved = saveContextLibrary.mock.calls[0]?.[0] ?? "";
    expect(saved).toContain("Новая");
  });

  it("addDoc + removeFolder переносит материал в корень", async () => {
    const { result } = renderHook(() => useContextLibrary());
    await act(async () => Promise.resolve());
    act(() => {
      result.current.addFolder("Папка");
    });
    const folderId = result.current.library.folders[0]?.id ?? "";
    act(() => {
      result.current.addDoc({ name: "Док", text: "т", folderId });
    });
    act(() => {
      result.current.removeFolder(folderId);
    });
    expect(result.current.library.folders).toHaveLength(0);
    expect(result.current.library.docs[0]?.folderId).toBe("");
  });
});
