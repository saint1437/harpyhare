import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_MODELS, type ModelInfo } from "@/lib/models";
import { createQueryWrapper } from "@/test/query-wrapper";

const listModels = vi.fn<() => Promise<ModelInfo[]>>();
vi.mock("@/ipc/commands", () => ({
  listModels: () => listModels(),
}));

import { useModels } from "./useModels";

afterEach(() => {
  vi.clearAllMocks();
});

describe("useModels", () => {
  it("до ответа — фолбэк, после — список из API", async () => {
    const fetched: ModelInfo[] = [
      {
        id: "claude-sonnet-5",
        displayName: "Claude Sonnet 5",
        adaptive: true,
        alwaysThinks: false,
      },
      { id: "claude-fable-5", displayName: "Claude Fable 5", adaptive: true, alwaysThinks: true },
    ];
    listModels.mockResolvedValue(fetched);
    const { result } = renderHook(() => useModels(), { wrapper: createQueryWrapper() });
    expect(result.current).toBe(FALLBACK_MODELS);
    await waitFor(() => {
      expect(result.current).toEqual(fetched);
    });
  });

  it("пустой ответ — остаёмся на фолбэке", async () => {
    listModels.mockResolvedValue([]);
    const { result } = renderHook(() => useModels(), { wrapper: createQueryWrapper() });
    await waitFor(() => {
      expect(listModels).toHaveBeenCalled();
    });
    expect(result.current).toEqual(FALLBACK_MODELS);
  });
});
