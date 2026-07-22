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
  it("до ответа — фолбэк, после — курированный список из API", async () => {
    const sonnet: ModelInfo = {
      id: "claude-sonnet-5",
      displayName: "Claude Sonnet 5",
      adaptive: true,
      alwaysThinks: false,
    };
    const fable: ModelInfo = {
      id: "claude-fable-5",
      displayName: "Claude Fable 5",
      adaptive: true,
      alwaysThinks: true,
    };
    listModels.mockResolvedValue([sonnet, fable]);
    const { result } = renderHook(() => useModels(), { wrapper: createQueryWrapper() });
    expect(result.current).toBe(FALLBACK_MODELS);
    await waitFor(() => {
      expect(result.current).toEqual([sonnet]);
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
